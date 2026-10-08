import type { Category, Dev, Reading, Standing, Usage } from '../types'
import { besideOf, nameOf } from './branch'
import { compact, levelOf, longLimit, money, resetsIn, share, shortLimit } from './format'
import type { Level } from './format'

export type Slice = { name: string; tokens: number; color: string }

export type Card = {
  reading: Reading
  categories: readonly Category[]
  compactAt: number | null
  usage: Usage | null
  dev: Dev | null
  isCompact: boolean
  isLight: boolean
}

type Inks = { primary: string; secondary: string; muted: string }

// A category keeps its colour whatever its size: the hue follows the entity,
// in this fixed order, and everything unnamed folds into `other`. The six hues
// are the dark steps of a validated categorical palette (colour-blind safe in
// this order).
const SLOTS: readonly (readonly [string, string])[] = [
  ['messages', '#3987e5'],
  ['system tools', '#d95926'],
  ['mcp tools', '#199e70'],
  ['skills', '#c98500'],
  ['system prompt', '#d55181'],
  ['memory files', '#008300'],
]
const BLUE = '#3987e5'
const OTHER = '#898781'

// The status steps: the pill wears one, with the percentage as its label, so
// the colour never speaks alone.
const STATUS: Record<Level, { fill: string; ink: string }> = {
  good: { fill: '#0ca30c', ink: '#0b0b0b' },
  warning: { fill: '#fab219', ink: '#0b0b0b' },
  serious: { fill: '#ec835a', ink: '#0b0b0b' },
  critical: { fill: '#d03b3b', ink: '#ffffff' },
}

const DARK: Inks = { primary: '#f0eee6', secondary: '#c3c2b7', muted: '#898781' }
const LIGHT: Inks = { primary: '#0b0b0b', secondary: '#52514e', muted: '#898781' }
// The branch's name on the branch work is merged to: a place to notice being.
const ON_BASE = { dark: '#e2c08d', light: '#895503' }
// The branch's line between its two rules: the height of the strip, where the text sits, and the longest name drawn whole.
const STRIP = 30
const STRIP_TEXT = 19.5
const NAME_MAX = 44

const WIDTH = 720
const FONT = 'ui-monospace, Cascadia Mono, Cascadia Code, SF Mono, Menlo, Consolas, monospace'
const GAP = 2
const BAR_TOP = 28
const COLUMNS = 4
const ROW = 22

