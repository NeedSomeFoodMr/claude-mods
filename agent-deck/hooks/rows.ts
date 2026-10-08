import type { AgentInfo, ModelUsage } from 'claude-code'

import type { AgentRow, MainLoop, Meter, Spend, Step, Strip } from '../types'

const LIVE = ['pending', 'running', 'waiting', 'idle']
const MARKS: Record<string, string> = {
  pending: '○',
  running: '●',
  waiting: '◐',
  idle: '◌',
  completed: '✓',
  failed: '✗',
  killed: '■',
}

// Short enough to type, in an order that says who came first.
const NICKS = [
  'Ada', 'Bo', 'Cy', 'Dot', 'Eli', 'Fay', 'Gus', 'Hal', 'Ivy', 'Jax', 'Kit', 'Leo',
  'Mae', 'Ned', 'Oz', 'Pip', 'Rex', 'Sky', 'Taz', 'Uma', 'Val', 'Wes', 'Yui', 'Zed',
]

export type Look = { hat: string; color: string }

// A role keeps its hat and its hue wherever it shows. The hues are the dark
// steps of a validated categorical palette; the hat's shape and the written
// role carry the same fact, so the colour never speaks alone.
const LOOKS: Record<string, Look> = {
  scout: { hat: 'feather', color: '#3987e5' },
  runner: { hat: 'wings', color: '#c98500' },
  builder: { hat: 'helmet', color: '#199e70' },
  reviewer: { hat: 'mortarboard', color: '#d55181' },
  architect: { hat: 'wizard', color: '#d95926' },
  plan: { hat: 'paper', color: '#008300' },
  other: { hat: 'beanie', color: '#898781' },
}
// Types that do a known role's work under another name.
const ALIKE: readonly (readonly [RegExp, string])[] = [
  [/explor|search|research|scout|find|discover|inventory|loader/, 'scout'],
  [/review|verif|audit|assur|critique/, 'reviewer'],
  [/run|test|check/, 'runner'],
  [/build|generat|patch|implement|writ/, 'builder'],
  [/architect|design/, 'architect'],
  [/plan/, 'plan'],
]

export const isLive = (row: AgentRow) => LIVE.includes(row.status)

export const markFor = (status: string) => MARKS[status] ?? '·'

/** `my-plugin:code-checker` reads as `code-checker`. */
export const roleName = (type: string) => type.slice(type.lastIndexOf(':') + 1)

export const lookOf = (type: string): Look => {
  const role = roleName(type).toLowerCase()
  const alike = ALIKE.find(([pattern]) => pattern.test(role))?.[1]

  return LOOKS[role] ?? LOOKS[alike ?? 'other'] ?? { hat: 'beanie', color: '#898781' }
}

/** `claude-haiku-4-5-20251001` reads as `haiku 4.5`. */
export const modelName = (model: string | undefined) =>
  model === undefined
    ? 'model ?'
    : model
        .replace(/^claude-/, '')
        .replace(/-\d{8}$/, '')
        .replace(/-(\d+)-(\d+)$/, ' $1.$2')
        .replace(/-(\d+)$/, ' $1')

