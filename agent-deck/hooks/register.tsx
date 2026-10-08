import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentRow, Spend } from '../types'
import { STRIP, STRIP_LEAST, altOf, deckFitted, stripAlt, stripSvg } from './draw'
import {
  about,
  argOf,
  briefOf,
  briefing,
  christen,
  clip,
  clock,
  compact,
  isLive,
  lookOf,
  markFor,
  modelName,
  money,
  nickOf,
  parseSteps,
  progressOf,
  reconcile,
  roleName,
  sections,
  settled,
  spendFrom,
  standing,
  stepped,
  stripOf,
  totals,
  track,
  work,
} from './rows'

const PANE = 'agent-deck'
const SYNC_MS = 3000
const KEPT = 60
// The agents a press can address, and the ones the model is told the names of.
const ASKED = 4
const BRIEFED = 12
// Where a definition comes from when it is not the person's own.
const NOT_OWN = ['built-in', 'plugin']
// A cell of the desktop's pane is this many CSS pixels: 90 cells measured 709 across.
const CELL_PX = 7.88

const PLAN = 'mcp__agent-deck__plan'
const PLAN_SAYS = [
  'For a subagent: posts your plan to the Agents panel the person watches, so they can see what you are doing and what is still ahead.',
  'Call it once before you start, with the steps you expect (a few words each, in order), and again whenever a step is finished or the plan changes.',
  'Send the whole list every time; mark only the step in hand `doing`. Skip it for a single quick lookup.',
].join(' ')
const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    steps: {
      type: 'array',
      description: 'The whole plan, in order.',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'The step, in a few words.' },
          status: { type: 'string', enum: ['todo', 'doing', 'done'] },
        },
        required: ['title', 'status'],
      },
    },
  },
  required: ['steps'],
}

const agents = atom({ plugin: 'agent-deck', key: 'agents' } as const, [])
const main = atom({ plugin: 'agent-deck', key: 'main' } as const, null)
const now = atom({ plugin: 'agent-deck', key: 'now' } as const, 0)
const named = atom({ plugin: 'agent-deck', key: 'named' } as const, 0)
const roster = atom({ plugin: 'agent-deck', key: 'roster' } as const, [])
const isLight = atom({ plugin: 'agent-deck', key: 'isLight' } as const, false)
const meter = atom({ plugin: 'agent-deck', key: 'meter' } as const, null)
const strip = atom({ plugin: 'agent-deck', key: 'strip' } as const, null)
const isFolded = atom({ plugin: 'agent-deck', key: 'isFolded' } as const, false)

const patch = ($: EngineInterface, id: string, change: (row: AgentRow) => AgentRow) =>
  update($, agents, list => list.map(one => (one.id === id ? change(one) : one)))

const open = ($: EngineInterface) => $.ui.open({ id: PANE, title: 'Agents' })

// The line above the prompt, written when what it says has changed and not
// otherwise: the band it sits in is shared, and every write draws it again.
const tally = async ($: EngineInterface) => {
  const next = stripOf(await read($, agents))

  if (JSON.stringify(next) !== JSON.stringify(await read($, strip))) {
    await update($, strip, () => next)
  }
}

// The session's own figures, as the engine has them: the main loop's window
// and its fill, and what the whole session has cost. Kept only on a change.
const gauge = async ($: EngineInterface) => {
  try {
    const { context, cost } = await $.session.usage()
    const next = { window: context.window, percent: context.percent, usd: cost?.usd }

    if (JSON.stringify(next) !== JSON.stringify(await read($, meter))) {
      await update($, meter, () => next)
    }
  } catch {
    // A host that measures nothing: the deck shows no fill and no session cost.
  }
}

// One request of an agent's turn came back: what it cost is added to its row,
// priced at the model that answered it.
const charge = async ($: EngineInterface, id: string, turnId: string, usage: Spend, model: string) => {
  await patch($, id, row => stepped(row, turnId, usage, model))
  await tally($)
}

// A press on the hud's Agents button: the pane opens, or closes when it is up.
const toggle = async ($: EngineInterface) => {
  if ((await $.ui.panes()).some(one => one.id === PANE)) {
    await $.ui.close({ id: PANE })
  } else {
    await sync($)
    await open($)
  }
}

const addressee = (value: unknown) =>
  typeof value === 'object' && value !== null ? (value as { to?: unknown }).to : undefined

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

