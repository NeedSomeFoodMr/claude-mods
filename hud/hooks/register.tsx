import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Category, Reading, Standing, Usage } from '../types'
import { aheadOf, baseNameOf, besideOf, nameOf, statusOf } from './branch'
import { altOf, cardSvg, standingAlt, standingSvg } from './chart'
import { compact, crossed, gauge, levelOf, longLimit, money, resetsIn, shortLimit } from './format'
import { portsOf, urlOf } from './probe'

const HISTORY = 40
const POLL_MS = 20_000
// A static path: a dev server answers it without compiling a page.
const PROBE_PATH = '/favicon.ico'
const PREVIEW_TOOL = /preview_(?:start|stop)$/
const MESSAGES = /^messages$/i
// The engine installs a compaction once its hooks have answered: measure after.
const SETTLE_MS = 400
const DOT = ' · '
// Git only reads here: it takes no lock on the index, so a commit made meanwhile is not refused.
const GIT_ENV = { GIT_OPTIONAL_LOCKS: '0' }
const GIT_MS = 8000

const readings = atom({ plugin: 'hud', key: 'readings' } as const, [])
const categories = atom({ plugin: 'hud', key: 'categories' } as const, [])
const compactAt = atom({ plugin: 'hud', key: 'compactAt' } as const, null)
const usage = atom({ plugin: 'hud', key: 'usage' } as const, null)
const dev = atom({ plugin: 'hud', key: 'dev' } as const, null)
const isCompact = atom({ plugin: 'hud', key: 'isCompact' } as const, false)
const isLight = atom({ plugin: 'hud', key: 'isLight' } as const, false)
const signal = atom({ plugin: 'hud', key: 'signal' } as const, null)
const mods = atom({ plugin: 'hud', key: 'mods' } as const, [])
const git = atom({ plugin: 'hud', key: 'git' } as const, null)

// The companion mods a button can reach, by the command each registers.
const COMPANIONS: readonly (readonly [string, string])[] = [
  ['goals', 'Goals'],
  ['agent-deck', 'Agents'],
  ['files', 'Files'],
  ['replay', 'Replay'],
  ['quick-prompts', 'Prompts'],
]

type Measure = { reading?: Reading; filling: Category[]; threshold: number | null; spent: Usage }

// One call: the last response's figures, and the breakdown estimated locally
// (`summary` sends no request).
const measure = async ($: EngineInterface): Promise<Measure> => {
  const { context, rateLimits, cost } = await $.session.usage({ breakdown: 'summary' })
  const spent: Usage = {
    limits: rateLimits.map(one => ({ kind: one.kind, percent: one.percentUsed, resetsAt: one.resetsAt })),
    usd: cost?.usd,
    at: await $.clock.now(),
  }
  const filling = (context.breakdown?.categories ?? [])
    .filter(one => one.kind === 'used' && one.tokens > 0)
    .map(one => ({ name: one.name, tokens: one.tokens }))
  const threshold = context.breakdown?.autoCompactThreshold ?? null

  if (context.tokens === undefined || context.window <= 0) {
    return { filling, threshold, spent }
  }

  const percent = context.percent ?? Math.round((context.tokens / context.window) * 100)

  return { reading: { percent, tokens: context.tokens, window: context.window }, filling, threshold, spent }
}

// `isTurn` adds a reading to the history; a reload's measure only fills an empty one.
const record = async ($: EngineInterface, isTurn: boolean) => {
  const { reading, filling, threshold, spent } = await measure($)
  const before = await read($, usage)
  const last = (await read($, readings)).at(-1)

  if (reading !== undefined) {
    await update($, readings, list =>
      isTurn ? [...list, reading].slice(-HISTORY) : list.length === 0 ? [reading] : list,
    )
    await update($, categories, () => filling)
    await update($, compactAt, () => threshold)

    const wasCalm = last === undefined || ['good', 'warning'].includes(levelOf(last, threshold))

    if (isTurn && wasCalm && !['good', 'warning'].includes(levelOf(reading, threshold))) {
      $.ui.toast(`Context at ${reading.percent}%: a good moment to /compact`)
    }
  }

  await update($, usage, () => spent)

  for (const one of spent.limits) {
    const mark = crossed(
      before?.limits.find(held => held.kind === one.kind),
      one,
    )

    if (before !== null && mark !== undefined) {
      $.ui.toast(`${longLimit(one.kind)} limit at ${Math.round(one.percent)}%. ${resetsIn(one.resetsAt, spent.at)}`.trim())
    }
  }
}

// A compaction is not a response, so the engine's last figure may still be the
// window as it was. Where it is, the rows that are not the conversation stand
// and the conversation is what the compaction says it left.
const settle = async ($: EngineInterface, after: number | undefined) => {
  const { reading, filling, threshold } = await measure($)
  const last = (await read($, readings)).at(-1)
  const base = reading ?? last

  if (base === undefined) {
    return
  }

  const isFresh = reading !== undefined && (last === undefined || reading.tokens < last.tokens)

  if (!isFresh && after === undefined) {
    return
  }

  const rows = isFresh
    ? filling
    : [...filling.filter(one => !MESSAGES.test(one.name)), { name: 'Messages', tokens: after ?? 0 }]
  const tokens = isFresh ? base.tokens : rows.reduce((sum, one) => sum + one.tokens, 0)
  const settled = { tokens, window: base.window, percent: Math.round((tokens / base.window) * 100) }

  await update($, readings, list => [...list, settled].slice(-HISTORY))
  await update($, categories, () => rows)
  await update($, compactAt, () => threshold)
}