export const elapsed = (ms: number) => {
  const seconds = Math.max(0, Math.round(ms / 1000))

  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`
}

/** A time in a width that barely moves: `0:44`, `12:05`, `1:02:33`. */
export const clock = (ms: number) => {
  const seconds = Math.max(0, Math.round(ms / 1000))
  const pair = (value: number) => String(value).padStart(2, '0')

  return seconds < 3600
    ? `${Math.floor(seconds / 60)}:${pair(seconds % 60)}`
    : `${Math.floor(seconds / 3600)}:${pair(Math.floor((seconds % 3600) / 60))}:${pair(seconds % 60)}`
}

export const compact = (tokens: number) =>
  tokens >= 999_500
    ? `${(tokens / 1_000_000).toFixed(tokens >= 9_950_000 ? 0 : 1)}M`
    : tokens >= 1000
      ? `${Math.round(tokens / 1000)}k`
      : String(tokens)

export const money = (usd: number) => (usd >= 100 ? `$${Math.round(usd)}` : `$${usd.toFixed(2)}`)

/** A cost as it is written: `≈$0.11`, with a `+` where some of what was counted has no price and is not in it. */
export const about = (usd: number, isPartial: boolean) => `≈${money(usd)}${isPartial ? '+' : ''}`

/** A bar in text, for a surface that draws none: `███░░░░░░░` for three parts of ten. */
export const track = (part: number, width: number) => {
  const filled = Math.round(Math.min(1, Math.max(0, part)) * width)

  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

export const nickOf = (row: AgentRow) => row.nick ?? row.name ?? roleName(row.type)

/** The first short name nobody holds, from the `from`th on; a second round adds a number. */
const freshNick = (taken: readonly string[], from: number) => {
  for (let at = from; at < from + NICKS.length * 9; at++) {
    const round = Math.floor(at / NICKS.length)
    const nick = `${NICKS[at % NICKS.length] ?? 'Agent'}${round === 0 ? '' : round + 1}`

    if (!taken.includes(nick)) {
      return nick
    }
  }

  return `Agent${from}`
}

/** Every row under a name of its own: the call's where it gave one, a short one otherwise. */
export const christen = (rows: readonly AgentRow[], from: number): { rows: AgentRow[]; added: number } => {
  const taken = rows.flatMap(one => (one.nick === undefined ? [] : [one.nick]))
  let added = 0

  const named = rows.map(row => {
    if (row.nick !== undefined) {
      return row
    }

    const nick = row.name !== undefined && !taken.includes(row.name) ? row.name : freshNick(taken, from + added)
    added += row.name === nick ? 0 : 1
    taken.push(nick)

    return { ...row, nick }
  })

  return { rows: named, added }
}

/**
 * The rows against the engine's list: it is the truth about who runs; the rows
 * keep what it drops (an agent that ended) and what it never says (model,
 * tools, tokens).
 */
export const reconcile = (rows: readonly AgentRow[], live: readonly AgentInfo[], time: number): AgentRow[] => {
  const known = new Set(rows.map(one => one.id))
  const listed = new Map(live.map(one => [one.id, one]))

  const kept = rows.map(row => {
    const info = listed.get(row.id)

    if (info === undefined) {
      return isLive(row) ? { ...row, status: 'completed', endedAt: row.endedAt ?? time } : row
    }

    const isOver = !isLive({ ...row, status: info.status })

    return {
      ...row,
      status: info.status,
      type: info.type,
      description: info.description,
      name: info.name,
      parentId: info.parentId,
      endedAt: isOver ? (row.endedAt ?? time) : undefined,
    }
  })
  const found = live
    .filter(one => !known.has(one.id))
    .map(
      (one): AgentRow => ({
        id: one.id,
        type: one.type,
        description: one.description,
        name: one.name,
        parentId: one.parentId,
        status: one.status,
        startedAt: time,
        tools: 0,
        tokens: 0,
      }),
    )

  return [...kept, ...found]
}

/** Parents first, each one's children after it, with how deep each sits. */
export const tree = (rows: readonly AgentRow[]): { row: AgentRow; depth: number }[] => {
  const ids = new Set(rows.map(one => one.id))
  const out: { row: AgentRow; depth: number }[] = []

  const walk = (parentId: string | undefined, depth: number) => {
    for (const row of rows) {
      const isRoot = row.parentId === undefined || !ids.has(row.parentId)

      if (parentId === undefined ? isRoot : row.parentId === parentId) {
        out.push({ row, depth })

        if (depth < 8) {
          walk(row.id, depth + 1)
        }
      }
    }
  }

  walk(undefined, 0)

  return out
}

/** The running ones as a tree, then the finished ones, the latest first. */
export const sections = (rows: readonly AgentRow[]) => ({
  running: tree(rows.filter(isLive)),
  finished: rows
    .filter(one => !isLive(one))
    .sort((a, b) => (b.endedAt ?? b.startedAt) - (a.endedAt ?? a.startedAt)),
})

/** How it stands, in a word and a time: `1m 04s` while it runs, `failed 9s` after. */
export const standing = (row: AgentRow, now: number) => {
  const ran = elapsed((row.endedAt ?? now) - row.startedAt)
  const word = { running: '', completed: '', killed: 'stopped' }[row.status] ?? row.status

  return word === '' ? ran : `${word} ${ran}`
}

/**
 * What a million tokens cost in US dollars, by the model that answered:
 * Anthropic's list prices as published on 2026-10-06.
 *
 * AN ESTIMATE, NOT A BILL. A subscription is not charged by the token; a cache
 * write is priced at the five-minute rate, since the engine does not say which
 * it was; tiered and fast-mode rates are not applied. The first pattern that
 * matches the model's id wins, and a model none matches has no price: no cost
 * is shown for it, never a guess.
 *
 * Each request is priced as it comes back, at the model that answered it, and
 * the row keeps the running sum: a fallback model answering one request does
 * not reprice the rest. Only what a turn's own count holds beyond its requests'
 * sum (requests the deck never saw) is priced at the turn's last model.
 */
export const ESTIMATED_USD_PER_MTOK: readonly (readonly [RegExp, Spend])[] = [
  [/(fable|mythos)-5-1/, { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 }],
  [/(fable|mythos)-5/, { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 }],
  [/opus-5-5/, { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 }],
  [/opus-(5|4-[678])/, { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 }],
  [/sonnet-5/, { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 }],
  [/sonnet-4/, { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 }],
  [/haiku-5/, { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 }],
  [/haiku-4-5/, { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 }],
]

// The context window of a model family, in tokens, as published the same day:
// what an agent's fill is measured against when it does not run the session's
// own model, whose window the engine states. A family not listed has no
// percentage: its fill is shown in tokens.
const PUBLISHED_WINDOWS: readonly (readonly [RegExp, number])[] = [
  [/haiku-4-5/, 200_000],
  [/(fable|mythos)-5|opus-5|sonnet-5|haiku-5/, 1_000_000],
]

const NOTHING: Spend = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

// A count the state lost reads as zero, so a row of an older shape still adds up.
const add = (a: Spend | undefined, b: Spend | undefined): Spend => ({
  input: (a?.input ?? 0) + (b?.input ?? 0),
  output: (a?.output ?? 0) + (b?.output ?? 0),
  cacheRead: (a?.cacheRead ?? 0) + (b?.cacheRead ?? 0),
  cacheWrite: (a?.cacheWrite ?? 0) + (b?.cacheWrite ?? 0),
})

// A count as a number: anything else the engine might hand over reads as none.
const whole = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0)

/** The engine's four counts under the deck's names. */
export const spendFrom = (usage: ModelUsage): Spend => ({
  input: whole(usage?.input_tokens),
  output: whole(usage?.output_tokens),
  cacheRead: whole(usage?.cache_read_input_tokens),
  cacheWrite: whole(usage?.cache_creation_input_tokens),
})

/** Everything the engine has counted for the agent; undefined for a row kept from before the deck counted. */
export const spendOf = (row: AgentRow): Spend | undefined =>
  row.spent === undefined && row.turn === undefined ? undefined : add(row.spent, row.turn)

/** Every token its requests read or wrote: input of all three kinds, and output. */
export const totalOf = (spend: Spend) => spend.input + spend.output + spend.cacheRead + spend.cacheWrite

/** About what the counts cost at list prices, in dollars; undefined where the counts or the model's price are not known. */
export const costOf = (spend: Spend | undefined, model: string | undefined) => {
  const price = model === undefined ? undefined : ESTIMATED_USD_PER_MTOK.find(([pattern]) => pattern.test(model))?.[1]

  return spend === undefined || price === undefined
    ? undefined
    : (spend.input * price.input +
        spend.output * price.output +
        spend.cacheRead * price.cacheRead +
        spend.cacheWrite * price.cacheWrite) /
        1_000_000
}

/** What counts come to: dollars for the requests whose model has a price, and the tokens of those whose model has none. */
export type Bill = { usd?: number; unpriced: number }

/**
 * What the row's counts come to; undefined where nothing was counted. A row
 * counted before each request was priced has no running sum: it is priced
 * whole, at the model it last ran on.
 */
export const billOf = (row: AgentRow): Bill | undefined => {
  const spend = spendOf(row)

  if (spend === undefined) {
    return undefined
  }

  if (row.usd !== undefined || row.unpriced !== undefined) {
    return { usd: row.usd, unpriced: row.unpriced ?? 0 }
  }

  const usd = costOf(spend, row.model)

  return usd === undefined ? { unpriced: totalOf(spend) } : { usd, unpriced: 0 }
}

// The bill with more counts on it, priced at the model that answered them.
const billed = (bill: Bill | undefined, spend: Spend, model: string | undefined): Bill => {
  const usd = costOf(spend, model)

  return usd === undefined
    ? { usd: bill?.usd, unpriced: (bill?.unpriced ?? 0) + totalOf(spend) }
    : { usd: (bill?.usd ?? 0) + usd, unpriced: bill?.unpriced ?? 0 }
}

// What `a` holds beyond `b`, count by count; a count below takes nothing back.
const beyond = (a: Spend, b: Spend | undefined): Spend => ({
  input: Math.max(0, a.input - (b?.input ?? 0)),
  output: Math.max(0, a.output - (b?.output ?? 0)),
  cacheRead: Math.max(0, a.cacheRead - (b?.cacheRead ?? 0)),
  cacheWrite: Math.max(0, a.cacheWrite - (b?.cacheWrite ?? 0)),
})

/**
 * The row after one more request of the turn `turnId`: its counts added and
 * priced at `model`, the one that answered, and its window's fill as that
 * request saw it.
 */
export const stepped = (row: AgentRow, turnId: string, usage: Spend, model: string | undefined = row.model): AgentRow => {
  const isSame = row.turn?.id === turnId
  const bill = billed(billOf(row), usage, model)

  return {
    ...row,
    // A turn whose end was never seen is kept as spent before the next one begins.
    spent: isSame || row.turn === undefined ? row.spent : add(row.spent, row.turn),
    turn: { id: turnId, ...add(isSame ? row.turn : undefined, usage) },
    context: usage.input + usage.cacheRead + usage.cacheWrite,
    tokens: row.tokens + usage.output,
    usd: bill.usd,
    unpriced: bill.unpriced,
  }
}

/**
 * The row after the turn `turnId` ended: the turn's own count, where the engine
 * gave one, stands over its requests' sum. What it holds beyond that sum was
 * never priced, and is priced now at `model`, the last that answered.
 */
export const settled = (
  row: AgentRow,
  turnId: string,
  usage: Spend | undefined,
  model: string | undefined = row.model,
): AgentRow => {
  const open = row.turn?.id === turnId ? row.turn : undefined
  const more = usage === undefined ? NOTHING : beyond(usage, open)
  // Never below what its requests were priced at: a turn's count that says less takes nothing back.
  const counted = usage === undefined ? open : add(open, more)
  const parts = [row.spent, open === undefined ? row.turn : undefined, counted].filter(part => part !== undefined)
  const bill = totalOf(more) === 0 ? billOf(row) : billed(billOf(row), more, model)

  return {
    ...row,
    spent: parts.length === 0 ? undefined : parts.reduce<Spend>(add, NOTHING),
    turn: undefined,
    tokens: row.tokens + (counted?.output ?? 0) - (open?.output ?? 0),
    ...(bill === undefined ? {} : { usd: bill.usd, unpriced: bill.unpriced }),
  }
}

/** How far through its plan: steps done, steps in all, and the one in hand; undefined where it posted none. */
export const progressOf = (row: AgentRow) => {
  const steps = row.steps ?? []

  return steps.length === 0
    ? undefined
    : {
        done: steps.filter(one => one.status === 'done').length,
        total: steps.length,
        doing: steps.find(one => one.status === 'doing')?.title,
      }
}

/** The window a fill is measured against: the session's own where the agent runs the session's model, the published one otherwise. */
export const windowOf = (model: string | undefined, main: MainLoop | null, meter: Meter | null) =>
  model === undefined
    ? undefined
    : model === main?.model && meter?.window !== undefined
      ? meter.window
      : PUBLISHED_WINDOWS.find(([pattern]) => pattern.test(model))?.[1]

/** How full its window is, as a whole percentage; undefined where the fill or the window is not known. */
export const fillOf = (row: AgentRow, window: number | undefined) =>
  row.context === undefined || window === undefined || window <= 0
    ? undefined
    : Math.min(100, Math.round((row.context / window) * 100))

/**
 * The agents summed: what the engine counted for them, about what that cost,
 * and how long they ran. `unpriced` is how many of the counted agents ran, in
 * whole or in part, on a model with no listed price: their tokens are in the
 * sum and that cost is not, so the cost is said to be a part.
 */
export const totals = (rows: readonly AgentRow[], now: number) => {
  let usd: number | undefined
  let tokens = 0
  let output = 0
  let ms = 0
  let counted = 0
  let unpriced = 0

  for (const row of rows) {
    const spend = spendOf(row)
    const bill = billOf(row)

    ms += Math.max(0, (row.endedAt ?? Math.max(now, row.startedAt)) - row.startedAt)

    if (spend !== undefined) {
      counted += 1
      tokens += totalOf(spend)
      output += spend.output
    }

    if (bill?.usd !== undefined) {
      usd = (usd ?? 0) + bill.usd
    }

    if (bill !== undefined && bill.unpriced > 0) {
      unpriced += 1
    }
  }

  return { usd, tokens, output, ms, counted, unpriced }
}

// An idle teammate waits for a message and may wait all day: it is listed, but it is not work in hand.
const isBusy = (row: AgentRow) => isLive(row) && row.status !== 'idle'

/**
 * The line above the prompt, or null while no agent works. It sums the run in
 * hand: the agents at work and those that ended since the first of them
 * began, so one from an hour ago is not in it.
 */
export const stripOf = (rows: readonly AgentRow[]): Strip | null => {
  const busy = rows.filter(isBusy)

  if (busy.length === 0) {
    return null
  }

  const since = Math.min(...busy.map(one => one.startedAt))
  const past = rows.filter(one => !isLive(one) && (one.endedAt ?? one.startedAt) >= since)
  const run = [...busy, ...past]
  const plan = run.flatMap(one => one.steps ?? [])
  const { usd, unpriced } = totals(run, 0)

  return {
    running: busy.length,
    finished: past.length,
    done: plan.filter(one => one.status === 'done').length,
    steps: plan.length,
    // To the cent, and the mark only beside a cost: the line holds nothing it
    // does not draw, so it is written again only when what it shows changes.
    ...(usd === undefined ? {} : { usd: Math.round(usd * 100) / 100, ...(unpriced > 0 ? { hasUnpriced: true } : {}) }),
  }
}

/** What it has done: the tool in hand while it runs, then its calls, its tokens and about what they cost. */
export const work = (row: AgentRow) => {
  const tools = row.tools === 0 ? [] : [`${row.tools} tool${row.tools === 1 ? '' : 's'}`]
  const last = row.lastTool !== undefined && isLive(row) ? [row.lastTool] : []
  const spend = spendOf(row)
  const bill = billOf(row)
  // A row kept from before the deck counted every token says only what it has: the output it wrote.
  const tokens =
    spend !== undefined && totalOf(spend) > 0
      ? [`${compact(totalOf(spend))} tok`, ...(bill?.usd === undefined ? [] : [about(bill.usd, bill.unpriced > 0)])]
      : row.tokens > 0 && !isLive(row)
        ? [`${compact(row.tokens)} out`]
        : []

  return [...last, ...tools, ...tokens].join(' · ')
}

/** The agents the person can name, as the model is told them. */
export const briefing = (rows: readonly AgentRow[]) =>
  rows
    .map(row => `${nickOf(row)} = ${roleName(row.type)} agent, id ${row.id}, ${row.status}: ${row.description}`)
    .join('\n')

const MAX_STEPS = 12
const STATUSES = ['todo', 'doing', 'done']

/** The text's first `most` units at most, never ending on half of a surrogate pair. */
export const cut = (text: string, most: number) => {
  const end = Math.max(0, Math.min(text.length, Math.floor(most)))
  const last = end > 0 && end < text.length ? text.charCodeAt(end - 1) : 0

  return text.slice(0, last >= 0xd800 && last <= 0xdbff ? end - 1 : end)
}

/** Text held to `most` units, its end saying there was more. */
export const clip = (text: string, most: number) => (text.length <= most ? text : `${cut(text, most - 1).trimEnd()}…`)

/**
 * Text a drawing can hold: without the control characters XML forbids, and
 * without half of a surrogate pair. One such character, and a surface that
 * parses the drawing as XML draws nothing at all.
 */
export const printable = (text: string) =>
  text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\uFFFE\uFFFF]/g, '')
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g, one => (one.length === 2 ? one : ''))

/** Text on one line: every run of spaces and line ends as one space, and nothing a drawing cannot hold. */
export const flat = (text: string) =>
  printable(text.replace(/\s+/g, ' '))
    // A character taken out between two spaces leaves one, not two.
    .replace(/ {2,}/g, ' ')
    .trim()

/** A brief as it begins: enough to say what the agent was asked. */
export const briefOf = (prompt: string) => clip(flat(prompt), 260)

/** The plan a call posts, or why it cannot stand, as the calling agent reads it. */
export const parseSteps = (input: unknown): Step[] | string => {
  if (!Array.isArray(input) || input.length === 0) {
    return '`steps` must be a non-empty array of { title, status }.'
  }

  if (input.length > MAX_STEPS) {
    return `At most ${MAX_STEPS} steps: group the small ones.`
  }

  const steps: Step[] = []

  for (const one of input) {
    const { title, status } = (typeof one === 'object' && one !== null ? one : {}) as Record<string, unknown>

    if (typeof title !== 'string' || flat(title) === '') {
      return 'Every step needs a non-empty `title`.'
    }

    if (typeof status !== 'string' || !STATUSES.includes(status)) {
      return `Step "${clip(flat(title), 40)}": \`status\` must be one of ${STATUSES.join(', ')}.`
    }

    steps.push({ title: clip(flat(title), 90), status: status as Step['status'] })
  }

  return steps
}

const text = (value: unknown) => (typeof value === 'string' ? flat(value) : '')

// A path by its last two parts: enough to know the file without the room a whole one takes.
const tail = (path: string) => path.replace(/\\/g, '/').split('/').filter(part => part !== '').slice(-2).join('/')

/** What a tool was called with, in a few words: the command, the file, the search. */
export const argOf = (tool: string, input: Record<string, unknown>) => {
  switch (tool) {
    case 'Bash':
    case 'PowerShell':
      return clip(text(input.command), 120)
    case 'Read':
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return tail(text(input.file_path ?? input.notebook_path))
    case 'Grep':
      return clip(`"${text(input.pattern)}"${text(input.path) === '' ? '' : ` in ${tail(text(input.path))}`}`, 120)
    case 'Glob':
      return clip(text(input.pattern), 120)
    case 'WebSearch':
      return clip(text(input.query), 120)
    case 'WebFetch':
      return clip(text(input.url).replace(/^https?:\/\//, ''), 120)
    case 'Agent':
      return clip(text(input.description), 120)
    default:
      return ''
  }
}
