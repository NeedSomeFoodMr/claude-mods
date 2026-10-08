import type { AgentRow, MainLoop, Meter, Role, Strip } from '../types'
import {
  about,
  billOf,
  clip,
  clock,
  compact,
  cut,
  fillOf,
  isLive,
  lookOf,
  modelName,
  money,
  nickOf,
  printable,
  progressOf,
  roleName,
  sections,
  spendOf,
  totalOf,
  totals,
  windowOf,
} from './rows'
import type { Look } from './rows'

export type Deck = {
  agents: readonly AgentRow[]
  main: MainLoop | null
  /** The session's own figures, where the engine has measured them. */
  meter?: Meter | null
  roster: readonly Role[]
  now: number
  isLight: boolean
  /** True when each running agent is its row alone, its plan folded away. */
  isFolded?: boolean
  /** The pane's width in CSS pixels: drawn that wide, the surface scales nothing. */
  width?: number
  /** The most rows drawn of the running and of the finished, where the usual number would not fit a drawing. */
  most?: number
}

type Inks = { primary: string; secondary: string; muted: string }

const DARK: Inks = { primary: '#f0eee6', secondary: '#c3c2b7', muted: '#898781' }
const LIGHT: Inks = { primary: '#0b0b0b', secondary: '#52514e', muted: '#898781' }
// The status steps: each wears a shape of its own beside the hue.
const BLUE = '#3987e5'
const GOOD = '#0ca30c'
const WARNING = '#fab219'
const CRITICAL = '#d03b3b'
// The crab's own colours, the same in both themes.
const SHELL = '#d97757'
const EYE = '#1f1e1d'
const GOLD = '#e0a526'

/** The desktop dock's body, measured: the surface stretches a drawing to it. */
export const DOCK = 700
const FONT = 'ui-monospace, Cascadia Mono, Cascadia Code, SF Mono, Menlo, Consolas, monospace'
const TILE = 46
const MAIN = 50
const AGENT = 66
const LABEL = 24
const GAP = 10
const INDENT = 12
const SHOWN = 12
// The most running agents drawn: past it the drawing would outgrow what a surface takes.
const AT_WORK = 16
// The most of the person's own agent types drawn as chips.
const TEAM = 12
// The most letters of an agent's name and of a role drawn in a row or a chip.
const NAME = 18
const ROLE = 20
const DETAIL = 19
// The most steps of a plan drawn under an agent.
const STEPS = 8
// The size of a row's second and third lines.
const SMALL = 11.5

// The crab, a cell a character: `#` shell, `e` eye. Seventeen cells across, so
// a hat nine wide sits between the claws with a cell to spare on each side.
const COLS = 17
const ROWS = 13
const CRAB = [
  '#.#...........#.#',
  '###...........###',
  '.#...#######...#.',
  '.###############.',
  '...###e###e###...',
  '...###e###e###...',
  '...###########...',
  '....#########....',
]
// Its legs, twice: a crab at work steps from one pair of rows to the other.
const LEGS = ['...#.#.....#.#...', '..#..#.....#..#..']
const LEGS_OUT = ['....#.#...#.#....', '....#..#.#..#....']
// A hat a role: `h` the role's hue, `d` a darker step of it, `t` a trim in the
// theme's ink. Five rows, the last resting on the shell.
const HATS: Record<string, readonly string[]> = {
  // A ranger's cap with a feather, for the one who finds things.
  feather: ['......t..', '.....t...', '..hhht...', '.hhhhhh..', 'hhhhhhhh.'],
  // A messenger's winged cap, for the one who runs commands.
  wings: ['.........', 't.......t', 'tt.hhh.tt', '.thhhhht.', '..hhhhh..'],
  // A hard hat with its ridge, for the one who builds.
  helmet: ['.........', '...hth...', '..hhthh..', '..hhthh..', 'hhhhhhhhh'],
  // A mortarboard and its tassel, for the one who marks the work.
  mortarboard: ['.........', '....h....', 'hhhhhhhhh', '..hhhhh.t', '..hhhhh.t'],
  // A wizard's hat with a star, for the one who thinks it through.
  wizard: ['....h....', '...hhh...', '...hth...', '..hhhhh..', 'ddddddddd'],
  // A folded paper hat, for the one who plans.
  paper: ['.........', '....h....', '...hhh...', '..hhhhh..', '.hhhhhhh.'],
  // A beanie with a bobble, for any other.
  beanie: ['.........', '....t....', '..hhhhh..', '..hhhhh..', '..ttttt..'],
  // A crown, for the main loop.
  crown: ['.........', '.........', '.h..h..h.', '.hhhhhhh.', '.hththth.'],
}