// A press is a write of `signal`: each companion hooks that write and answers
// the ones addressed to it, so no mod calls into another.
const ask = ($: EngineInterface, to: string) => update($, signal, held => ({ to, n: (held?.n ?? 0) + 1 }))

// Which companions are loaded, so the card offers no button that does nothing.
const companions = async ($: EngineInterface) => {
  const names = (await $.command.list()).map(one => one.name)
  const found = COMPANIONS.map(([name]) => name).filter(name => names.includes(name))

  if ((await read($, mods)).join() !== found.join()) {
    await update($, mods, () => found)
  }
}

// The drawing carries its own ink, so it asks which theme the session is in;
// where nothing says, it draws for a dark one.
const theme = async ($: EngineInterface) => {
  try {
    const row = (await $.config.list()).find(one => one.key === 'theme')

    await update($, isLight, () => /light/i.test(String(row?.value ?? '')))
  } catch {
    // No settings menu here: the dark ink stands.
  }
}

// Any answer, a 404 included, means something listens; a refused connection rejects.
const answers = async ($: EngineInterface, port: number) => {
  try {
    await $.http.fetch(`${urlOf(port)}${PROBE_PATH}`, { method: 'HEAD' })

    return true
  } catch {
    return false
  }
}

const launchJson = async ($: EngineInterface) => {
  try {
    const text = await $.fs.read('.claude/launch.json')

    return typeof text === 'string' ? text : undefined
  } catch {
    return undefined
  }
}

// A fetch has no timeout: a port that accepts and never answers must not stack polls.
let isProbing = false

const probe = async ($: EngineInterface) => {
  if (isProbing) {
    return
  }

  isProbing = true

  try {
    const ports = portsOf(await launchJson($))
    const checked = await Promise.all(ports.map(async port => ((await answers($, port)) ? port : undefined)))
    const up = checked.filter(port => port !== undefined)
    const before = await read($, dev)

    // Written on a change alone, so a quiet poll redraws nothing.
    if (before === null || before.up.join() !== up.join() || before.ports.join() !== ports.join()) {
      await update($, dev, () => ({ ports, up }))
    }
  } finally {
    isProbing = false
  }
}

// Git is slow to answer in a large repository: one question at a time, and
// one more after it when it was asked for meanwhile.
let isAsking = false
let isAskedAgain = false
// The branch a repository's work is merged to, kept once it is known for a folder.
let mergedTo: { folder: string; ref: string } | undefined

