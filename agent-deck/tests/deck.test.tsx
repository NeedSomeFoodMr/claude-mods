import type { AgentInfo, On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import type { Engine } from 'claude-code/testing'

import { LIMIT, altOf, deckFitted, deckSvg, stripAlt, stripSvg } from '../hooks/draw'
import {
  ESTIMATED_USD_PER_MTOK,
  about,
  argOf,
  billOf,
  briefOf,
  briefing,
  christen,
  clip,
  clock,
  compact,
  costOf,
  cut,
  elapsed,
  fillOf,
  flat,
  lookOf,
  modelName,
  money,
  parseSteps,
  printable,
  progressOf,
  sections,
  settled,
  spendFrom,
  spendOf,
  standing,
  stepped,
  stripOf,
  totalOf,
  totals,
  tree,
  windowOf,
  work,
} from '../hooks/rows'
import type { AgentRow, Spend } from '../types'

const row = (id: string, more: Partial<AgentRow> = {}): AgentRow => ({
  id,
  type: 'Explore',
  description: 'Find the auth code',
  status: 'running',
  startedAt: 0,
  tools: 0,
  tokens: 0,
  ...more,
})

const spend = (input: number, output: number, cacheRead = 0, cacheWrite = 0): Spend => ({
  input,
  output,
  cacheRead,
  cacheWrite,
})

// A cost in millionths of a dollar, whole: sums of fractions do not compare exactly.
const micro = (usd: number | undefined) => Math.round((usd ?? Number.NaN) * 1_000_000)

const PANE = {
  title: 'Agents',
  isFocused: false,
  bodyColumns: 60,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
} as const

const BAND = {
  hasSurvey: false,
  isWorking: true,
  maxRows: 10,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
} as const

test('names models, time and what a row has done', () => {
  expect(modelName('claude-haiku-4-5-20251001')).toBe('haiku 4.5')
  expect(modelName('claude-fable-5-1')).toBe('fable 5.1')
  expect(modelName('haiku')).toBe('haiku')
  expect(modelName(undefined)).toBe('model ?')
  expect(elapsed(64_000)).toBe('1m 04s')
  expect(clock(44_000)).toBe('0:44')
  expect(clock(3_753_000)).toBe('1:02:33')
  expect(compact(999)).toBe('999')
  expect(compact(41_400)).toBe('41k')
  expect(compact(1_240_000)).toBe('1.2M')
  expect(money(0.114)).toBe('$0.11')
  expect(money(123.4)).toBe('$123')
  expect(standing(row('a'), 64_000)).toBe('1m 04s')
  expect(standing(row('a', { status: 'failed', endedAt: 9000 }), 64_000)).toBe('failed 9s')
  expect(work(row('a', { tools: 12, lastTool: 'Grep' }))).toBe('Grep · 12 tools')
  expect(work(row('a', { status: 'completed', tools: 1, tokens: 3400 }))).toBe('1 tool · 3k out')
})

test('a role keeps its hat and hue, and a type that does its work shares them', () => {
  expect(lookOf('scout')).toEqual({ hat: 'feather', color: '#3987e5' })
  expect(lookOf('Explore')).toEqual(lookOf('scout'))
  expect(lookOf('my-plugin:patch-verifier')).toEqual(lookOf('reviewer'))
  expect(lookOf('general-purpose').hat).toBe('beanie')
  // Every role the deck knows wears a hat of its own.
  expect(new Set(['scout', 'runner', 'builder', 'reviewer', 'architect', 'other'].map(one => lookOf(one).hat)).size).toBe(6)
})

test('gives every agent a short name of its own, and keeps the one a call gave', () => {
  const { rows, added } = christen([row('a'), row('b', { name: 'lint' }), row('c', { nick: 'Bo' }), row('d')], 0)

  expect(rows.map(one => one.nick)).toEqual(['Ada', 'lint', 'Bo', 'Cy'])
  expect(added).toBe(2)
  // Past the list's end the names come round again with a number.
  expect(christen([row('a')], 24).rows[0]?.nick).toBe('Ada2')
  expect(briefing(rows.slice(0, 1))).toBe('Ada = Explore agent, id a, running: Find the auth code')
})

test('orders children under the agent that spawned them, and the finished latest first', () => {
  const ordered = tree([row('a'), row('b'), row('c', { parentId: 'a' }), row('d', { parentId: 'gone' })])

  expect(ordered.map(one => `${one.row.id}:${one.depth}`)).toEqual(['a:0', 'c:1', 'b:0', 'd:0'])

  const split = sections([
    row('a'),
    row('b', { status: 'completed', endedAt: 5 }),
    row('c', { status: 'failed', endedAt: 9 }),
  ])

  expect(split.running.map(one => one.row.id)).toEqual(['a'])
  expect(split.finished.map(one => one.id)).toEqual(['c', 'b'])
})

test('says what a tool was called with, and reads a posted plan', () => {
  expect(argOf('Bash', { command: 'git log\n  --oneline -5' })).toBe('git log --oneline -5')
  expect(argOf('Read', { file_path: 'C:\\repo\\apps\\anchor-ui\\domain\\session.ts' })).toBe('domain/session.ts')
  expect(argOf('Grep', { pattern: 'tenantId', path: 'apps/anchor-ui/services' })).toBe('"tenantId" in anchor-ui/services')
  expect(argOf('WebFetch', { url: 'https://example.com/docs' })).toBe('example.com/docs')
  expect(argOf('mcp__x__y', { anything: 1 })).toBe('')
  expect(briefOf('Find\n\n  the   auth code.')).toBe('Find the auth code.')

  expect(parseSteps([{ title: ' Map the  services ', status: 'doing' }])).toEqual([{ title: 'Map the services', status: 'doing' }])
  expect(parseSteps([])).toMatch(/non-empty array/)
  expect(parseSteps([{ title: 'x', status: 'soon' }])).toMatch(/must be one of todo, doing, done/)
  expect(parseSteps([{ status: 'todo' }])).toMatch(/non-empty `title`/)

  expect(progressOf(row('a'))).toBeUndefined()
  expect(
    progressOf(
      row('a', {
        steps: [
          { title: 'Brief', status: 'done' },
          { title: 'Draw', status: 'doing' },
          { title: 'Check', status: 'todo' },
        ],
      }),
    ),
  ).toEqual({ done: 1, total: 3, doing: 'Draw' })
})

test('counts the step in hand as done once the agent has completed, and only then', () => {
  // The plan every agent leaves behind: it reports in its last step, and cannot mark that step done first.
  const steps = [
    { title: 'Read', status: 'done' as const },
    { title: 'Report', status: 'doing' as const },
  ]
  const skipped = [...steps, { title: 'Never begun', status: 'todo' as const }]

  expect(progressOf(row('a', { status: 'completed', endedAt: 5, steps }))).toEqual({ done: 2, total: 2, doing: undefined })
  expect(progressOf(row('a', { status: 'completed', endedAt: 5, steps: skipped }))).toEqual({ done: 2, total: 3, doing: undefined })

  for (const status of ['running', 'idle', 'failed', 'killed']) {
    expect(progressOf(row('a', { status, steps }))).toEqual({ done: 1, total: 2, doing: 'Report' })
  }

  // The line above the prompt counts the same way, and the row as kept is not rewritten.
  const kept = row('z', { status: 'completed', startedAt: 10, endedAt: 500, steps })

  expect(stripOf([row('b', { startedAt: 5 }), kept])).toMatchObject({ running: 1, finished: 1, done: 2, steps: 2 })
  expect(kept.steps).toEqual(steps)
})

test('prices the four counts at the list rates, and prices nothing it has no rate or count for', () => {
  // 1000 in at $4, 2000 out at $20, 100k read at $0.20, 10k written at $5, each per million.
  expect(micro(costOf(spend(1000, 2000, 100_000, 10_000), 'claude-opus-5-5'))).toBe(114_000)
  expect(micro(costOf(spend(10, 2400), 'claude-haiku-4-5-20251001'))).toBe(12_010)
  expect(costOf(spend(1_000_000, 0), 'claude-fable-5-1')).toBe(10)
  expect(costOf(spend(0, 0, 1_000_000), 'claude-fable-5-1')).toBe(0.25)
  expect(costOf(spend(0, 0, 1_000_000), 'claude-fable-5')).toBe(1)

  // Every row of the table, by a model id it is meant for: a million of each count, at its own rate.
  const each = spend(1_000_000, 1_000_000, 1_000_000, 1_000_000)
  const listed: readonly (readonly [string, number])[] = [
    ['claude-fable-5-1', 10 + 50 + 0.25 + 12.5],
    ['claude-mythos-5-1', 10 + 50 + 0.25 + 12.5],
    ['claude-fable-5', 10 + 50 + 1 + 12.5],
    ['claude-opus-5-5', 4 + 20 + 0.2 + 5],
    ['claude-opus-5', 5 + 25 + 0.5 + 6.25],
    ['claude-opus-4-8', 5 + 25 + 0.5 + 6.25],
    ['claude-opus-4-6', 5 + 25 + 0.5 + 6.25],
    ['claude-sonnet-5-5', 2 + 10 + 0.2 + 2.5],
    ['claude-sonnet-5', 2 + 10 + 0.2 + 2.5],
    ['claude-sonnet-4-6', 3 + 15 + 0.3 + 3.75],
    ['claude-haiku-5-5', 0.1 + 0.5 + 0.01 + 0.125],
    ['claude-haiku-4-5-20251001', 1 + 5 + 0.1 + 1.25],
  ]

  for (const [model, usd] of listed) {
    expect(micro(costOf(each, model)), model).toBe(micro(usd))
  }

  // No row of the table is dead: each is the first to match some model above.
  expect(
    new Set(listed.map(([model]) => ESTIMATED_USD_PER_MTOK.findIndex(([pattern]) => pattern.test(model)))).size,
  ).toBe(ESTIMATED_USD_PER_MTOK.length)
  // An older Opus is priced otherwise, and is not in the table: no figure.
  expect(costOf(each, 'claude-opus-4-1')).toBeUndefined()
  // An alias or a model with no listed price costs nobody knows what: no figure, not zero.
  expect(costOf(spend(1000, 2000), 'haiku')).toBeUndefined()
  expect(costOf(spend(1000, 2000), undefined)).toBeUndefined()
  expect(costOf(undefined, 'claude-opus-5-5')).toBeUndefined()
  expect(totalOf(spend(1000, 2000, 100_000, 10_000))).toBe(113_000)

  const sum = totals(
    [
      row('a', { model: 'claude-opus-5-5', spent: spend(1000, 2000, 100_000, 10_000), startedAt: 1000 }),
      row('b', { model: 'claude-haiku-4-5', spent: spend(10, 2400), status: 'completed', startedAt: 0, endedAt: 9000 }),
      // Counted, but on a model with no price: its tokens are in the sum, its cost is not guessed.
      row('c', { model: 'mystery-1', spent: spend(500, 500), status: 'completed', startedAt: 0, endedAt: 1000 }),
      // Kept from before the deck counted: in the time, in nothing else.
      row('d', { status: 'completed', tokens: 3400, startedAt: 0, endedAt: 2000 }),
    ],
    5000,
  )

  expect(micro(sum.usd)).toBe(126_010)
  expect(sum.tokens).toBe(113_000 + 2410 + 1000)
  expect(sum.output).toBe(4900)
  expect(sum.counted).toBe(3)
  // The cost is a part, and the sum says of how many agents it leaves the cost out.
  expect(sum.unpriced).toBe(1)
  expect(sum.ms).toBe(4000 + 9000 + 1000 + 2000)
  expect(totals([row('d', { tokens: 3400 })], 0).usd).toBeUndefined()
  expect(totals([row('d', { tokens: 3400 })], 0).unpriced).toBe(0)
})

test('a cost that leaves an unpriced agent out says so wherever it is written', () => {
  // One agent on a listed model, one that ran two million tokens on a model with no price.
  const agents = [
    row('a', { nick: 'Ada', model: 'claude-opus-5-5', spent: spend(1000, 2000, 100_000, 10_000) }),
    row('b', { nick: 'Bo', model: 'mystery-1', spent: spend(1_000_000, 1_000_000) }),
  ]
  const sum = totals(agents, 0)

  expect(micro(sum.usd)).toBe(114_000)
  expect(sum.tokens).toBe(2_113_000)
  expect(sum.unpriced).toBe(1)
  expect(about(0.114, true)).toBe('≈$0.11+')
  expect(about(0.114, false)).toBe('≈$0.11')

  const deck = { agents, main: null, meter: { usd: 1.92 }, roster: [], now: 0, isLight: false }
  const svg = deckSvg(deck)

  // The tile's figure wears the mark, with how many beside it; the footnote says what the mark means.
  expect(svg).toContain('>≈$0.11+</text>')
  expect(svg).toContain('>1 unpriced</text>')
  expect(svg).toContain('>2.1M</text>')
  expect(svg).toContain('no listed price')
  expect(altOf(deck)).toContain('the agents about $0.11 at list prices and 1 unpriced')
  // Too narrow for the caption: the mark alone.
  expect(deckSvg({ ...deck, width: 380 })).toContain('>≈$0.11+</text>')
  expect(deckSvg({ ...deck, width: 380 })).not.toContain('>1 unpriced</text>')
  // The unpriced agent's own row shows its tokens and no cost; the priced one no mark.
  expect(svg).toContain('>2.0M</text>')
  expect(svg).toContain('>≈$0.11</text>')

  const strip = stripOf(agents)

  expect(strip).toEqual({ running: 2, finished: 0, done: 0, steps: 0, usd: 0.11, hasUnpriced: true })
  expect(stripSvg(strip ?? { running: 0, finished: 0, done: 0, steps: 0 }, false)).toContain('>agents cost ≈$0.11+</text>')
  // With no cost at all there is no mark to hold: the line keeps nothing it does not draw.
  expect(stripOf([agents[1] ?? row('b')])).toEqual({ running: 1, finished: 0, done: 0, steps: 0 })
  // Every price known: no mark, and no note of one.
  expect(deckSvg({ ...deck, agents: agents.slice(0, 1) })).not.toMatch(/≈\$0\.11\+|unpriced|no listed price/)
})

test('prices each request at the model that answered it, and never the rest again', () => {
  const usage = spend(1000, 2000, 100_000, 10_000)
  // Twenty requests on Opus 5.5, then a fallback answers the twenty-first.
  let agent = row('a', { model: 'claude-opus-5-5' })

  for (let index = 0; index < 20; index++) {
    agent = stepped(agent, 't1', usage, 'claude-opus-5-5')
  }

  expect(micro(agent.usd)).toBe(20 * 114_000)

  const after = stepped({ ...agent, model: 'claude-opus-5' }, 't1', usage, 'claude-opus-5')

  // 1000 in at $5, 2000 out at $25, 100k read at $0.50, 10k written at $6.25: the one request, not all 21.
  expect(micro(after.usd)).toBe(20 * 114_000 + 167_500)
  expect(after.unpriced).toBe(0)
  expect(micro(billOf(after)?.usd)).toBe(20 * 114_000 + 167_500)

  // The turn ends with the same count its requests gave: nothing is priced again, whatever the last model was.
  const ended = settled(after, 't1', spendOf(after), 'claude-haiku-4-5')

  expect(micro(ended.usd)).toBe(20 * 114_000 + 167_500)
  expect(ended.spent).toEqual(spendOf(after))

  // The turn's own count holds one request the deck never saw: that much is priced, at the model that answered last.
  const short = stepped(row('b'), 't1', usage, 'claude-opus-5-5')
  const whole = settled(short, 't1', spend(2000, 4000, 200_000, 20_000), 'claude-opus-5')

  expect(micro(whole.usd)).toBe(114_000 + 167_500)
  // A request on a model with no price is counted beside the cost, and makes the cost a part.
  const mixed = stepped(short, 't1', spend(10, 20, 30, 40), 'mystery-1')

  expect(micro(mixed.usd)).toBe(114_000)
  expect(mixed.unpriced).toBe(100)
  expect(work({ ...mixed, status: 'completed' })).toBe('113k tok · ≈$0.11+')
  // A row counted before each request was priced is priced whole once, then request by request.
  const old = row('c', { model: 'claude-opus-5-5', spent: usage })

  expect(micro(billOf(old)?.usd)).toBe(114_000)
  expect(micro(stepped(old, 't2', usage, 'claude-opus-5').usd)).toBe(114_000 + 167_500)
  expect(billOf(row('d', { model: 'mystery-1', spent: usage }))).toEqual({ unpriced: 113_000 })
  expect(billOf(row('e'))).toBeUndefined()
  // Counts that are not numbers read as none, and never as a cost.
  expect(spendFrom({ input_tokens: 5, output_tokens: Number.NaN } as never)).toEqual(spend(5, 0))
  expect(spendFrom(undefined as never)).toEqual(spend(0, 0))
})

test('adds up a turn request by request, and takes the turn\'s own count once it ends', () => {
  const once = stepped(row('a'), 't1', spend(1000, 200, 40_000, 5000))

  expect(once.turn).toEqual({ id: 't1', ...spend(1000, 200, 40_000, 5000) })
  expect(once.context).toBe(46_000)
  expect(once.tokens).toBe(200)

  const twice = stepped(once, 't1', spend(50, 300, 46_000, 900))

  expect(spendOf(twice)).toEqual(spend(1050, 500, 86_000, 5900))
  // The fill is the last request's, not the sum: the window holds one conversation.
  expect(twice.context).toBe(46_950)
  expect(twice.tokens).toBe(500)

  // The turn ends with the engine's own sum: it stands, and nothing is counted twice.
  const ended = settled(twice, 't1', spend(1050, 520, 86_000, 5900))

  expect(ended.turn).toBeUndefined()
  expect(ended.spent).toEqual(spend(1050, 520, 86_000, 5900))
  expect(ended.tokens).toBe(520)
  // An interrupted turn gives no count: what its requests added up to is kept.
  expect(settled(twice, 't1', undefined).spent).toEqual(spend(1050, 500, 86_000, 5900))
  // A turn the deck never saw a request of is still counted when it ends.
  expect(settled(row('a'), 't9', spend(10, 2400)).spent).toEqual(spend(10, 2400))
  // More work for the same agent: the first turn, its end unseen, is kept under the second.
  expect(spendOf(stepped(twice, 't2', spend(1, 1, 1, 1)))).toEqual(spend(1051, 501, 86_001, 5901))
  // Nothing counted and nothing given: the row stays one the deck has no count for.
  expect(spendOf(settled(row('a'), 't1', undefined))).toBeUndefined()
})

test('a row kept from before the deck counted is read as it is, and draws without a made-up figure', () => {
  // The shape 0.3 saved: output tokens and nothing else.
  const old = row('a', { nick: 'Ada', status: 'completed', endedAt: 9000, tools: 1, tokens: 3400, model: 'claude-opus-5-5' })

  expect(spendOf(old)).toBeUndefined()
  expect(costOf(spendOf(old), old.model)).toBeUndefined()
  expect(fillOf(old, 1_000_000)).toBeUndefined()
  expect(work(old)).toBe('1 tool · 3k out')

  const svg = deckSvg({ agents: [old], main: null, roster: [], now: 64_000, isLight: false })

  expect(svg).toContain('>Ada</tspan>')
  expect(svg).toContain('>0:09</text>')
  expect(svg).not.toContain('≈')
  expect(svg).not.toContain('>ctx ')
  // Counts the state lost read as zero, so a half-kept row still adds up.
  expect(spendOf(row('b', { spent: { output: 5 } as Spend }))).toEqual(spend(0, 5))
  expect(work(row('b', { status: 'completed', model: 'claude-opus-5-5', spent: spend(1000, 2000, 100_000, 10_000) }))).toBe(
    '113k tok · ≈$0.11',
  )
})

test('measures a fill against the window the engine states, a published one, or not at all', () => {
  const main = { model: 'claude-opus-5-5' }
  const meter = { window: 500_000, percent: 23 }

  // The session's own model: the engine's window, whatever a table says.
  expect(windowOf('claude-opus-5-5', main, meter)).toBe(500_000)
  expect(windowOf('claude-haiku-4-5-20251001', main, meter)).toBe(200_000)
  expect(windowOf('claude-opus-5-5', null, null)).toBe(1_000_000)
  expect(windowOf('mystery-1', main, meter)).toBeUndefined()
  expect(windowOf(undefined, main, meter)).toBeUndefined()
  expect(fillOf(row('a', { context: 41_000 }), 200_000)).toBe(21)
  expect(fillOf(row('a', { context: 41_000 }), undefined)).toBeUndefined()
  expect(fillOf(row('a'), 200_000)).toBeUndefined()

  const base = { main, meter, roster: [], now: 0, isLight: false }

  expect(deckSvg({ ...base, agents: [row('a', { model: 'claude-haiku-4-5', context: 41_000 })] })).toContain('>ctx 21%</text>')
  // No window known: the tokens themselves, not a percentage of a guess.
  expect(deckSvg({ ...base, agents: [row('a', { model: 'mystery-1', context: 41_000 })] })).toContain('>ctx 41k</text>')
})

test('under a running agent: the call in hand, then its plan, or what it was asked', () => {
  const base = { main: null, roster: [], now: 64_000, isLight: false }
  const agent = row('a', {
    nick: 'Ada',
    lastTool: 'Bash',
    lastArg: 'git log --oneline',
    brief: 'Map the backend.',
    steps: [
      { title: 'List the services', status: 'done' },
      { title: 'Trace <session> & tenant', status: 'doing' },
      { title: 'Write the map', status: 'todo' },
    ],
  })
  const planned = deckSvg({ ...base, agents: [agent] })

  expect(planned).toContain('>Bash</tspan> git log --oneline</text>')
  expect(planned).toContain('>List the services</text>')
  expect(planned).toContain('font-weight="700" fill="#f0eee6">Trace &lt;session&gt; &amp; tenant</text>')
  // Its row says how far along it is and the step in hand.
  expect(planned).toContain('>1/3</tspan> · Trace &lt;session&gt; &amp; tenant</text>')
  // A plan stands in for the brief: the person reads what is ahead, not the ask again.
  expect(planned).not.toContain('asked:')

  // Folded, the row alone: the count and the step in hand stay, the list goes.
  const folded = deckSvg({ ...base, agents: [agent], isFolded: true })

  expect(folded).toContain('>1/3</tspan> · Trace')
  expect(folded).not.toContain('>List the services</text>')

  const asked = deckSvg({ ...base, agents: [row('a', { nick: 'Ada', brief: 'Map the backend.', lastTool: 'Grep', lastArg: '"x"' })] })

  expect(asked).toContain('>asked: Map the backend.</text>')
  // With no plan the row says so, and names the call in hand instead of a step.
  expect(asked).toContain('>no plan</tspan> · Grep &quot;x&quot;</text>')
  // Once it has finished, an agent is one row again.
  expect(deckSvg({ ...base, agents: [row('a', { status: 'completed', endedAt: 9, brief: 'Map the backend.' })] })).not.toContain(
    'asked:',
  )
})

test('a bar through the plan in the role\'s hue; grey to the window\'s fill, or empty, where there is no plan', () => {
  const base = { main: null, meter: null, roster: [], now: 0, isLight: false }
  const hue = lookOf('builder').color
  const half = deckSvg({
    ...base,
    agents: [
      row('a', {
        type: 'builder',
        steps: [
          { title: 'One', status: 'done' },
          { title: 'Two', status: 'doing' },
        ],
      }),
    ],
  })

  // From the text's left edge (a crab of 51 and a gap of 10) to 700: 639 across, half of it filled.
  expect(half).toContain(`<rect x="61" y="184" width="639" height="4" rx="2" fill="#898781" fill-opacity="0.22"/>`)
  expect(half).toContain(`<rect x="61" y="184" width="319.5" height="4" rx="2" fill="${hue}"/>`)

  const bare = deckSvg({ ...base, agents: [row('a', { type: 'builder' })] })

  expect(bare).toContain('>no plan</tspan>')
  expect(bare).not.toContain(`rx="2" fill="${hue}"/>`)
  // The track alone under the agent: one filled bar would be a number nobody gave.
  expect(bare.match(/height="4" rx="2" fill="#898781"\/>/g)).toBeNull()

  const filled = deckSvg({ ...base, agents: [row('a', { type: 'builder', model: 'claude-haiku-4-5', context: 50_000 })] })

  expect(filled).toContain(`<rect x="61" y="184" width="159.75" height="4" rx="2" fill="#898781"/>`)
  expect(filled).not.toContain(`rx="2" fill="${hue}"/>`)
})

test('draws the deck: the sums, who runs, who finished, their models and the team', () => {
  const deck = {
    agents: [
      row('a', { type: 'builder', nick: 'Ada', model: 'claude-opus-5-5', effort: 'medium', tools: 3, lastTool: 'Edit' }),
      row('b', { type: 'scout', nick: 'Bo', model: 'claude-haiku-5-5', status: 'completed', endedAt: 9000 }),
      row('c', { type: 'runner', nick: 'Cy', description: 'Run <tsc> & build', status: 'failed', endedAt: 4000 }),
    ],
    main: { model: 'claude-opus-5-5' },
    roster: [{ name: 'scout', source: 'userSettings' }],
    now: 64_000,
    isLight: false,
  }
  const svg = deckSvg(deck)

  expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 700 \d+"/)
  expect(svg).toContain('>RUNNING · 1<')
  expect(svg).toContain('>FINISHED · 2<')
  // Finished below running, as the reference has it.
  expect(svg.indexOf('>RUNNING · 1<')).toBeLessThan(svg.indexOf('>FINISHED · 2<'))
  expect(svg).toContain('>Ada</tspan>')
  expect(svg).toContain(`fill="${lookOf('builder').color}">builder</tspan>`)
  expect(svg).toContain('>opus 5.5 · medium</tspan>')
  expect(svg).toContain('>haiku 5.5</tspan>')
  expect(svg).toContain('>1:04</text>')
  expect(svg).toContain('>Find the auth code</text>')
  expect(svg).toContain('>failed</tspan>')
  expect(svg).toContain('>0:04</text>')
  expect(svg).toContain('>YOUR TEAM<')
  // Text from a task is escaped, or the drawing is not XML.
  expect(svg).toContain('Run &lt;tsc&gt; &amp; build')
  expect(svg.replace(/<\/?[a-zA-Z][^<>]*>/g, '')).not.toMatch(/[<>]/)
  expect(deckSvg({ ...deck, isLight: true })).toContain('fill="#0b0b0b"')
  expect(altOf(deck)).toBe(
    'Agents: main on opus 5.5. Running: Ada (builder, opus 5.5). Finished: Bo (scout, haiku 5.5), Cy (runner, model ?).',
  )
  expect(deckSvg({ ...deck, agents: [], roster: [] })).toContain('>no subagents yet<')
  // Drawn to the width it is given, so the surface has nothing to stretch.
  expect(deckSvg({ ...deck, width: 420 })).toMatch(/^<svg [^>]*viewBox="0 0 420 \d+" width="420"/)
})

test('heads the deck with three tiles: an estimated cost, the tokens and the time, over its agents', () => {
  const deck = {
    agents: [
      row('a', { nick: 'Ada', model: 'claude-opus-5-5', spent: spend(1000, 2000, 100_000, 10_000), startedAt: 20_000 }),
      row('b', { nick: 'Bo', model: 'claude-haiku-4-5', spent: spend(10, 2400), status: 'completed', startedAt: 0, endedAt: 44_000 }),
    ],
    main: { model: 'claude-opus-5-5', effort: 'high' },
    meter: { window: 1_000_000, percent: 23, usd: 1.92 },
    roster: [],
    now: 66_000,
    isLight: false,
  }
  const svg = deckSvg(deck)

  // Two costs that are not one thing, each named: the large figure is the listed agents alone,
  // an estimate that wears its sign; the small one is the engine's own for the whole session.
  expect(svg).toContain('>Agents cost</text>')
  expect(svg).toContain('>≈$0.13</text>')
  expect(svg).toContain('>whole session $1.92</text>')
  expect(svg).not.toMatch(/>Cost<|>session \$/)
  // The caption fits the tile beside its name at the dock's width, to the dearest two-figure sum.
  expect(deckSvg({ ...deck, meter: { usd: 99.99 } })).toContain('>whole session $99.99</text>')
  expect(svg).toContain('>Tokens</text>')
  expect(svg).toContain('>115k</text>')
  expect(svg).toContain('>4k out</text>')
  expect(svg).toContain('>Time</text>')
  expect(svg).toContain('>1:30</text>')
  expect(svg).toContain('>sum of 2 agents</text>')
  // The tiles come first, then the main loop with the fill the engine measured.
  expect(svg.indexOf('>Agents cost</text>')).toBeLessThan(svg.indexOf('>Main</tspan>'))
  expect(svg).toContain('>ctx 23%</text>')
  expect(svg).toContain('>opus 5.5 · high</text>')
  // Each agent's own figures, and what the sign means said once beneath.
  expect(svg).toContain('>≈$0.11</text>')
  expect(svg).toContain('>113k</text>')
  expect(svg).toContain('>≈$0.01</text>')
  expect(svg).toContain('≈ agents only, list prices × the tokens the engine counted: an estimate, not a bill')
  expect(altOf(deck)).toMatch(/115k tokens, the agents about \$0\.13 at list prices\. Whole session \$1\.92\.$/)

  // Nothing counted yet: a dash, not a zero that reads as free.
  const empty = deckSvg({ ...deck, agents: [], meter: null })

  expect(empty).toContain('>Agents cost</text>')
  expect(empty).toContain('>–</text>')
  expect(empty).not.toContain('≈')
})

test('a crab at work moves, where the person has not asked for less motion; the rest stand still', () => {
  const base = { main: null, roster: [], now: 0, isLight: false }
  const working = deckSvg({ ...base, agents: [row('a'), row('b', { status: 'waiting' })] })

  expect(working).toContain('@media (prefers-reduced-motion:no-preference)')
  expect(working.match(/class="go"/g)?.length).toBe(1)

  const still = deckSvg({ ...base, agents: [row('a', { status: 'completed', endedAt: 5 }), row('b', { status: 'waiting' })] })

  expect(still).not.toContain('<style>')
  expect(still).not.toContain('class="go"')
  // The hat is the role's: its hue is in the drawing beside the shell's.
  expect(still).toContain(`fill="${lookOf('Explore').color}"`)
  expect(still).toContain('fill="#d97757"')
})

test('a full deck stays a drawing a surface will take', () => {
  // Every row the deck keeps, all at work, each with the longest plan it may post.
  const steps = Array.from({ length: 12 }, (_, index) => ({
    title: `Step ${index} ${'of a long plan with a long title '.repeat(3)}`.slice(0, 90),
    status: 'doing' as const,
  }))
  const crowd = Array.from({ length: 60 }, (_, index) =>
    row(`a${index}`, {
      nick: `Ada${index}`,
      type: 'builder',
      model: 'claude-opus-5-5',
      effort: 'medium',
      lastTool: 'Bash',
      lastArg: 'x'.repeat(120),
      spent: spend(1000, 2000, 100_000, 10_000),
      context: 111_000,
      steps,
    }),
  )
  const svg = deckSvg({
    agents: [...crowd.slice(0, 30), ...crowd.slice(30).map(one => ({ ...one, status: 'completed', endedAt: 9 }))],
    main: { model: 'claude-opus-5-5' },
    meter: { window: 1_000_000, percent: 23, usd: 1.92 },
    roster: ['scout', 'runner', 'builder', 'reviewer', 'architect'].map(name => ({ name, source: 'userSettings' })),
    now: 64_000,
    isLight: false,
  })

  // An Svg's source may be 131072 characters at most.
  expect(svg.length).toBeLessThan(131_072)
  expect(svg).toContain('>RUNNING · 30<')
  expect(svg).toContain('>+ 14 more at work</text>')
  expect(svg).toContain('>FINISHED · 30<')
  expect(svg).toContain('>+ 18 earlier</text>')
})

test('sums the run in hand for the line above the prompt, and says nothing with no agent at work', () => {
  expect(stripOf([])).toBeNull()
  expect(stripOf([row('a', { status: 'completed', endedAt: 5 })])).toBeNull()
  // A teammate waiting for a message is listed in the pane, but it is not work in hand.
  expect(stripOf([row('a', { status: 'idle' })])).toBeNull()

  const strip = stripOf([
    // Ended before the run began: not in its sums.
    row('z', { status: 'completed', startedAt: 0, endedAt: 500, steps: [{ title: 'Old', status: 'done' }] }),
    row('a', {
      startedAt: 1000,
      model: 'claude-opus-5-5',
      spent: spend(1000, 2000, 100_000, 10_000),
      steps: [
        { title: 'One', status: 'done' },
        { title: 'Two', status: 'doing' },
      ],
    }),
    row('b', { startedAt: 1200, status: 'waiting' }),
    row('c', {
      status: 'completed',
      startedAt: 900,
      endedAt: 4000,
      model: 'claude-haiku-4-5',
      spent: spend(10, 2400),
      steps: [{ title: 'Only', status: 'done' }],
    }),
  ])

  expect(strip).toEqual({ running: 2, finished: 1, done: 2, steps: 3, usd: 0.13 })

  const svg = stripSvg(strip ?? { running: 0, finished: 0, done: 0, steps: 0 }, false)

  expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 460 20" width="460" height="20"/)
  expect(svg).toContain('>2 running</text>')
  expect(svg).toContain('>1 finished</text>')
  expect(svg).toContain('>steps 2/3</text>')
  // Named as the agents' cost: the session's own figure stands in another panel, and is another number.
  expect(svg).toContain('>agents cost ≈$0.13</text>')
  // Two thirds of the bar, in the crab's own colour.
  expect(svg).toMatch(/<rect x="0" y="16" width="306\.6\d*" height="3" rx="1\.5" fill="#d97757"\/>/)
  expect(stripAlt(strip ?? { running: 0, finished: 0, done: 0, steps: 0 })).toBe(
    'Agents: 2 running, 1 finished, 2 of 3 steps done, agents cost about $0.13.',
  )
  // No plan and no price: the counts alone, over an empty track.
  expect(stripSvg({ running: 1, finished: 0, done: 0, steps: 0 }, true)).not.toMatch(/>steps |≈|rx="1\.5" fill="#d97757"/)
  // A walk that divides the three seconds between drawings, so a new drawing never cuts a step.
  expect(svg).toContain('animation:legs .75s')
  expect(svg).not.toContain('.8s')

  // The longest each slot can hold: sixty agents, every one with the longest plan. No figure reaches the next.
  const full = stripSvg({ running: 60, finished: 60, done: 100, steps: 720, usd: 99.99, hasUnpriced: true }, false)
  const slots = [...full.matchAll(/<text x="(\d+)" y="12" fill="[^"]+">([^<]+)<\/text>/g)].map(found => ({
    from: Number(found[1]),
    to: Number(found[1]) + (found[2] ?? '').length * 7.2,
  }))

  expect(full).toContain('>steps 100/720</text>')
  expect(full).toContain('>agents cost ≈$99.99+</text>')
  expect(slots.length).toBe(4)
  expect(slots.every((slot, index) => slot.to <= (slots[index + 1]?.from ?? 460))).toBe(true)

  // A narrow column: the steps in the bar alone, the cost under a shorter name, and still nothing left out or overlapping.
  const narrow = stripSvg({ running: 60, finished: 60, done: 100, steps: 720, usd: 99.99, hasUnpriced: true }, false, 310)

  expect(narrow).toContain('>agents ≈$99.99+</text>')
  expect(narrow).not.toContain('>steps ')
  expect(narrow).toMatch(/<rect x="0" y="16" width="43\.0\d*" height="3" rx="1\.5" fill="#d97757"\/>/)
})