// A crab at work walks on the spot: its legs change over and it dips a pixel.
// Only where the person has not asked for less motion; a surface that draws
// no styles shows it standing. The deck is drawn again every three seconds
// while agents run, and four walks of .75s end as it is: a new drawing begins
// where the old one stopped, mid-step never.
const MOTION =
  '<style>@keyframes legs{50%{opacity:0}}@keyframes out{50%{opacity:1}}@keyframes dip{50%{transform:translateY(1px)}}' +
  '@media (prefers-reduced-motion:no-preference){.go .legs{animation:legs .75s steps(1) infinite}' +
  '.go .out{animation:out .75s steps(1) infinite}.go .dip{animation:dip .75s steps(1) infinite}}</style>'

/** The most characters a surface takes as one drawing: past it the tree is refused and the pane closes. */
export const LIMIT = 131_072

// Text as markup holds it: nothing XML forbids (a control character, half a
// surrogate pair), and its four reserved characters as entities.
const escape = (text: string) =>
  printable(text).replace(/[&<>"]/g, one => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[one] ?? one)

// The face is monospace, so a run's width is its length.
const wide = (text: string, size: number) => text.length * size * 0.6

const fit = (text: string, size: number, room: number) => {
  const most = Math.max(0, Math.floor(room / (size * 0.6)))

  return text.length <= most ? text : most < 4 ? '' : `${cut(text, most - 1).trimEnd()}…`
}

// A darker step of a hue, for a hat's brim.
const shade = (hex: string) =>
  `#${[1, 3, 5].map(at => Math.round(parseInt(hex.slice(at, at + 2), 16) * 0.6).toString(16).padStart(2, '0')).join('')}`

// Every cell of the map that holds `ink`, as one path of row runs, `left` and `top` cells in.
const cells = (map: readonly string[], ink: string, fill: string, cell: number, left: number, top: number) => {
  let d = ''

  for (const [row, line] of map.entries()) {
    for (const run of line.matchAll(new RegExp(`[${ink}]+`, 'g'))) {
      const length = run[0].length * cell

      d += `M${(run.index + left) * cell} ${(row + top) * cell}h${length}v${cell}h${-length}z`
    }
  }

  return d === '' ? '' : `<path d="${d}" fill="${fill}"/>`
}

// The crab under its role's hat, its top left cell at (x, y). One at work is
// classed to move; the legs it steps onto wait unseen.
const crab = (x: number, y: number, cell: number, look: Look, inks: Inks, isAtWork: boolean) => {
  const hat = HATS[look.hat] ?? []

  return (
    `<g transform="translate(${x} ${y})" shape-rendering="crispEdges"${isAtWork ? ' class="go"' : ''}><g class="dip">` +
    cells(hat, 'h', look.color, cell, 4, 0) +
    cells(hat, 'd', shade(look.color), cell, 4, 0) +
    cells(hat, 't', inks.secondary, cell, 4, 0) +
    cells(CRAB, '#', SHELL, cell, 0, 3) +
    cells(CRAB, 'e', EYE, cell, 0, 3) +
    `<g class="legs">${cells(LEGS, '#', SHELL, cell, 0, 11)}</g>` +
    (isAtWork ? `<g class="out" opacity="0">${cells(LEGS_OUT, '#', SHELL, cell, 0, 11)}</g>` : '') +
    `</g></g>`
  )
}

// How it stands, as a shape centred on (x, y): the hue repeats what the shape says.
const mark = (status: string, x: number, y: number, inks: Inks) => {
  const stroke = (color: string, d: string) =>
    `<path d="${d}" transform="translate(${x} ${y})" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`

  switch (status) {
    case 'running':
      return `<circle cx="${x}" cy="${y}" r="5.5" fill="${BLUE}" fill-opacity="0.25"/><circle cx="${x}" cy="${y}" r="3" fill="${BLUE}"/>`
    case 'waiting':
      return `<circle cx="${x}" cy="${y}" r="3.4" fill="${WARNING}"/>`
    case 'completed':
      return stroke(GOOD, 'M-3.8 0.2-1.2 2.8 3.8-2.8')
    case 'failed':
      return stroke(CRITICAL, 'M-3-3 3 3M3-3-3 3')
    case 'killed':
      return `<rect x="${x - 3}" y="${y - 3}" width="6" height="6" rx="1.2" fill="${inks.muted}"/>`
    default:
      return `<circle cx="${x}" cy="${y}" r="3.2" fill="none" stroke="${inks.muted}" stroke-width="1.4"/>`
  }
}

// A thin track from x to the right edge, filled to `part` of it: nothing where the part is not known.
const bar = (x: number, y: number, width: number, part: number | undefined, color: string, inks: Inks) => {
  const room = width - x
  const filled = part === undefined ? 0 : Math.min(1, Math.max(0, part)) * room

  return (
    `<rect x="${x}" y="${y}" width="${room}" height="4" rx="2" fill="${inks.muted}" fill-opacity="0.22"/>` +
    (filled <= 0 ? '' : `<rect x="${x}" y="${y}" width="${Math.max(4, filled)}" height="4" rx="2" fill="${color}"/>`)
  )
}

// What the drawing is laid out in: its inks, its width, the size of a crab's
// cell, and where the figures at a row's right end stand.
type Frame = { inks: Inks; width: number; cell: number; slots: Record<string, number>; figures: number }

// The figures at a row's right end, from the edge inward, each in a slot as
// wide as the longest it will hold: a number that grows moves nothing beside
// it. A narrow pane keeps the first of them.
const SLOTS = [
  ['time', 7],
  ['cost', 8],
  ['tokens', 5],
  ['fill', 8],
] as const

const frame = (deck: Deck): Frame => {
  const width = deck.width ?? DOCK
  const slots: Record<string, number> = {}
  let end = width

  for (const [name, letters] of SLOTS.slice(0, width >= 560 ? 4 : width >= 460 ? 3 : 2)) {
    slots[name] = end
    end -= wide('x'.repeat(letters), SMALL) + 8
  }

  return { inks: deck.isLight ? LIGHT : DARK, width, cell: width >= 520 ? 3 : 2, slots, figures: end }
}

// A figure in its slot, flush to the slot's right end; nothing where the slot is not drawn or the figure not known.
const figure = (at: Frame, slot: string, y: number, text: string, ink: string) => {
  const end = at.slots[slot]

  return end === undefined || text === ''
    ? ''
    : `<text x="${end}" y="${y}" font-size="${SMALL}" text-anchor="end" fill="${ink}">${escape(text)}</text>`
}

// Text cut into lines no wider than the room, at word ends; the last one says there was more.
const wrap = (text: string, size: number, room: number, lines: number) => {
  const most = Math.max(8, Math.floor(room / (size * 0.6)))
  const out: string[] = []
  let rest = text

  while (rest !== '' && out.length < lines) {
    if (rest.length <= most) {
      out.push(rest)
      rest = ''
    } else if (out.length === lines - 1) {
      out.push(fit(rest, size, room))
      rest = ''
    } else {
      const space = rest.lastIndexOf(' ', most)
      const at = space > most / 2 ? space : cut(rest, most).length

      out.push(rest.slice(0, at).trimEnd())
      rest = rest.slice(at).trimStart()
    }
  }

  return out
}

const STEP_MARK = { done: 'completed', doing: 'running', todo: 'pending' } as const

// Under a running agent: the call in hand, then the plan it posted, or, where
// it posted none, what it was asked. A rule down the side ties them to its row.
const details = (agent: AgentRow, rule: number, x: number, y: number, width: number, inks: Inks) => {
  const room = width - x - 4
  const steps = agent.steps ?? []
  let out = ''
  let at = y

  // Without a plan the row itself says the call in hand.
  if (steps.length > 0 && agent.lastArg !== undefined && agent.lastArg !== '') {
    const tool = agent.lastTool ?? ''

    out +=
      `<text x="${x}" y="${at + 13}" font-size="11" fill="${inks.muted}"><tspan fill="${inks.secondary}">${escape(tool)}</tspan> ` +
      `${escape(fit(agent.lastArg, 11, room - wide(tool, 11) - 8))}</text>`
    at += DETAIL
  }

  if (steps.length > 0) {
    for (const step of steps.slice(0, STEPS)) {
      const ink = step.status === 'doing' ? inks.primary : step.status === 'done' ? inks.muted : inks.secondary

      out +=
        mark(STEP_MARK[step.status], x + 5, at + 9.5, inks) +
        `<text x="${x + 17}" y="${at + 13}" font-size="11"${step.status === 'doing' ? ' font-weight="700"' : ''} fill="${ink}">` +
        `${escape(fit(step.title, 11, room - 17))}</text>`
      at += DETAIL
    }

    if (steps.length > STEPS) {
      out += `<text x="${x + 17}" y="${at + 13}" font-size="11" fill="${inks.muted}">+ ${steps.length - STEPS} more</text>`
      at += DETAIL
    }
  } else if (agent.brief !== undefined && agent.brief !== '') {
    for (const [index, line] of wrap(`asked: ${agent.brief}`, 11, room, 2).entries()) {
      out += `<text x="${x}" y="${at + 13}" font-size="11" fill="${inks.muted}">${escape(line)}</text>`
      at += index === 0 ? DETAIL - 3 : DETAIL
    }
  }

  if (at === y) {
    return { svg: '', height: 0 }
  }

  return {
    svg: `<path d="M${rule} ${y - 2}V${at - 4}" stroke="${inks.muted}" stroke-opacity="0.3"/>${out}`,
    height: at - y + 9,
  }
}

const label = (text: string, y: number, width: number, inks: Inks) => {
  const end = wide(text, 10) + text.length * 1.2 + 8

  return (
    `<text x="0" y="${y + 16}" font-size="10" letter-spacing="1.2" fill="${inks.muted}">${escape(text)}</text>` +
    `<path d="M${end} ${y + 12.5}H${width}" stroke="${inks.muted}" stroke-opacity="0.3"/>`
  )
}

// A word for how it stands, where the row has to say more than its mark: nothing for one at work or done.
const STANDS: Record<string, string> = { running: '', completed: '', killed: 'stopped' }
const STAND_INKS: Record<string, string> = { waiting: WARNING, failed: CRITICAL }

// What an agent's row says of its numbers: only what the engine counted, each empty where it counted nothing.
const figuresOf = (agent: AgentRow, deck: Deck) => {
  const spend = spendOf(agent)
  const bill = billOf(agent)
  const percent = fillOf(agent, windowOf(agent.model, deck.main, deck.meter ?? null))

  return {
    time: clock((agent.endedAt ?? Math.max(deck.now, agent.startedAt)) - agent.startedAt),
    // Each request at the price of the model that answered it; a `+` where one had no price.
    cost: bill?.usd === undefined ? '' : about(bill.usd, bill.unpriced > 0),
    tokens: spend === undefined ? '' : compact(totalOf(spend)),
    // Against a window that is known, a percentage; otherwise the tokens themselves.
    fill: percent !== undefined ? `ctx ${percent}%` : agent.context === undefined ? '' : `ctx ${compact(agent.context)}`,
    percent,
  }
}

// One agent: its crab, then its task, who it is, how far along, and what it has used.
const agentRow = (agent: AgentRow, depth: number, y: number, deck: Deck, at: Frame) => {
  const { inks, width, cell } = at
  const look = lookOf(agent.type)
  const indent = Math.min(depth, 3) * INDENT
  const x = indent + COLS * cell + GAP
  const says = figuresOf(agent, deck)
  const plan = progressOf(agent)
  const isPast = !isLive(agent)

  // Who it is, in the room the line has: the name first, then how it stands,
  // the role, and the model in what is left. Each is cut to fit, so a long
  // name never runs under the mark at the row's end.
  const line = width - 18 - x
  const nick = fit(clip(nickOf(agent), NAME), SMALL, line)
  const stand = fit(STANDS[agent.status] ?? agent.status, SMALL, line - wide(nick, SMALL) - 7)
  const taken = wide(nick, SMALL) + (stand === '' ? 0 : wide(stand, SMALL) + 7)
  const role = fit(clip(roleName(agent.type), ROLE), SMALL, line - taken - 7)
  const model = fit(
    [modelName(agent.model), ...(agent.effort === undefined ? [] : [agent.effort])].join(' · '),
    SMALL,
    line - taken - (role === '' ? 0 : wide(role, SMALL) + 7) - 7,
  )
  const second =
    `<text x="${x}" y="${y + 29}" font-size="${SMALL}">` +
    `<tspan font-weight="700" fill="${inks.primary}">${escape(nick)}</tspan>` +
    (role === '' ? '' : `<tspan dx="7" fill="${look.color}">${escape(role)}</tspan>`) +
    (model === '' ? '' : `<tspan dx="7" fill="${inks.muted}">${escape(model)}</tspan>`) +
    (stand === '' ? '' : `<tspan dx="7" fill="${STAND_INKS[agent.status] ?? inks.muted}">${escape(stand)}</tspan>`) +
    `</text>`

  // How far along: its plan's count and the step in hand, or, with no plan, the call in hand.
  const room = at.figures - x - 6
  const count = plan === undefined ? 'no plan' : `${plan.done}/${plan.total}`
  const doing =
    plan !== undefined
      ? (plan.doing ?? '')
      : isPast
        ? agent.tools === 0
          ? ''
          : `${agent.tools} tool${agent.tools === 1 ? '' : 's'}`
        : [agent.lastTool ?? '', agent.lastArg ?? ''].filter(part => part !== '').join(' ')
  const rest = fit(doing, SMALL, room - wide(`${count} · `, SMALL))
  const third =
    `<text x="${x}" y="${y + 45}" font-size="${SMALL}" fill="${inks.muted}">` +
    `<tspan${plan === undefined ? '' : ` font-weight="700" fill="${inks.secondary}"`}>${count}</tspan>` +
    `${rest === '' ? '' : ` · ${escape(rest)}`}</text>`

  const body =
    crab(indent, y + Math.round((56 - ROWS * cell) / 2), cell, look, inks, agent.status === 'running') +
    `<text x="${x}" y="${y + 13}" font-size="12.5" font-weight="700" fill="${inks.primary}">` +
    `${escape(fit(agent.description, 12.5, width - 18 - x))}</text>` +
    mark(agent.status, width - 6, y + 9, inks) +
    second +
    third +
    figure(at, 'time', y + 45, says.time, isPast ? inks.muted : inks.primary) +
    figure(at, 'cost', y + 45, says.cost, inks.secondary) +
    figure(at, 'tokens', y + 45, says.tokens, inks.muted) +
    figure(at, 'fill', y + 45, says.fill, inks.muted) +
    // The role's hue through its plan; with no plan, grey to its window's fill, or empty.
    (plan === undefined
      ? bar(x, y + 52, width, says.percent === undefined ? undefined : says.percent / 100, inks.muted, inks)
      : bar(x, y + 52, width, plan.done / plan.total, look.color, inks))

  return { svg: isPast ? `<g opacity="0.8">${body}</g>` : body, x, indent }
}

// The main loop, crowned: its model, and how full the engine says its window is.
const mainRow = (deck: Deck, y: number, at: Frame) => {
  const { inks, width, cell } = at
  const x = COLS * cell + GAP
  const model = [modelName(deck.main?.model), ...(deck.main?.effort === undefined ? [] : [deck.main.effort])].join(' · ')
  const percent = deck.meter?.percent

  return (
    crab(0, y + Math.round((40 - ROWS * cell) / 2), cell, { hat: 'crown', color: GOLD }, inks, false) +
    `<text x="${x}" y="${y + 13}" font-size="12.5"><tspan font-weight="700" fill="${inks.primary}">Main</tspan>` +
    `<tspan dx="8" font-size="${SMALL}" fill="${inks.muted}">this chat</tspan></text>` +
    `<text x="${x}" y="${y + 29}" font-size="${SMALL}" fill="${inks.secondary}">${escape(model)}</text>` +
    // In the column the agents' fills stand in, where the pane is wide enough to draw it.
    (percent === undefined
      ? ''
      : `<text x="${at.slots.fill ?? width}" y="${y + 29}" font-size="${SMALL}" text-anchor="end" fill="${inks.muted}">ctx ${percent}%</text>`) +
    bar(x, y + 36, width, percent === undefined ? undefined : percent / 100, inks.muted, inks)
  )
}

// The three sums over the session's agents, a tile each: its name, its figure,
// and small beside each what qualifies it, where there is room.
//
// The first tile holds two costs that are not the same thing, and says which
// is which: the large one is the listed agents alone, estimated from their
// token counts; the small one is the engine's own figure for the whole
// session, the main loop included.
const tiles = (deck: Deck, at: Frame) => {
  const { inks, width } = at
  const sum = totals(deck.agents, deck.now)
  const each = (width - 16) / 3
  const count = deck.agents.length
  const said: readonly (readonly [string, string, string, string])[] = [
    [
      'Agents cost',
      sum.usd === undefined ? '–' : about(sum.usd, sum.unpriced > 0),
      deck.meter?.usd === undefined ? 'estimate' : `whole session ${money(deck.meter.usd)}`,
      // A model with no listed price: its agent's tokens are counted, and are in no cost.
      sum.unpriced === 0 ? '' : `${sum.unpriced} unpriced`,
    ],
    ['Tokens', sum.counted === 0 ? '–' : compact(sum.tokens), sum.counted === 0 ? '' : `${compact(sum.output)} out`, ''],
    // Each agent's own run, added: three at once for a minute is three minutes.
    ['Time', count === 0 ? '–' : clock(sum.ms), count < 2 ? '' : `sum of ${count} agents`, ''],
  ]

  return said
    .map(([name, value, note, beside], index) => {
      const x = index * (each + 8)
      const small = (y: number, text: string) =>
        `<text x="${x + each - 10}" y="${y}" font-size="10.5" text-anchor="end" fill="${inks.muted}">${escape(text)}</text>`

      return (
        `<rect x="${x}" y="0" width="${each}" height="${TILE}" rx="8" fill="${inks.muted}" fill-opacity="0.14"/>` +
        `<text x="${x + 10}" y="16" font-size="11" fill="${inks.muted}">${name}</text>` +
        (note === '' || wide(name, 11) + wide(note, 10.5) + 28 > each ? '' : small(16, note)) +
        `<text x="${x + 10}" y="37" font-size="16" font-weight="700" fill="${inks.primary}">${escape(value)}</text>` +
        (beside === '' || wide(value, 16) + wide(beside, 10.5) + 28 > each ? '' : small(37, beside))
      )
    })
    .join('')
}

// The types the person may ask for by name, each under its hat, as chips that wrap.
const team = (roster: readonly Role[], top: number, width: number, inks: Inks) => {
  const tall = ROWS * 2
  let x = 0
  let y = top
  let out = ''

  for (const role of roster.slice(0, TEAM)) {
    const name = clip(roleName(role.name), ROLE)
    const chip = COLS * 2 + 7 + wide(name, 12)

    if (x > 0 && x + chip > width) {
      x = 0
      y += tall + 8
    }

    out +=
      crab(x, y, 2, lookOf(role.name), inks, false) +
      `<text x="${x + COLS * 2 + 7}" y="${y + 19}" fill="${inks.secondary}">${escape(name)}</text>`
    x += chip + 18
  }

  if (roster.length > TEAM) {
    const more = `+ ${roster.length - TEAM} more`

    if (x > 0 && x + wide(more, 11) > width) {
      x = 0
      y += tall + 8
    }

    out += `<text x="${x}" y="${y + 19}" font-size="11" fill="${inks.muted}">${more}</text>`
  }

  return { svg: out, bottom: y + tall }
}

/** The deck as one drawing: the sums, the main loop, who runs, who has finished, and the team. */
export const deckSvg = (deck: Deck) => {
  const at = frame(deck)
  const { inks, width } = at
  const { running, finished } = sections(deck.agents)
  const atWork = running.slice(0, Math.min(AT_WORK, deck.most ?? AT_WORK))
  const shown = finished.slice(0, Math.min(SHOWN, deck.most ?? SHOWN))
  const sum = totals(deck.agents, deck.now)

  let out = tiles(deck, at)
  let y = TILE + 12

  out += mainRow(deck, y, at)
  y += MAIN

  if (deck.agents.length === 0) {
    out += `<text x="${COLS * at.cell + GAP}" y="${y + 10}" font-size="11" fill="${inks.muted}">no subagents yet</text>`
    y += 22
  }

  if (running.length > 0) {
    out += label(`RUNNING · ${running.length}`, y, width, inks)
    y += LABEL

    for (const one of atWork) {
      const row = agentRow(one.row, one.depth, y, deck, at)

      out += row.svg
      y += AGENT

      if (deck.isFolded !== true) {
        // The rule falls from under the crab's middle.
        const under = details(one.row, row.indent + (COLS * at.cell) / 2, row.x, y - 6, width, inks)

        out += under.svg
        y += under.height
      }
    }

    if (running.length > atWork.length) {
      out += `<text x="${COLS * at.cell + GAP}" y="${y + 8}" font-size="11" fill="${inks.muted}">+ ${running.length - atWork.length} more at work</text>`
      y += 22
    }
  }

  if (finished.length > 0) {
    out += label(`FINISHED · ${finished.length}`, y, width, inks)
    y += LABEL

    for (const one of shown) {
      out += agentRow(one, 0, y, deck, at).svg
      y += AGENT
    }

    if (finished.length > shown.length) {
      out += `<text x="${COLS * at.cell + GAP}" y="${y + 8}" font-size="11" fill="${inks.muted}">+ ${finished.length - shown.length} earlier</text>`
      y += 22
    }
  }

  if (deck.roster.length > 0) {
    out += label('YOUR TEAM', y, width, inks)
    y += LABEL + 2

    const chips = team(deck.roster, y, width, inks)
    out += chips.svg
    y = chips.bottom + 8
  }

  // Said once, under everything: what the signs on every cost mean.
  const notes = [
    ...(sum.usd === undefined
      ? []
      : ['≈ agents only, list prices × the tokens the engine counted: an estimate, not a bill']),
    ...(sum.unpriced === 0 ? [] : ['+ more ran on a model with no listed price: counted in the tokens, in no cost']),
  ]

  for (const note of notes) {
    out += `<text x="0" y="${y + 12}" font-size="10.5" fill="${inks.muted}">${escape(fit(note, 10.5, width))}</text>`
    y += 16
  }

  y += 6

  const motion = atWork.some(one => one.row.status === 'running') ? MOTION : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${y}" width="${width}" height="${y}" font-family="${FONT}" font-size="12">${motion}${out}</svg>`
}

/**
 * The deck as a drawing a surface will take. Escaping lengthens text after it
 * was measured, so a deck of long plans full of `"`, `&` and `<` can pass the
 * limit as drawn: then the plans are folded away, and if that is not enough
 * fewer rows are drawn, until it fits.
 */
export const deckFitted = (deck: Deck, limit = LIMIT) => {
  const tighter: readonly Deck[] = [
    { ...deck, isFolded: true },
    ...[8, 4, 2, 1, 0].map(most => ({ ...deck, isFolded: true, most })),
  ]
  let svg = deckSvg(deck)

  for (const next of tighter) {
    if (svg.length <= limit) {
      break
    }

    svg = deckSvg(next)
  }

  return svg
}

export const altOf = (deck: Deck) => {
  const { running, finished } = sections(deck.agents)
  const sum = totals(deck.agents, deck.now)
  const said = (agent: AgentRow) => `${clip(nickOf(agent), NAME)} (${clip(roleName(agent.type), ROLE)}, ${modelName(agent.model)})`
  const cost =
    sum.usd === undefined
      ? ''
      : `, the agents about ${money(sum.usd)} at list prices${sum.unpriced === 0 ? '' : ` and ${sum.unpriced} unpriced`}`

  return [
    `Agents: main on ${modelName(deck.main?.model)}.`,
    running.length > 0 ? `Running: ${running.map(one => said(one.row)).join(', ')}.` : 'None running.',
    finished.length > 0 ? `Finished: ${finished.map(said).join(', ')}.` : '',
    sum.counted === 0 ? '' : `${compact(sum.tokens)} tokens${cost}.`,
    deck.meter?.usd === undefined ? '' : `Whole session ${money(deck.meter.usd)}.`,
  ]
    .filter(part => part !== '')
    .join(' ')
}

/** The strip's width at its fullest and at its least, in CSS pixels. */
export const STRIP = 460
export const STRIP_LEAST = 310

/**
 * The line above the prompt: a crab at work, the counts in slots that do not
 * move, and a thin bar through the plans.
 *
 * Each slot holds the longest its figure can be (60 agents, 720 steps), so
 * none reaches the next. Everything the strip holds is drawn at either width:
 * the narrow one says the steps in the bar alone and shortens the cost's name.
 * The cost is named as the agents', since the session's own stands beside it
 * in another panel and is a different number.
 */
export const stripSvg = (strip: Strip, isLight: boolean, width = STRIP) => {
  const inks = isLight ? LIGHT : DARK
  const text = (x: number, body: string, ink: string) => `<text x="${x}" y="12" fill="${ink}">${body}</text>`
  const part = strip.steps === 0 ? undefined : strip.done / strip.steps
  const isFull = width >= 452
  const cost = strip.usd === undefined ? '' : about(strip.usd, strip.hasUnpriced === true)

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 20" width="${width}" height="20" font-family="${FONT}" font-size="12">` +
    MOTION +
    `<g transform="translate(0 2)" shape-rendering="crispEdges" class="go"><g class="dip">` +
    cells(CRAB, '#', SHELL, 1, 0, 0) +
    cells(CRAB, 'e', EYE, 1, 0, 0) +
    `<g class="legs">${cells(LEGS, '#', SHELL, 1, 0, 8)}</g>` +
    `<g class="out" opacity="0">${cells(LEGS_OUT, '#', SHELL, 1, 0, 8)}</g></g></g>` +
    text(24, `${strip.running} running`, inks.primary) +
    text(108, `${strip.finished} finished`, inks.muted) +
    (strip.steps === 0 || !isFull ? '' : text(198, `steps ${strip.done}/${strip.steps}`, inks.secondary)) +
    (cost === '' ? '' : text(isFull ? 304 : 198, `${isFull ? 'agents cost' : 'agents'} ${cost}`, inks.secondary)) +
    `<rect x="0" y="16" width="${width}" height="3" rx="1.5" fill="${inks.muted}" fill-opacity="0.22"/>` +
    (part === undefined || part <= 0
      ? ''
      : `<rect x="0" y="16" width="${Math.max(3, part * width)}" height="3" rx="1.5" fill="${SHELL}"/>`) +
    `</svg>`
  )
}

export const stripAlt = (strip: Strip) =>
  [
    `Agents: ${strip.running} running, ${strip.finished} finished`,
    strip.steps === 0 ? '' : `, ${strip.done} of ${strip.steps} steps done`,
    strip.usd === undefined
      ? ''
      : `, agents cost about ${money(strip.usd)}${strip.hasUnpriced === true ? ' and more unpriced' : ''}`,
    '.',
  ].join('')
