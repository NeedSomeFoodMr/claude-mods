// The explorer's left edge, one drawing a row: the indent guides, a folder's
// chevron and the icon of what the row is. The name beside it is the surface's
// own text, so only the name is pressed.

/** A row's height in CSS pixels: the guides of one row meet the next row's. */
export const ROW = 22
const INDENT = 12
const CHEVRON = 14
const ICON = 16
const PAD = 6

// The hues of the editor's own file icons, so a type reads as it does there.
const BLUE = '#519aba'
const YELLOW = '#cbcb41'
const ORANGE = '#e37933'
const PURPLE = '#a074c4'
const GREEN = '#8dc149'
const PINK = '#f55385'
const RED = '#cc3e44'
const GREY = '#7d8f96'

type Glyph =
  | { kind: 'mark'; text: string; color: string; size?: number }
  | { kind: 'shape'; shape: 'atom' | 'image' | 'gear' | 'git' | 'lock' | 'page'; color: string }

const mark = (text: string, color: string, size?: number): Glyph => ({ kind: 'mark', text, color, size })
const shape = (name: 'atom' | 'image' | 'gear' | 'git' | 'lock' | 'page', color: string): Glyph => ({
  kind: 'shape',
  shape: name,
  color,
})

const BY_EXTENSION: Record<string, Glyph> = {
  ts: mark('TS', BLUE),
  mts: mark('TS', BLUE),
  cts: mark('TS', BLUE),
  tsx: shape('atom', BLUE),
  js: mark('JS', YELLOW),
  mjs: mark('JS', YELLOW),
  cjs: mark('JS', YELLOW),
  jsx: shape('atom', YELLOW),
  json: mark('{}', YELLOW, 10.5),
  jsonc: mark('{}', YELLOW, 10.5),
  json5: mark('{}', YELLOW, 10.5),
  md: mark('MD', BLUE),
  mdx: mark('MD', BLUE),
  css: mark('#', BLUE, 12),
  scss: mark('#', PINK, 12),
  sass: mark('#', PINK, 12),
  less: mark('#', BLUE, 12),
  html: mark('<>', ORANGE, 10.5),
  htm: mark('<>', ORANGE, 10.5),
  xml: mark('<>', ORANGE, 10.5),
  svg: shape('image', PURPLE),
  png: shape('image', PURPLE),
  jpg: shape('image', PURPLE),
  jpeg: shape('image', PURPLE),
  gif: shape('image', PURPLE),
  webp: shape('image', PURPLE),
  avif: shape('image', PURPLE),
  ico: shape('image', PURPLE),
  yml: shape('gear', PURPLE),
  yaml: shape('gear', PURPLE),
  toml: shape('gear', GREY),
  ini: shape('gear', GREY),
  conf: shape('gear', GREY),
  py: mark('PY', BLUE),
  go: mark('GO', BLUE),
  rs: mark('RS', ORANGE),
  java: mark('JV', RED),
  rb: mark('RB', RED),
  php: mark('PH', PURPLE),
  c: mark('C', BLUE, 10),
  h: mark('H', PURPLE, 10),
  cpp: mark('C+', BLUE),
  cs: mark('C#', GREEN),
  sql: mark('SQ', PINK),
  sh: mark('>_', GREEN),
  bash: mark('>_', GREEN),
  zsh: mark('>_', GREEN),
  ps1: mark('>_', BLUE),
  bat: mark('>_', GREEN),
  cmd: mark('>_', GREEN),
  csv: mark('CS', GREEN),
  pdf: mark('PD', RED),
  lock: shape('lock', YELLOW),
}

const LOCKS = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'cargo.lock', 'poetry.lock']

/** What a file is, by its name: the icon the editor would give it. */
export const glyphOf = (name: string): Glyph => {
  const lower = name.toLowerCase()

  if (lower.startsWith('.git')) {
    return shape('git', ORANGE)
  }

  if (LOCKS.includes(lower)) {
    return shape('lock', YELLOW)
  }

  if (lower.startsWith('.env') || /(^|\.)config\.[a-z]+$/.test(lower) || /^\..+rc(\..+)?$/.test(lower)) {
    return shape('gear', GREY)
  }

  return BY_EXTENSION[lower.slice(lower.lastIndexOf('.') + 1)] ?? shape('page', GREY)
}

const SHAPES: Record<string, string> = {
  atom:
    '<ellipse cx="8" cy="8" rx="6.6" ry="2.5"/><ellipse cx="8" cy="8" rx="6.6" ry="2.5" transform="rotate(60 8 8)"/>' +
    '<ellipse cx="8" cy="8" rx="6.6" ry="2.5" transform="rotate(120 8 8)"/><circle cx="8" cy="8" r="0.7"/>',
  image: '<rect x="2" y="3.4" width="12" height="9.2" rx="1.6"/><circle cx="5.4" cy="6.5" r="0.9"/><path d="M3 11.4 6.4 8 8.8 10.3 10.6 8.8 13 11.4"/>',
  gear: '<circle cx="8" cy="8" r="2.1"/><path d="M8 2.6V4.4M8 11.6V13.4M2.6 8H4.4M11.6 8H13.4M4.2 4.2 5.5 5.5M10.5 10.5 11.8 11.8M11.8 4.2 10.5 5.5M5.5 10.5 4.2 11.8"/>',
  git: '<path d="M8 2.2 13.8 8 8 13.8 2.2 8Z"/><path d="M8 5.6V10.4M8 7.2 10 9.2"/>',
  lock: '<rect x="3.6" y="7.2" width="8.8" height="6.2" rx="1.4"/><path d="M5.6 7.2V5.4A2.4 2.4 0 0 1 10.4 5.4V7.2"/>',
  page: '<path d="M4 2.2H9.4L12.4 5.2V13.8H4ZM9.4 2.2V5.2H12.4"/>',
}