const escape = (text: string) =>
  text.replace(/[&<>"]/g, one => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[one] ?? one)

/** The categories as coloured slices in the fixed order, the unnamed ones summed last. */
export const slices = (categories: readonly Category[]): Slice[] => {
  const named = SLOTS.map(([name, color]) => ({
    name,
    tokens: categories.find(one => one.name.toLowerCase() === name)?.tokens ?? 0,
    color,
  }))
  const rest = categories
    .filter(one => !SLOTS.some(([name]) => name === one.name.toLowerCase()))
    .reduce((sum, one) => sum + one.tokens, 0)

  return [...named, { name: 'other', tokens: rest, color: OTHER }].filter(one => one.tokens > 0)
}

// The window as one rounded bar: a segment per slice, the rest of the track
// free space, a tick where compaction runs. The breakdown is an estimate, so
// it is fitted to the tokens the API counted; a slice too thin to see joins
// `other`, and the bar never draws a sliver.
const bar = (card: Card, top: number, height: number, ink: string) => {
  const { reading } = card
  const scale = WIDTH / Math.max(1, reading.window)
  const all = slices(card.categories)
  const total = all.reduce((sum, one) => sum + one.tokens, 0)
  const fit = total > 0 ? reading.tokens / total : 1
  const wide = all.filter(one => one.name !== 'other' && one.tokens * fit * scale >= GAP + 2)
  const thin = all.filter(one => !wide.includes(one)).reduce((sum, one) => sum + one.tokens, 0)
  const drawn =
    total > 0
      ? [...wide, { name: 'other', tokens: thin, color: OTHER }].filter(one => one.tokens > 0)
      : [{ name: 'used', tokens: reading.tokens, color: BLUE }]
  let x = 0

  const segments = drawn
    .map(one => {
      const span = Math.max(GAP + 2, one.tokens * fit * scale)
      const rect = `<rect x="${x.toFixed(1)}" y="${top}" width="${(span - GAP).toFixed(1)}" height="${height}" fill="${one.color}"/>`
      x += span

      return rect
    })
    .join('')
  const tick =
    card.compactAt === null || card.compactAt >= reading.window
      ? ''
      : `<rect x="${(card.compactAt * scale).toFixed(1)}" y="${top}" width="2" height="${height}" fill="${ink}" fill-opacity="0.8"/>`

  return `<defs><clipPath id="bar"><rect y="${top}" width="${WIDTH}" height="${height}" rx="${Math.min(5, height / 2)}"/></clipPath></defs><g clip-path="url(#bar)"><rect y="${top}" width="${WIDTH}" height="${height}" fill="${ink}" fill-opacity="0.14"/>${segments}${tick}</g>`
}

const legend = (card: Card, top: number, inks: Inks) => {
  const { reading } = card
  const free = Math.max(0, reading.window - reading.tokens)
  const rows = [...slices(card.categories), { name: 'free', tokens: free, color: '' }]
  const column = WIDTH / COLUMNS

  return rows
    .map((one, index) => {
      const x = (index % COLUMNS) * column
      const y = top + Math.floor(index / COLUMNS) * ROW
      const swatch =
        one.color === ''
          ? `<rect x="${x}" y="${y - 10}" width="10" height="10" rx="2.5" fill="${inks.muted}" fill-opacity="0.3"/>`
          : `<rect x="${x}" y="${y - 10}" width="10" height="10" rx="2.5" fill="${one.color}"/>`

      return `${swatch}<text x="${x + 17}" y="${y}"><tspan fill="${inks.secondary}">${escape(one.name)}</tspan><tspan dx="7" fill="${inks.primary}" font-weight="600">${compact(one.tokens)}</tspan><tspan dx="7" fill="${inks.muted}">${escape(share(one.tokens, reading.window))}</tspan></text>`
    })
    .join('')
}

const footer = (card: Card, y: number, inks: Inks) => {
  const lead = (parts: readonly string[]) => (parts.length === 0 ? '' : ' dx="20"')
  const parts: string[] = []

  for (const one of card.usage?.limits ?? []) {
    const reset = resetsIn(one.resetsAt, card.usage?.at ?? 0)

    parts.push(
      `<tspan${lead(parts)} fill="${inks.secondary}">${escape(longLimit(one.kind))} ${Math.round(one.percent)}%</tspan>${reset === '' ? '' : `<tspan dx="7">${reset}</tspan>`}`,
    )
  }

  if (card.usage?.usd !== undefined) {
    parts.push(
      `<tspan${lead(parts)} fill="${inks.secondary}">${money(card.usage.usd)}</tspan><tspan dx="7">this session</tspan>`,
    )
  }

  if (card.dev !== null) {
    parts.push(
      card.dev.up.length > 0
        ? `<tspan${lead(parts)} fill="${STATUS.good.fill}">●</tspan><tspan dx="6" fill="${inks.secondary}">dev</tspan><tspan dx="7">${card.dev.up.map(port => `localhost:${port}`).join(' ')}</tspan>`
        : `<tspan${lead(parts)}>dev server down</tspan>`,
    )
  }

  return parts.length === 0 ? '' : `<text x="0" y="${y}" font-size="11.5" fill="${inks.muted}">${parts.join('')}</text>`
}

/** What a screen reader gets in place of the drawing. */
export const altOf = (card: Card) => {
  const { reading } = card
  const top = [...slices(card.categories)].sort((a, b) => b.tokens - a.tokens)[0]

  return `Context ${reading.percent}% full: ${compact(reading.tokens)} of ${compact(reading.window)} tokens${top === undefined ? '' : `, most of it ${top.name}`}.`
}

/**
 * The whole card as one drawing: a header with the window and a status pill,
 * the coloured bar, and, unless compact, a legend and a line for the limits,
 * the cost and the dev server.
 */
export const cardSvg = (card: Card) => {
  const { reading } = card
  const inks = card.isLight ? LIGHT : DARK
  const status = STATUS[levelOf(reading, card.compactAt)]
  const compactsAt =
    card.compactAt === null ? '' : `<tspan dx="7" fill="${inks.muted}">· compacts at ${compact(card.compactAt)}</tspan>`
  const brief = [
    ...(card.usage?.limits ?? []).map(shortLimit),
    ...(card.usage?.usd === undefined ? [] : [money(card.usage.usd)]),
  ]
  const aside =
    card.isCompact && brief.length > 0
      ? `<text x="${WIDTH - 60}" y="14" text-anchor="end" font-size="11.5" fill="${inks.muted}">${brief.join(' · ')}</text>`
      : ''
  const header = `<rect x="1.5" y="4.5" width="8" height="8" rx="1.5" transform="rotate(45 5.5 8.5)" fill="${status.fill}"/><text x="18" y="14"><tspan fill="${inks.primary}" font-weight="700">context</tspan><tspan dx="7" fill="${inks.primary}" font-weight="700">${compact(reading.tokens)}</tspan><tspan dx="7" fill="${inks.muted}">of ${compact(reading.window)}</tspan>${compactsAt}</text>${aside}<rect x="${WIDTH - 48}" y="0" width="48" height="20" rx="10" fill="${status.fill}"/><text x="${WIDTH - 24}" y="14" text-anchor="middle" font-weight="700" fill="${status.ink}">${reading.percent}%</text>`
  const barHeight = card.isCompact ? 8 : 18
  const legendTop = BAR_TOP + barHeight + 24
  const rows = Math.ceil((slices(card.categories).length + 1) / COLUMNS)
  const footerY = legendTop + rows * ROW + 4
  const foot = card.isCompact ? '' : footer(card, footerY, inks)
  const height = card.isCompact ? BAR_TOP + barHeight + 2 : foot === '' ? footerY - ROW + 8 : footerY + 6
  const body = card.isCompact ? '' : legend(card, legendTop, inks) + foot

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${height}" width="${WIDTH}" height="${height}" font-family="${FONT}" font-size="12.5">${header}${bar(card, BAR_TOP, barHeight, inks.primary)}${body}</svg>`
}

/** What a screen reader gets in place of the branch's line. */
export const standingAlt = (one: Standing) => `Branch ${nameOf(one)}${besideOf(one) === '' ? '' : `: ${besideOf(one)}`}.`

/**
 * The branch as a line of its own, ruled off above and below so it reads apart
 * from the buttons over it and whatever is drawn under it: a mark, the name,
 * then how far it is from the branch work is merged to and what is changed.
 */
export const standingSvg = (one: Standing, isLight: boolean) => {
  const inks = isLight ? LIGHT : DARK
  const name = nameOf(one)
  const shown = name.length > NAME_MAX ? `${name.slice(0, NAME_MAX - 1)}…` : name
  // On the branch work is merged to, the mark and the name are in the colour of a warning.
  const ink = one.isBase ? ON_BASE[isLight ? 'light' : 'dark'] : inks.primary
  const rule = (y: number) => `<rect x="0" y="${y}" width="${WIDTH}" height="1" fill="${inks.muted}" fill-opacity="0.28"/>`
  const beside = besideOf(one)
    .split(' · ')
    .filter(part => part !== '')
    .map(part => `<tspan dx="9" fill="${inks.muted}">·</tspan><tspan dx="9" fill="${inks.secondary}">${escape(part)}</tspan>`)
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${STRIP}" width="${WIDTH}" height="${STRIP}" font-family="${FONT}" font-size="12.5">${rule(0)}<rect x="1.5" y="${STRIP_TEXT - 9.5}" width="8" height="8" rx="1.5" transform="rotate(45 5.5 ${STRIP_TEXT - 5.5})" fill="${one.isBase ? ink : inks.muted}"/><text x="18" y="${STRIP_TEXT}"><tspan fill="${inks.primary}" font-weight="700">branch</tspan><tspan dx="7" fill="${ink}" font-weight="700">${escape(shown)}</tspan>${beside}</text>${rule(STRIP - 1)}</svg>`
}