// The rows, with every one under a name: written inside the update, so two
// writers at once cannot hand out one name twice.
const enlist = async ($: EngineInterface, change: (rows: readonly AgentRow[]) => AgentRow[]) => {
  const from = await read($, named)
  let added = 0

  await update($, agents, list => {
    const next = christen(change(list), from)
    added = next.added

    return next.rows.slice(-KEPT)
  })

  if (added > 0) {
    await update($, named, count => count + added)
  }
}

const sync = async ($: EngineInterface) => {
  const live = await $.agent.list()
  const time = await $.clock.now()
  const before = await read($, agents)
  const after = reconcile(before, live, time)

  // Written on a change alone (a row without a name is one), so a quiet poll redraws nothing.
  if (JSON.stringify(after) !== JSON.stringify(before) || after.some(one => one.nick === undefined)) {
    await enlist($, rows => reconcile(rows, live, time))
    await tally($)
  }

  // The clock is written only while something runs, so an idle deck never redraws.
  if (after.some(isLive)) {
    await update($, now, () => time)
    await gauge($)
  }
}

// A press on the line above the prompt: the pane, with the rows as they stand now.
const reveal = async ($: EngineInterface) => {
  await sync($)
  await open($)
}

// A press puts the agent's name in the box and never sends: the person says what to ask.
const address = async ($: EngineInterface, nick: string) => {
  const { text: draft } = await $.prompt.read()
  const ask = `Ask ${nick} to `

  await $.prompt.fill({ text: draft.trim() === '' ? ask : `${draft.trimEnd()}\n\n${ask}`, mode: 'replace' })
}