const escape = (text: string) =>
  text.replace(/[&<>"]/g, one => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[one] ?? one)

const drawn = (glyph: Glyph, x: number, y: number, isLight: boolean) => {
  // The editor's yellow is drawn for a dark ground: on a light one it is darkened to be read.
  const color = isLight && glyph.color === YELLOW ? '#9a8f00' : glyph.color

  if (glyph.kind === 'mark') {
    return (
      `<text x="${x + 8}" y="${y + 11.4}" text-anchor="middle" font-family="ui-sans-serif, system-ui, Segoe UI, sans-serif" ` +
      `font-size="${glyph.size ?? 8.6}" font-weight="800" letter-spacing="-0.2" fill="${color}">${escape(glyph.text)}</text>`
    )
  }

  return (
    `<g transform="translate(${x} ${y})" fill="none" stroke="${color}" stroke-width="1.1" stroke-linecap="round" ` +
    `stroke-linejoin="round">${SHAPES[glyph.shape] ?? SHAPES.page}</g>`
  )
}

const framed = (width: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${ROW}" width="${width}" height="${ROW}">${body}</svg>`

// One line down the row for each folder it sits inside, under that folder's chevron.
const guides = (depth: number, isLight: boolean) => {
  let out = ''

  for (let level = 0; level < depth; level++) {
    const x = level * INDENT + CHEVRON / 2 + 0.5

    out += `<path d="M${x} 0V${ROW}" stroke="${isLight ? '#0b0b0b' : '#f0eee6'}" stroke-opacity="0.16"/>`
  }

  return out
}

/**
 * The indent of a folder's row: the guides alone, since its chevron, folder and
 * name are one button beside them. Nothing to draw at the root, where the width is 0.
 */
export const indentOf = (depth: number, isLight: boolean) => {
  const width = depth * INDENT

  return { source: framed(Math.max(width, 1), guides(depth, isLight)), width }
}

/** Claude's mark on a file: its colour, and whether it is still new. */
export type Spot = { color: string; isLive: boolean }

// The mark sits in the room a chevron would take, so it moves nothing: a dot
// in a ring while it is new, a smaller dot once it has settled.
const spotted = (spot: Spot, x: number) =>
  spot.isLive
    ? `<circle cx="${x}" cy="${ROW / 2}" r="5" fill="none" stroke="${spot.color}" stroke-opacity="0.4"/>` +
      `<circle cx="${x}" cy="${ROW / 2}" r="2.6" fill="${spot.color}"/>`
    : `<circle cx="${x}" cy="${ROW / 2}" r="1.8" fill="${spot.color}"/>`

/**
 * A file's left edge: the guides, the room a chevron would take, and the icon
 * of its type; with a `spot`, Claude's mark in that room.
 */
export const edgeOf = (file: { depth: number; name: string }, isLight: boolean, spot?: Spot) => {
  const left = file.depth * INDENT
  const width = left + CHEVRON + ICON + PAD

  return {
    source: framed(
      width,
      guides(file.depth, isLight) +
        (spot === undefined ? '' : spotted(spot, left + CHEVRON / 2 + 0.5)) +
        drawn(glyphOf(file.name), left + CHEVRON, (ROW - ICON) / 2, isLight),
    ),
    width,
    alt: 'file',
  }
}

// A button is as wide as its label and nothing else takes a press, so a row's
// name is followed by blank room: no-break spaces, which a surface does not
// collapse, closed by a blank that is no space, which a trim does not take.
const SPACE = '\u00A0'
const STOP = '\u2800'
// Estimates, since the surface's face is its own: a letter and a space of it.
const LETTER_PX = 6.4
const SPACE_PX = 3.6

/** How wide a run of text is likely to be drawn. */
export const widthOf = (text: string) => text.length * LETTER_PX

/**
 * The blank room that carries a label most of the way across what is left of
 * the row: short of all of it, so a face wider than the estimate still fits.
 */
export const reachOf = (usedPx: number, rowPx: number) => {
  const count = Math.min(220, Math.floor(((rowPx - usedPx) * 0.8) / SPACE_PX))

  return count < 4 ? '' : `${SPACE.repeat(count)}${STOP}`
}

/** The same room as a label of its own: it opens with the blank too, so a trim leaves it whole. */
export const restOf = (usedPx: number, rowPx: number) => {
  const reach = reachOf(usedPx, rowPx)

  return reach === '' ? '' : `${STOP}${reach}`
}

/** The rule under a tab: the accent under the one in view, nothing under the others, the same room either way. */
export const ruleOf = (width: number, isOn: boolean, isLight: boolean) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 2" width="${width}" height="2">` +
  (isOn ? `<rect width="${width}" height="2" rx="1" fill="${isLight ? '#c6613f' : '#d97757'}"/>` : '') +
  '</svg>'