test('lists a spawned agent under a name, tells the model who it is, then marks it done', async ($, on) => {
  let listed: AgentInfo[] = []
  const filled: string[] = []
  const told: string[][] = []
  const clock = mock.clock(on, { now: 1000 })

  on('session.start', ($$, e) => ({ cwd: e.cwd }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('command.register', () => ({ value: { command: 'agent-deck' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__agent-deck__plan' } }))
  on('config.list', () => ({ value: [] }))
  on('agent.list', () => ({ value: listed }))
  on('agent.spawn', () => ({ model: 'claude-haiku-4-5-20251001', agentId: 'a1' }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('turn.complete', () => ({ text: '' }))
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  on('prompt.fill', ($$, e) => {
    filled.push(e.text)

    return { isFilled: true }
  })
  on('prompt.submit', ($$, e) => {
    told.push([...(e.context ?? [])])

    return { text: e.text }
  })

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.agent.spawn({
    prompt: 'Find it.',
    description: 'Find the auth code',
    subagentType: 'Explore',
    tool_use_id: 'toolu_1',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'claude-opus-5-5',
    background: false,
    fork: false,
  })
  listed = [{ id: 'a1', description: 'Find the auth code', type: 'Explore', status: 'running' }]
  await clock.advance(3000)

  const terminal = await $.ui.mount({
    plugin: 'agent-deck',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'agent-deck',
    props: PANE,
  })

  expect(await terminal.find({ type: 'Text', text: /opus 5\.5/ })).toBeDefined()
  expect(await terminal.find({ type: 'Text', text: 'Ada' })).toBeDefined()
  expect(await terminal.find({ type: 'Text', text: /haiku 4\.5 · 3s/ })).toBeDefined()
  expect(await terminal.find({ type: 'Text', text: /RUNNING · 1/ })).toBeDefined()
  await terminal.unmount()

  // The agent posts its plan: it is kept on its row. The main loop's call posts nothing.
  const posted = await $.tool.call({
    tool: 'mcp__agent-deck__plan',
    agentId: 'a1',
    steps: [
      { title: 'Search the routes', status: 'doing' },
      { title: 'Report', status: 'todo' },
    ],
  })

  expect(String(posted.result)).toBe('Plan posted: 0 of 2 done.')
  expect(String((await $.tool.call({ tool: 'mcp__agent-deck__plan', steps: [{ title: 'x', status: 'todo' }] })).result)).toMatch(
    /for subagents/,
  )
  expect((await $.tool.check({ tool: 'mcp__agent-deck__plan', input: { steps: [] } })).decision).toBe('allow')

  await $.prompt.submit({ text: 'Ask Ada to look again', wait: false, origin: { kind: 'composer' } })
  expect(told.at(-1)?.join('\n')).toContain('Ada = Explore agent, id a1, running: Find the auth code')

  await $.turn.complete({
    answer: 'Found.',
    durationMs: 5000,
    isAborted: false,
    reason: 'answer',
    turnId: 't1',
    agentId: 'a1',
    usage: {
      model: 'claude-haiku-4-5-20251001',
      input_tokens: 10,
      output_tokens: 2400,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
  })

  // The plain-text pane says the same sums the drawing does.
  const after = await $.ui.mount({
    plugin: 'agent-deck',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'agent-deck',
    props: PANE,
  })

  // No session figure here (the host measured nothing): the agents' estimate alone, named as theirs.
  expect(await after.find({ type: 'Text', text: 'agents cost ≈$0.01 est. · 2k tokens · 0:03 agent time' })).toBeDefined()
  // It completed, so the step it had in hand is done; the one it never began is not.
  expect(await after.find({ type: 'Text', text: /steps 1\/2 · 2k tok · ≈\$0\.01/ })).toBeDefined()
  await after.unmount()

  const ui = await $.ui.mount({
    plugin: 'agent-deck',
    surface: 'desktop',
    component: 'Pane',
    requestId: 'agent-deck',
    props: PANE,
  })

  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  expect((await ui.find({ key: 'ask-a1' }))?.text).toBe('Ask Ada')
  await ui.press({ key: 'ask-a1' })
  expect(filled).toEqual(['Ask Ada to '])
  await ui.press({ key: 'clear' })
  expect(await ui.find({ key: 'ask-a1' })).toBeUndefined()
  expect(await ui.find({ key: 'clear' })).toBeUndefined()
  await ui.unmount()
})

test('counts an agent\'s requests as they come back, shows the line above the prompt, and takes it away', async ($, on) => {
  let listed: AgentInfo[] = []
  const opened: string[] = []
  const clock = mock.clock(on, { now: 100_000 })
  const usage = {
    model: 'claude-opus-5-5',
    input_tokens: 1000,
    output_tokens: 2000,
    cache_read_input_tokens: 100_000,
    cache_creation_input_tokens: 10_000,
  }

  on('session.start', ($$, e) => ({ cwd: e.cwd }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 1_000_000, tokens: 230_000, percent: 23 }, rateLimits: [], cost: { usd: 1.92 } },
  }))
  on('command.register', () => ({ value: { command: 'agent-deck' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__agent-deck__plan' } }))
  on('config.list', () => ({ value: [] }))
  on('agent.list', () => ({ value: listed }))
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'b1' }))
  on('ui.open', ($$, e) => {
    opened.push(e.id)

    return { value: { isPlaced: true } }
  })
  on('turn.complete', () => ({ text: '' }))
  // The model's answer to one request: two pieces of text as they stream, then the response and what the API said it cost.
  const answered: unknown[] = []

  on('turn.step', async function* ($$, e) {
    yield { kind: 'text' as const, index: 0, text: 'Hel' }
    yield { kind: 'text' as const, index: 0, text: 'lo' }

    const response = { turnId: e.turnId, index: e.index, answer: 'Hello', toolUses: [], stopReason: 'tool_use' as const, usage }

    answered.push(response)

    return response
  })
  on('ui.render', { component: 'AbovePrompt' }, ($$, e) => {
    const { Box } = $$.ui.resolve(e)

    return <Box />
  })

  const band = (surface: 'terminal' | 'desktop') =>
    $.ui.mount({ plugin: 'agent-deck', surface, component: 'AbovePrompt', props: BAND })

  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })

  // Nobody at work: the band is whatever was beneath, with no line of the deck's.
  const quiet = await band('desktop')

  expect(await quiet.find({ key: 'deck' })).toBeUndefined()
  expect(await quiet.find({ type: 'Svg' })).toBeUndefined()
  await quiet.unmount()

  await $.agent.spawn({
    prompt: 'Build it.',
    description: 'Build the page',
    subagentType: 'builder',
    tool_use_id: 'toolu_2',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'claude-opus-5-5',
    background: false,
    fork: false,
  })
  listed = [{ id: 'b1', description: 'Build the page', type: 'builder', status: 'running' }]
  await $.tool.call({
    tool: 'mcp__agent-deck__plan',
    agentId: 'b1',
    steps: [
      { title: 'Brief', status: 'done' },
      { title: 'Lay out the page', status: 'doing' },
      { title: 'Check', status: 'todo' },
    ],
  })

  const stream = $.turn.step({
    turnId: 't1',
    index: 0,
    model: 'claude-opus-5-5',
    effort: 'medium',
    messageCount: 2,
    agentId: 'b1',
  })
  const streamed: unknown[] = []
  // Read as the engine reads it, a piece at a time: the last read holds what the chain returned.
  let read = await stream.next()

  while (read.done !== true) {
    streamed.push(read.value)
    read = await stream.next()
  }

  // The deck reads the response and changes nothing of it: each piece once, in order, and the same result and usage.
  expect(streamed).toEqual([
    { kind: 'text', index: 0, text: 'Hel' },
    { kind: 'text', index: 0, text: 'lo' },
  ])
  expect(answered.length).toBe(1)
  expect(read.value).toEqual(answered[0])
  expect(read.value.usage).toEqual(usage)

  await clock.advance(3000)

  const line = await band('desktop')
  const drawn = String((await line.find({ type: 'Svg' }))?.props.source)

  expect(drawn).toContain('>1 running</text>')
  expect(drawn).toContain('>0 finished</text>')
  expect(drawn).toContain('>steps 1/3</text>')
  expect(drawn).toContain('>agents cost ≈$0.11</text>')
  // One line: a drawing of a fixed size and the button, side by side.
  expect((await line.find({ type: 'Svg' }))?.props.height).toBe(20)
  expect((await line.find({ key: 'deck' }))?.text).toBe('Agents')
  await line.press({ key: 'deck' })
  expect(opened).toEqual(['agent-deck', 'agent-deck'])
  await line.unmount()

  const plain = await band('terminal')

  expect(await plain.find({ type: 'Text', text: '1 running · 0 finished · steps 1/3 · agents cost ≈$0.11' })).toBeDefined()
  // Where nothing is drawn the bar is text: a third of ten cells.
  expect(await plain.find({ type: 'Text', text: '███░░░░░░░' })).toBeDefined()
  expect(await plain.find({ key: 'deck' })).toBeDefined()
  await plain.unmount()

  // The dock as the desktop has it, about 700 pixels: wide enough for every figure.
  const pane = await $.ui.mount({
    plugin: 'agent-deck',
    surface: 'desktop',
    component: 'Pane',
    requestId: 'agent-deck',
    props: { ...PANE, bodyColumns: 90 },
  })
  const deck = async () => String((await pane.find({ type: 'Svg' }))?.props.source)

  // The request's input side against the window the engine states for the session's own model.
  expect(await deck()).toContain('>ctx 11%</text>')
  expect(await deck()).toContain('>113k</text>')
  // The tile says whose cost each figure is: the agents' estimate, and the engine's own for everything.
  expect(await deck()).toContain('>Agents cost</text>')
  expect(await deck()).toContain('>whole session $1.92</text>')
  expect(await deck()).toContain('>1/3</tspan> · Lay out the page</text>')
  expect(await deck()).toContain('>Brief</text>')
  // A press folds the plans away; the label keeps its length, so nothing beside it moves.
  expect((await pane.find({ key: 'fold' }))?.text).toBe('Hide plans')
  await pane.press({ key: 'fold' })
  expect((await pane.find({ key: 'fold' }))?.text).toBe('Show plans')
  expect(await deck()).not.toContain('>Brief</text>')
  expect(await deck()).toContain('>1/3</tspan> · Lay out the page</text>')
  await pane.unmount()

  // The turn ends with the same count the request gave: nothing is counted twice.
  await $.turn.complete({ answer: 'Built.', durationMs: 5000, isAborted: false, reason: 'answer', turnId: 't1', agentId: 'b1', usage })
  listed = []
  await clock.advance(3000)

  const done = await $.ui.mount({
    plugin: 'agent-deck',
    surface: 'desktop',
    component: 'Pane',
    requestId: 'agent-deck',
    props: PANE,
  })
  const last = String((await done.find({ type: 'Svg' }))?.props.source)

  expect(last).toContain('>FINISHED · 1<')
  expect(last).toContain('>≈$0.11</text>')
  expect(last).toContain('>113k</text>')
  expect(last).not.toContain('<style>')
  await done.unmount()

  // With no agent at work the line is gone again.
  const gone = await band('desktop')

  expect(await gone.find({ key: 'deck' })).toBeUndefined()
  await gone.unmount()
})

type Usage = {
  model: string
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

// 113k tokens on Opus 5.5: $0.114 at the list rates.
const USAGE: Usage = {
  model: 'claude-opus-5-5',
  input_tokens: 1000,
  output_tokens: 2000,
  cache_read_input_tokens: 100_000,
  cache_creation_input_tokens: 10_000,
}

const PIECES = [
  { kind: 'text', index: 0, text: 'Hel' },
  { kind: 'text', index: 0, text: 'lo' },
] as const

/**
 * What the hook-level tests stand on: a session the engine measures, an agent
 * that spawns as `b1`, and a model that answers each request with two pieces
 * of text and then the next of `answers` as what the API said it cost
 * (`missing` for a response that carries no usage field at all).
 */
const stage = (on: On, now: number, answers: (Usage | null | 'missing')[]) => {
  const time = mock.clock(on, { now })
  const listed: AgentInfo[] = []
  const filled: string[] = []
  const answered: unknown[] = []

  on('session.start', ($$, e) => ({ cwd: e.cwd }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 1_000_000, tokens: 230_000, percent: 23 }, rateLimits: [], cost: { usd: 1.92 } },
  }))
  on('command.register', () => ({ value: { command: 'agent-deck' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__agent-deck__plan' } }))
  on('config.list', () => ({ value: [] }))
  on('agent.list', () => ({ value: listed }))
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'b1' }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('turn.complete', () => ({ text: '' }))
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  on('prompt.fill', ($$, e) => {
    filled.push(e.text)

    return { isFilled: true }
  })
  on('turn.step', async function* ($$, e) {
    yield* PIECES

    const next = answers.shift() ?? null
    const response = {
      turnId: e.turnId,
      index: e.index,
      answer: 'Hello',
      toolUses: [],
      stopReason: 'end_turn' as const,
      usage: next === 'missing' ? (undefined as never) : next,
    }

    answered.push(response)

    return response
  })

  return { time, listed, filled, answered }
}

type Stage = ReturnType<typeof stage>

const begin = async ($: Engine, held: Stage, name?: string) => {
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await $.agent.spawn({
    prompt: 'Build it.',
    description: 'Build the page',
    subagentType: 'builder',
    tool_use_id: 'toolu_3',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'claude-opus-5-5',
    background: false,
    fork: false,
    ...(name === undefined ? {} : { name }),
  })
  held.listed.push({ id: 'b1', description: 'Build the page', type: 'builder', status: 'running', ...(name === undefined ? {} : { name }) })
}

// One request, read to its end as the engine reads it: the pieces that came out, and the response.
const ask = async ($: Engine, turnId: string, agentId?: string, model = 'claude-opus-5-5') => {
  const stream = $.turn.step({
    turnId,
    index: 0,
    model,
    effort: 'medium',
    messageCount: 2,
    ...(agentId === undefined ? {} : { agentId }),
  })
  const pieces: unknown[] = []
  let read = await stream.next()

  while (read.done !== true) {
    pieces.push(read.value)
    read = await stream.next()
  }

  // The last read holds what the chain returned.
  return { pieces, response: read.value }
}

const end = ($: Engine, turnId: string, usage?: Usage) =>
  $.turn.complete({
    answer: 'Done.',
    durationMs: 1000,
    isAborted: false,
    reason: 'answer',
    turnId,
    agentId: 'b1',
    ...(usage === undefined ? {} : { usage }),
  })

// The pane as the desktop's dock draws it, about 700 pixels wide: its drawing's source.
const drawing = async ($: Engine) => {
  const pane = await $.ui.mount({
    plugin: 'agent-deck',
    surface: 'desktop',
    component: 'Pane',
    requestId: 'agent-deck',
    props: { ...PANE, bodyColumns: 90 },
  })
  const source = String((await pane.find({ type: 'Svg' }))?.props.source)

  await pane.unmount()

  return source
}

test('a request of the main loop is the main loop\'s: it names the model there, and no agent\'s row is touched', async ($, on) => {
  const held = stage(on, 200_000, [USAGE])

  await begin($, held)

  const { pieces, response } = await ask($, 'm1', undefined, 'claude-fable-5-1')

  expect(pieces).toEqual([...PIECES])
  expect(response).toEqual(held.answered[0])
  expect(response.usage).toEqual(USAGE)
  await held.time.advance(3000)

  const svg = await drawing($)

  expect(svg).toContain('>fable 5.1 · medium</text>')
  // The agent has spent nothing the deck knows of: no tokens, no cost, on its row or in the tiles.
  expect(svg).toContain('>RUNNING · 1<')
  expect(svg).toContain('>opus 5.5</tspan>')
  expect(svg).not.toContain('≈')
  expect(svg.match(/>–<\/text>/g)?.length).toBe(2)
})

test('a response with no usage counts nothing, and goes on up as it came', async ($, on) => {
  const held = stage(on, 300_000, [null, 'missing', USAGE])

  await begin($, held)

  const none = await ask($, 't1', 'b1')

  expect(none.pieces).toEqual([...PIECES])
  expect(none.response).toEqual(held.answered[0])
  expect(none.response.usage).toBeNull()

  // A response that carries no usage field at all: read as none, and nothing thrown after the stream.
  const bare = await ask($, 't1', 'b1')

  expect(bare.pieces).toEqual([...PIECES])
  expect(bare.response.answer).toBe('Hello')
  expect(await drawing($)).not.toContain('≈')

  // The next one is counted as ever.
  await ask($, 't1', 'b1')

  const svg = await drawing($)

  expect(svg).toContain('>113k</text>')
  expect(svg).toContain('>≈$0.11</text>')
})

test('turn after turn on one agent adds up once each, a fallback\'s request at the fallback\'s price', async ($, on) => {
  const fallback = { ...USAGE, model: 'claude-opus-5' }
  const held = stage(on, 400_000, [USAGE, fallback])

  await begin($, held)
  await ask($, 't1', 'b1')
  await end($, 't1', USAGE)

  const first = await drawing($)

  expect(first).toContain('>113k</text>')
  expect(first).toContain('>≈$0.11</text>')
  expect(first).toContain('>FINISHED · 1<')

  // It is given more work: listed as running again, a second turn, answered this time by a fallback model.
  await held.time.advance(3000)
  await ask($, 't2', 'b1')
  await end($, 't2', fallback)

  const second = await drawing($)

  // $0.114 for the first request and $0.1675 for the second: neither priced at the other's rate.
  expect(second).toContain('>226k</text>')
  expect(second).toContain('>≈$0.28</text>')
  expect(second).not.toMatch(/≈\$0\.2[39]|≈\$0\.3/)

  // A third turn the deck saw no request of: its own count is all there is, and it is counted.
  await end($, 't3', USAGE)

  const third = await drawing($)

  expect(third).toContain('>339k</text>')
  expect(third).toContain('>≈$0.40</text>')

  // The plain-text pane names the two costs as the drawing does.
  const plain = await $.ui.mount({ plugin: 'agent-deck', surface: 'terminal', component: 'Pane', requestId: 'agent-deck', props: PANE })

  expect(
    await plain.find({ type: 'Text', text: /^agents cost ≈\$0\.40 est\. · whole session \$1\.92 · 339k tokens · \d+:\d\d agent time$/ }),
  ).toBeDefined()
  await plain.unmount()
})

test('a long name is cut where it is drawn, and written whole when its button is pressed', async ($, on) => {
  const name = 'n'.repeat(40)
  const held = stage(on, 500_000, [])

  await begin($, held, name)

  const pane = await $.ui.mount({
    plugin: 'agent-deck',
    surface: 'desktop',
    component: 'Pane',
    requestId: 'agent-deck',
    props: { ...PANE, bodyColumns: 90 },
  })
  const source = String((await pane.find({ type: 'Svg' }))?.props.source)

  expect(source).toContain(`>${'n'.repeat(17)}…</tspan>`)
  expect(source).not.toContain('n'.repeat(18))
  expect((await pane.find({ key: 'ask-b1' }))?.text).toBe(`Ask ${'n'.repeat(15)}…`)
  await pane.press({ key: 'ask-b1' })
  expect(held.filled).toEqual([`Ask ${name} to `])
  await pane.unmount()
})

test('who an agent is fits its line at any width: a long name or role never runs under the mark', () => {
  const agent = row('a', { nick: 'N'.repeat(60), type: 'R'.repeat(60), model: 'claude-opus-5-5', effort: 'medium', status: 'waiting' })
  const base = { agents: [agent], main: null, roster: [{ name: 'T'.repeat(60), source: 'userSettings' }], now: 0, isLight: false }

  for (const width of [380, 460, 700, 1200]) {
    const svg = deckSvg({ ...base, width })
    // The row's second line: who it is, from the text's left edge.
    const second = /<text x="(\d+)" y="\d+" font-size="11\.5">(<tspan.*?)<\/text>/.exec(svg)
    const parts = [...(second?.[2] ?? '').matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map(found => found[1] ?? '')
    const drawn = parts.join('').length * 11.5 * 0.6 + (parts.length - 1) * 7

    expect(parts[0], String(width)).toBe(`${'N'.repeat(17)}…`)
    expect(parts).toContain('waiting')
    // Its end is short of the mark, which takes the row's last eighteen pixels.
    expect(Number(second?.[1]) + drawn, String(width)).toBeLessThanOrEqual(width - 18)
    expect(svg).not.toMatch(/N{19}|R{21}|T{21}/)
  }

  expect(deckSvg({ ...base, width: 700 })).toContain(`>${'R'.repeat(19)}…</tspan>`)
  expect(deckSvg({ ...base, width: 700 })).toContain(`>${'T'.repeat(19)}…</text>`)
})

test('text that XML cannot hold never reaches a drawing', () => {
  expect(printable('a\u0000b\u001b[31mc\u007f\uFFFE')).toBe('ab[31mc')
  // Half a pair is dropped; a whole one, a tab and a line end are kept.
  expect(printable('a\ud83db\ude00c')).toBe('abc')
  expect(printable('ok 😀\n\t')).toBe('ok 😀\n\t')
  // A cut never lands inside a pair.
  expect(cut('ab😀cd', 3)).toBe('ab')
  expect(cut('ab😀cd', 4)).toBe('ab😀')
  expect(cut('ab😀', 4)).toBe('ab😀')
  expect(clip('ab😀cd', 4)).toBe('ab…')
  expect(clip('ab😀', 4)).toBe('ab😀')
  expect(flat('a\u0007 b\u000bc\n d')).toBe('a b c d')
  expect(briefOf(`${'x'.repeat(258)}😀 and more`)).toBe(`${'x'.repeat(258)}…`)
  expect(argOf('Bash', { command: `printf '\u001b[31mred\u0000'` })).toBe(`printf '[31mred'`)

  const odd = `\u001b[1mFix\u0000 the ${'x'.repeat(72)}😀😀😀😀😀😀 tests`
  const svg = deckSvg({
    agents: [
      row('a', {
        nick: 'A\u0001da',
        type: 'bui\u0002lder',
        description: odd,
        model: 'claude-\u0003opus-5-5',
        effort: 'me\u0004dium',
        lastTool: 'Ba\u0005sh',
        lastArg: odd,
        steps: [{ title: odd, status: 'doing' }],
      }),
      row('b', { description: odd, brief: `${odd} ${odd}`, lastTool: 'Grep', lastArg: `${'y'.repeat(60)}😀😀😀😀😀😀😀😀` }),
      row('c', { description: `${'z'.repeat(80)}😀😀😀`, status: 'completed', endedAt: 5 }),
    ],
    main: { model: 'claude-\u0006opus-5-5', effort: '\ud83d' },
    roster: [{ name: 'sc\u0008out\udc00', source: 'userSettings' }],
    now: 0,
    isLight: false,
  })

  // Nothing forbidden and no half pair anywhere in the markup: cleaning it again changes nothing.
  expect(printable(svg)).toBe(svg)
  expect(svg).toContain('>Ada</tspan>')
  expect(svg).toContain('Fix the xxx')
  // Cut where it did not fit, and on a whole character.
  expect(svg).toContain(`${'z'.repeat(80)}…</text>`)
  expect(altOf({ agents: [row('a', { nick: 'N'.repeat(60) })], main: null, roster: [], now: 0, isLight: false })).toContain(
    `${'N'.repeat(17)}… (Explore`,
  )
})

test('a deck too long to draw is folded, then drawn in fewer rows, until a surface will take it', () => {
  // Text that grows fivefold when it is escaped, after it was measured to fit.
  const noisy = '"&<'.repeat(40)
  const steps = Array.from({ length: 12 }, () => ({ title: noisy.slice(0, 90), status: 'doing' as const }))
  const crowd = Array.from({ length: 28 }, (_, index) =>
    row(`a${index}`, { nick: `Ada${index}`, type: 'builder', description: noisy, lastTool: 'Bash', lastArg: noisy, brief: noisy, steps }),
  )
  const deck = {
    agents: [...crowd.slice(0, 16), ...crowd.slice(16).map(one => ({ ...one, status: 'completed', endedAt: 9 }))],
    main: { model: 'claude-opus-5-5' },
    roster: Array.from({ length: 40 }, (_, index) => ({ name: `role-${index}`, source: 'userSettings' })),
    now: 64_000,
    isLight: false,
  }
  const whole = deckSvg(deck)

  // As asked for it would be refused, and a refused drawing closes the pane.
  expect(whole.length).toBeGreaterThan(LIMIT)
  expect(whole).toContain('&quot;&amp;&lt;')

  const fitted = deckFitted(deck)

  expect(fitted.length).toBeLessThanOrEqual(LIMIT)
  // Folded: every row still there, the plans beneath them gone.
  expect(fitted).toBe(deckSvg({ ...deck, isFolded: true }))
  expect(fitted).toContain('>RUNNING · 16<')
  expect(fitted).toContain('>Ada15</tspan>')
  // One that fits is drawn as it is.
  expect(deckFitted({ ...deck, agents: deck.agents.slice(0, 2) })).toBe(deckSvg({ ...deck, agents: deck.agents.slice(0, 2) }))

  // Where folding is not enough, fewer rows: the counts stay true and say what is not drawn.
  const tight = deckFitted(deck, 60_000)

  expect(tight.length).toBeLessThanOrEqual(60_000)
  expect(tight).toContain('>RUNNING · 16<')
  expect(tight).toMatch(/>\+ \d+ more at work<\/text>/)
  expect(tight).toMatch(/>\+ \d+ earlier<\/text>/)
  // With no room for any row at all, the sums and the counts are still drawn.
  expect(deckFitted(deck, 1)).toContain('>+ 16 more at work</text>')

  // The team is drawn to a dozen, and says how many more there are.
  expect(whole.match(/>role-\d+<\/text>/g)?.length).toBe(12)
  expect(whole).toContain('>+ 28 more</text>')
})

test(
  'a press on the hud button opens the pane, and closes it when it is up',
  {
    plugins: [
      {
        name: 'hud',
        register(on) {
          on('command.run', { command: 'poke' }, async $ => {
            await $.state.set({ plugin: 'hud', key: 'signal' }, { to: 'agent-deck', n: 1 })

            return { text: 'poked' }
          })
        },
      },
    ],
  },
  async ($, on) => {
    const opened: string[] = []
    const closed: string[] = []
    let isUp = false

    mock.clock(on)
    on('agent.list', () => ({ value: [] }))
    on('ui.panes', () => ({
      value: isUp ? [{ id: 'agent-deck', title: 'Agents', isShown: true, isFocused: false, isPlaced: true }] : [],
    }))
    on('ui.open', ($$, e) => {
      opened.push(e.id)
      isUp = true

      return { value: { isPlaced: true } }
    })
    on('ui.close', ($$, e) => {
      closed.push(e.id)
      isUp = false

      return { value: undefined }
    })

    const poke = () =>
      $.command.run({
        command: 'poke',
        args: '',
        origin: { kind: 'composer' },
        presentation: { isFullscreen: false, columns: 100 },
      })

    await poke()
    expect(opened).toEqual(['agent-deck'])
    expect(closed).toEqual([])

    await poke()
    expect(closed).toEqual(['agent-deck'])
  },
)

test('a turn-end count below its requests takes nothing back, and a control character leaves one space', () => {
  const one = spend(1000, 2000, 100_000, 10_000)
  const twice = stepped(stepped(row('a', { model: 'claude-opus-5-5' }), 't1', one, 'claude-opus-5-5'), 't1', one, 'claude-opus-5-5')
  const ended = settled(twice, 't1', spend(500, 1000, 50_000, 5000), 'claude-opus-5-5')

  // The tokens kept are those the requests were priced at, so the two figures on a row agree.
  expect(totalOf(spendOf(ended) ?? spend(0, 0, 0, 0))).toBe(226_000)
  expect(micro(billOf(ended)?.usd)).toBe(228_000)
  expect(flat('a \u0001 b')).toBe('a b')
})