export const register: Register = on => {
  // What each loop's last request said, so a step writes only on a change.
  const seen = new Map<string, string>()
  // The types already noted, so an offer writes once.
  const offered = new Set<string>()

  on('session.start', async ($, e, next) => {
    await $.tool.register({ name: 'plan', description: PLAN_SAYS, inputSchema: PLAN_SCHEMA })
    await $.command.register({
      name: 'agent-deck',
      description: 'Show every agent of this session: name, role, model, status, time and tools',
    })
    const model = await $.session.model()
    await update($, main, held => ({ ...held, model }))
    await theme($)
    await gauge($)
    await sync($)
    await tally($)
    $.clock.every(SYNC_MS, () => void sync($).catch(() => {}))

    return next(e)
  })

  on('command.run', { command: 'agent-deck' }, async $ => {
    await sync($)
    await open($)

    return { text: 'Agent deck opened.' }
  })

  on('state.set', { plugin: 'hud', key: 'signal' }, async ($, e, next) => {
    const written = await next(e)

    if (addressee(e.value) === PANE) {
      await toggle($)
    }

    return written
  })

  // The engine measured the session, after a turn of the main loop: its figures, pushed.
  on('session.measure', async ($, e, next) => {
    const measured = await next(e)
    const held = { window: e.context.window, percent: e.context.percent, usd: e.cost?.usd }

    if (JSON.stringify(held) !== JSON.stringify(await read($, meter))) {
      await update($, meter, () => held)
    }

    return measured
  })

  // The types the person wrote themselves are the team the deck lists by name.
  on('agent.offer', async ($, e, next) => {
    const answer = await next(e)

    if (!offered.has(e.agent)) {
      offered.add(e.agent)

      if (!NOT_OWN.includes(e.source) && !e.agent.includes(':')) {
        const role = { name: e.agent, source: e.source }

        void update($, roster, list => (list.some(one => one.name === role.name) ? list : [...list, role])).catch(
          () => {},
        )
      }
    }

    return answer
  })

  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)

    if (spawned.agentId !== undefined) {
      const row: AgentRow = {
        id: spawned.agentId,
        type: e.subagentType,
        description: e.description,
        name: e.name,
        parentId: e.parentAgentId,
        model: spawned.model,
        brief: briefOf(e.prompt),
        status: 'running',
        startedAt: await $.clock.now(),
        tools: 0,
        tokens: 0,
      }
      await enlist($, list => [...list.filter(one => one.id !== row.id), row])
      await update($, now, () => row.startedAt)
      await tally($)
      // Unasked, so the surface seats it only where there is room beside the transcript.
      void open($)
    }

    return spawned
  })

  // The person calls an agent by the name the deck shows: the model is told who that is.
  on('prompt.submit', async ($, e, next) => {
    const list = await read($, agents)

    if (list.length === 0) {
      return next(e)
    }

    const note =
      `Agents panel: the person sees this session's subagents under these names and may refer to one by its name.\n` +
      `${briefing(list.slice(-BRIEFED))}\n` +
      `(To give one more work, call SendMessage with its id.)`

    return next({ ...e, context: [...(e.context ?? []), note] })
  })

  // Listed with the built-in tools, not behind a search: a subagent has to see it to post a plan.
  on('tool.describe', { tool: PLAN }, async ($, e, next) => ({ ...(await next(e)), isDeferred: false }))

  // The call changes nothing but the panel, so it never stops to ask.
  on('tool.check', { tool: PLAN }, () => ({ decision: 'allow' }))

  on('tool.call', async ($, e, next) => {
    const id = e.agentId
    const input = e as Record<string, unknown>

    // A subagent's plan, kept on its row. The main loop's list is the goals mod's.
    if (e.tool === PLAN) {
      const steps = parseSteps(input.steps)

      if (typeof steps === 'string') {
        return { result: `The plan was not changed. ${steps}` }
      }

      if (id === undefined) {
        return { result: 'This tool is for subagents: nothing was posted.' }
      }

      await patch($, id, row => ({ ...row, steps }))
      await tally($)

      return { result: `Plan posted: ${steps.filter(one => one.status === 'done').length} of ${steps.length} done.` }
    }

    if (id !== undefined) {
      const said = argOf(String(e.tool), input)

      await patch($, id, row => ({ ...row, tools: row.tools + 1, lastTool: String(e.tool), lastArg: said }))
    }

    return next(e)
  })

  // A step is one model request: it names the model and effort the loop runs
  // on, and its response says what it cost, which an agent's row adds up.
  on('turn.step', async function* ($, e, next) {
    const effort = e.effort === undefined ? undefined : String(e.effort)
    const said = `${e.model}|${effort ?? ''}`
    const id = e.agentId ?? 'main'

    if (seen.get(id) !== said) {
      seen.set(id, said)
      void (
        e.agentId === undefined
          ? update($, main, () => ({ model: e.model, effort }))
          : patch($, id, row => ({ ...row, model: e.model, effort }))
      ).catch(() => {})
    }

    const response = yield* next(e)

    // The count is the panel's alone: whatever goes wrong in it, here or in
    // the state beneath, the response goes on up as it came. Awaited, so the
    // turn's end, which follows its last response, never lands before that
    // response's count.
    try {
      const usage = response?.usage

      if (e.agentId !== undefined && usage != null) {
        await charge($, e.agentId, e.turnId, spendFrom(usage), typeof usage.model === 'string' ? usage.model : e.model)
      }
    } catch {
      // Not counted: the row says a little less than was spent.
    }

    return response
  })

  on('turn.complete', async ($, e, next) => {
    const id = e.agentId

    if (id !== undefined) {
      const ended = await $.clock.now()
      const status = e.isAborted ? 'killed' : e.reason === 'error' ? 'failed' : 'completed'
      const stated = e.usage == null ? undefined : spendFrom(e.usage)
      // A count that states nothing is no count: the requests' own sum stands.
      const usage =
        stated === undefined || stated.input + stated.output + stated.cacheRead + stated.cacheWrite === 0 ? undefined : stated
      // What the turn holds beyond its requests' sum is priced at the model that answered last.
      const model = typeof e.usage?.model === 'string' ? e.usage.model : undefined

      await patch($, id, row => ({ ...settled(row, e.turnId, usage, model ?? row.model), status, endedAt: ended }))
      await tally($)
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const list = await read($, agents)
    const loop = await read($, main)
    const time = await read($, now)
    const { running, finished } = sections(list)
    const clear = async () => {
      await update($, agents, rows => rows.filter(isLive))
      await tally($)
    }

    if (e.surface === 'desktop') {
      const { Box, Button, Svg } = $.ui.resolve(e)
      const deck = {
        agents: list,
        main: loop,
        meter: await read($, meter),
        roster: await read($, roster),
        now: time,
        isLight: await read($, isLight),
        isFolded: await read($, isFolded),
        // Drawn as wide as the pane is, so the surface scales nothing.
        width: Math.min(1200, Math.max(380, Math.round(e.props.bodyColumns * CELL_PX))),
      }
      const recent = [...running.map(one => one.row), ...finished].slice(0, ASKED)

      return (
        <Box flexDirection="column" gap={1}>
          {/* Drawn once, and held to what a surface takes: a refused drawing would close the pane. */}
          <Svg source={deckFitted(deck)} alt={altOf(deck)} />
          {(recent.length > 0 || finished.length > 0) && (
            <Box gap={1}>
              {/* A long name is cut on the button; the press still writes it whole. */}
              {recent.map(row => (
                <Button key={`ask-${row.id}`} label={`Ask ${clip(nickOf(row), 16)}`} onPress={() => address($, nickOf(row))} />
              ))}
              {/* Two labels of one length, so the press moves no button beside it. */}
              {running.length > 0 && (
                <Button
                  key="fold"
                  label={deck.isFolded ? 'Show plans' : 'Hide plans'}
                  onPress={() => update($, isFolded, held => !held)}
                />
              )}
              {finished.length > 0 && <Button key="clear" label="Clear finished" onPress={clear} />}
            </Box>
          )}
        </Box>
      )
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const sum = totals(list, time)
    const whole = (await read($, meter))?.usd
    const planned = (row: AgentRow) => {
      const plan = progressOf(row)

      return plan === undefined ? '' : `steps ${plan.done}/${plan.total}`
    }
    const line = (row: AgentRow, depth: number) => (
      <Box flexDirection="column" marginLeft={depth * 2}>
        <Box gap={1}>
          <Text color={lookOf(row.type).color}>{markFor(row.status)}</Text>
          <Text bold dimColor={!isLive(row)}>
            {nickOf(row)}
          </Text>
          <Text color={lookOf(row.type).color}>{roleName(row.type)}</Text>
          <Text dimColor>
            {[modelName(row.model), row.effort, standing(row, Math.max(time, row.startedAt)), planned(row), work(row)]
              .filter(part => part !== undefined && part !== '')
              .join(' · ')}
          </Text>
        </Box>
        <Text dimColor wrap="truncate-end">
          {'  '}
          {row.description}
        </Text>
      </Box>
    )

    return (
      <Box flexDirection="column">
        <Box gap={1}>
          <Text bold>◆ Main</Text>
          <Text dimColor>
            {modelName(loop?.model)}
            {loop?.effort === undefined ? '' : ` · ${loop.effort}`}
          </Text>
        </Box>
        {list.length === 0 && <Text dimColor>No subagents yet. They appear here as they are spawned.</Text>}
        {list.length > 0 && (
          <Text dimColor>
            {/* Two costs, each named: the listed agents' estimate, and the engine's own figure for everything. */}
            {[
              ...(sum.usd === undefined ? [] : [`agents cost ${about(sum.usd, sum.unpriced > 0)} est.`]),
              ...(sum.unpriced === 0 ? [] : [`${sum.unpriced} unpriced`]),
              ...(whole === undefined ? [] : [`whole session ${money(whole)}`]),
              ...(sum.counted === 0 ? [] : [`${compact(sum.tokens)} tokens`]),
              `${clock(sum.ms)} agent time`,
            ].join(' · ')}
          </Text>
        )}
        {running.length > 0 && <Text dimColor>RUNNING · {running.length}</Text>}
        {running.map(one => line(one.row, one.depth))}
        {finished.length > 0 && <Text dimColor>FINISHED · {finished.length}</Text>}
        {finished.map(row => line(row, 0))}
        {finished.length > 0 && (
          <Box marginTop={1}>
            <Button key="clear" label="Clear finished" onPress={clear} />
          </Box>
        )}
      </Box>
    )
  })

  // While an agent works, one line above the prompt says how the run stands;
  // with none at work it draws nothing. The band is shared: the line sits over
  // whatever the plugins beneath drew.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const said = await read($, strip)

    if (e.props.hasSurvey || said === null) {
      return below
    }

    if (e.surface !== 'desktop') {
      const { Box, Button, Text } = $.ui.resolve(e)

      return (
        <Box flexDirection="column">
          <Box gap={1}>
            <Text bold>agents</Text>
            <Text dimColor>
              {[
                `${said.running} running`,
                `${said.finished} finished`,
                ...(said.steps === 0 ? [] : [`steps ${said.done}/${said.steps}`]),
                ...(said.usd === undefined ? [] : [`agents cost ${about(said.usd, said.hasUnpriced === true)}`]),
              ].join(' · ')}
            </Text>
            {said.steps > 0 && <Text>{track(said.done / said.steps, 10)}</Text>}
            <Button key="deck" label="Agents" onPress={() => reveal($)} />
          </Box>
          {below}
        </Box>
      )
    }

    const { Box, Button, Svg } = $.ui.resolve(e)
    // As wide as the column spares beside the button, and never wider than it reads well.
    const width = Math.min(STRIP, Math.max(STRIP_LEAST, Math.round(e.props.bodyColumns * CELL_PX) - 96))

    return (
      <Box flexDirection="column" gap={1}>
        <Box gap={1} alignItems="center">
          <Svg source={stripSvg(said, await read($, isLight), width)} alt={stripAlt(said)} width={width} height={20} />
          <Button key="deck" label="Agents" onPress={() => reveal($)} />
        </Box>
        {below}
      </Box>
    )
  })
}