// Where the repository stands: the branch, how far it is from the one work is
// merged to, and how many files are changed. Asked in the session's own folder,
// which a command's `cd` does not move.
const stand = async ($: EngineInterface) => {
  if (isAsking) {
    isAskedAgain = true

    return
  }

  isAsking = true

  try {
    const folder = await $.session.root().catch(() => '')
    const run = (args: string[]) =>
      $.process
        .run(['git', ...args], { env: GIT_ENV, timeoutMs: GIT_MS, ...(folder === '' ? {} : { cwd: folder }) })
        .catch(() => undefined)
    const status = await run(['status', '--porcelain=v2', '--branch', '-z', '-uall'])

    // Git did not answer in time: what was last read stands, not a blank.
    if (status === undefined) {
      return
    }

    let next: Standing | null = null

    if (status.exitCode === 0) {
      const { branch, changed } = statusOf(status.stdout)
      let ref = mergedTo?.folder === folder ? mergedTo.ref : ''

      if (ref === '') {
        const remote = await run(['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'])

        ref = remote?.exitCode === 0 ? remote.stdout.trim() : ''

        for (const name of ['main', 'master']) {
          if (ref === '') {
            const local = await run(['rev-parse', '--verify', '--quiet', `refs/heads/${name}`])

            ref = local?.exitCode === 0 && local.stdout.trim() !== '' ? name : ''
          }
        }

        // Kept only when there is one: a repository with no commit yet has none, and gets one.
        mergedTo = ref === '' ? undefined : { folder, ref }
      }

      const counted = ref === '' ? undefined : await run(['rev-list', '--left-right', '--count', `${ref}...HEAD`])

      next = {
        branch,
        base: ref === '' ? '' : baseNameOf(ref, branch),
        ...aheadOf(counted?.exitCode === 0 ? counted.stdout : ''),
        changed,
        isBase: ref !== '' && ref.replace(/^origin\//, '') === branch,
      }
    }

    // Written on a change alone, so a quiet poll redraws nothing.
    if (JSON.stringify(await read($, git)) !== JSON.stringify(next)) {
      await update($, git, () => next)
    }
  } finally {
    isAsking = false

    if (isAskedAgain) {
      isAskedAgain = false
      void stand($).catch(() => {})
    }
  }
}

// A turn can run for many minutes while its subagents spend: the session's cost
// is read again on the poll, so the card does not wait for the turn's end to say
// it. Written only when the figure shown has moved, so a quiet poll redraws
// nothing; the limits are left to the turn's end, which tells a threshold crossed.
const tally = async ($: EngineInterface) => {
  const held = await read($, usage)
  const { cost } = await $.session.usage()

  if (held !== null && cost?.usd !== undefined && (held.usd === undefined || money(held.usd) !== money(cost.usd))) {
    await update($, usage, kept => (kept === null ? kept : { ...kept, usd: cost.usd }))
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'hud',
      description: 'Switch the context card above the prompt between its full and its one-line form',
    })
    await theme($)
    await record($, false)
    await probe($)
    // Not waited for: a slow git does not hold the session's start, and its answer redraws the band.
    void stand($).catch(() => {})
    $.clock.every(POLL_MS, () => {
      void probe($).catch(() => {})
      void stand($).catch(() => {})
      void tally($).catch(() => {})
    })
    // The companions register their commands as the session starts: look once they have.
    $.clock.after(800, () => void companions($).catch(() => {}))

    return next(e)
  })

  on('command.run', { command: 'hud' }, async $ => {
    const compacted = !(await read($, isCompact))
    await update($, isCompact, () => compacted)

    return { text: compacted ? 'HUD: one line.' : 'HUD: full card.' }
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      await record($, true)
      await companions($)
      // A turn may have switched the branch or changed files.
      void stand($).catch(() => {})
    }

    return next(e)
  })

  // The card redraws when the conversation shrinks, not at the reply after it.
  on('session.compact', async ($, e, next) => {
    const done = await next(e)

    if (e.agentId === undefined && e.trigger !== 'precompute' && done.skip === undefined) {
      const after = done.tokensAfter

      $.clock.after(SETTLE_MS, () => void settle($, after).catch(() => {}))
    }

    return done
  })

  // Starting or stopping a preview changes the answer now, not at the next poll.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)

    if (PREVIEW_TOOL.test(String(e.tool))) {
      $.clock.after(1500, () => void probe($).catch(() => {}))
    }

    return ran
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const reading = (await read($, readings)).at(-1)

    if (e.props.hasSurvey) {
      return below
    }

    // No response has been measured yet (a session just started or resumed):
    // one line says the card is loaded and when it fills in.
    if (reading === undefined) {
      const { Box, Text } = $.ui.resolve(e)

      return (
        <Box flexDirection="column">
          <Text dimColor>context · appears after the first reply</Text>
          {below}
        </Box>
      )
    }

    const spent = await read($, usage)
    const served = await read($, dev)
    const stands = await read($, git)

    if (e.surface !== 'desktop') {
      const { Box, Text } = $.ui.resolve(e)

      return (
        <Box flexDirection="column">
          <Box gap={1}>
            <Text bold>{reading.percent}%</Text>
            <Text>{gauge(reading.percent, 16)}</Text>
            <Text dimColor>
              {compact(reading.tokens)} / {compact(reading.window)}
              {(spent?.limits ?? []).map(one => DOT + shortLimit(one)).join('')}
              {spent?.usd === undefined ? '' : DOT + money(spent.usd)}
              {served === null ? '' : DOT + (served.up.length > 0 ? `dev :${served.up.join(' :')}` : 'dev down')}
              {stands === null ? '' : `${DOT}on ${nameOf(stands)}${besideOf(stands) === '' ? '' : ` (${besideOf(stands)})`}`}
            </Text>
          </Box>
          {below}
        </Box>
      )
    }

    const { Box, Button, Svg, Text } = $.ui.resolve(e)
    const loaded = await read($, mods)
    const card = {
      reading,
      categories: await read($, categories),
      compactAt: await read($, compactAt),
      usage: spent,
      dev: served,
      isCompact: await read($, isCompact),
      isLight: await read($, isLight),
    }

    // The band is shared: this card sits over whatever the plugins beneath drew.
    return (
      <Box flexDirection="column" gap={1}>
        <Svg source={cardSvg(card)} alt={altOf(card)} />
        {/* The other mods' buttons to the left, the card's own to the right. */}
        <Box columnGap={2} alignItems="center" justifyContent="space-between">
          <Box gap={1}>
            {COMPANIONS.filter(([name]) => loaded.includes(name)).map(([name, label]) => (
              <Button key={name} label={label} onPress={() => ask($, name)} />
            ))}
          </Box>
          <Button
            key="size"
            label={card.isCompact ? 'Expand' : 'Compact'}
            onPress={() => update($, isCompact, held => !held)}
          />
        </Box>
        {/* The branch on a line of its own, ruled off from the buttons above and what is drawn below. */}
        {stands !== null && <Svg source={standingSvg(stands, card.isLight)} alt={standingAlt(stands)} />}
        {below}
      </Box>
    )
  })
}
