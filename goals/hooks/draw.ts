import type { Goal } from '../types'
import { counts, rest, visible } from './list'

type Inks = { primary: string; secondary: string; muted: string }

// The hud card's own type, inks and status steps, so the two read as one panel.
const DARK: Inks = { primary: '#f0eee6', secondary: '#c3c2b7', muted: '#898781' }
const LIGHT: Inks = { primary: '#0b0b0b', secondary: '#52514e', muted: '#898781' }
const GOOD = '#0ca30c'
const BLUE = '#3987e5'

const WIDTH = 720
const FONT = 'ui-monospace, Cascadia Mono, Cascadia Code, SF Mono, Menlo, Consolas, monospace'
const ROW = 22
const FIRST_ROW = 40
const LINE_CHARS = 88

const escape = (text: string) =>
  text.replace(/[&<>"]/g, one => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[one] ?? one)

const clip = (text: string, most: number) => (text.length > most ? `${text.slice(0, Math.max(1, most - 1))}…` : text)

// A goal's state is its mark's shape as well as its colour: a tick, a filled
// dot, an empty ring.
const mark = (goal: Goal, y: number, inks: Inks) => {
  const cy = y - 4

  if (goal.status === 'done') {
    return `<circle cx="6" cy="${cy}" r="6" fill="${GOOD}" fill-opacity="0.22"/><path d="M3 ${cy}l2.2 2.3 3.9-4.4" fill="none" stroke="${GOOD}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`
  }

  if (goal.status === 'doing') {
    return `<circle cx="6" cy="${cy}" r="6" fill="${BLUE}" fill-opacity="0.25"/><circle cx="6" cy="${cy}" r="3" fill="${BLUE}"/>`
  }

  return `<circle cx="6" cy="${cy}" r="5.25" fill="none" stroke="${inks.muted}" stroke-width="1.5"/>`
}

const row = (goal: Goal, y: number, inks: Inks) => {
  const title = clip(goal.title, LINE_CHARS)
  const room = LINE_CHARS - title.length - 3
  const note =
    goal.note === undefined || room < 8 ? '' : `<tspan dx="8" fill="${inks.muted}" font-weight="400">${escape(clip(goal.note, room))}</tspan>`
  const ink = goal.status === 'doing' ? inks.primary : goal.status === 'done' ? inks.muted : inks.secondary
  const weight = goal.status === 'doing' ? '700' : '400'

  return `${mark(goal, y, inks)}<text x="20" y="${y}" fill="${ink}" font-weight="${weight}">${escape(title)}${note}</text>`
}

// One pill a goal, in order: what is done, what is in hand, what is left.
const progress = (goals: readonly Goal[], inks: Inks) => {
  const pill = Math.max(6, Math.min(22, Math.floor(260 / goals.length) - 3))
  const start = WIDTH - goals.length * (pill + 3) + 3

  return goals
    .map((one, index) => {
      const fill =
        one.status === 'done'
          ? `fill="${GOOD}"`
          : one.status === 'doing'
            ? `fill="${BLUE}"`
            : `fill="${inks.muted}" fill-opacity="0.3"`

      return `<rect x="${start + index * (pill + 3)}" y="6" width="${pill}" height="6" rx="3" ${fill}/>`
    })
    .join('')
}

/** The goals as one drawing: a header with the count and a pill per goal, then the rows. */
export const goalsSvg = (goals: readonly Goal[], isOpen: boolean, isLight: boolean) => {
  const inks = isLight ? LIGHT : DARK
  const { done } = counts(goals)
  const shown = visible(goals, isOpen)
  const tail = rest(shown.more, shown.done)
  const rows = shown.rows.map((one, index) => row(one, FIRST_ROW + index * ROW, inks)).join('')
  const tailY = FIRST_ROW + shown.rows.length * ROW
  const foot = tail === '' ? '' : `<text x="20" y="${tailY}" font-size="11.5" fill="${inks.muted}">${escape(tail)}</text>`
  const height = (tail === '' ? tailY - ROW : tailY) + 8
  const allDone = done === goals.length
  const header = `<rect x="1.5" y="4.5" width="8" height="8" rx="1.5" transform="rotate(45 5.5 8.5)" fill="${allDone ? GOOD : BLUE}"/><text x="18" y="14"><tspan fill="${inks.primary}" font-weight="700">goals</tspan><tspan dx="7" fill="${inks.muted}">${done} of ${goals.length} done</tspan></text>`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${height}" width="${WIDTH}" height="${height}" font-family="${FONT}" font-size="12.5">${header}${progress(goals, inks)}${rows}${foot}</svg>`
}
