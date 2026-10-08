import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Goal } from '../types'
import { goalsSvg } from './draw'
import { counts, outline, parse, rest, visible } from './list'

const TOOL = 'mcp__goals__set'
const MARKS = { done: '✓', doing: '▸', todo: '○' } as const

const DESCRIPTION = [
  'Records the goals list the person sees above the prompt, so they can tell what is done, what is in hand and what comes next without asking.',
  'Call it when work with more than one step begins (one short outcome per goal, a few words each), each time a goal is started or finished, and whenever the plan changes.',
  'Send the whole list every time, in the order the work will happen; mark only the goal being worked on `doing`.',
  'Bring it up to date before ending a turn that made progress. Keep finished goals in the list until the work as a whole is over; send an empty list to clear it.',
].join(' ')

const SCHEMA = {
  type: 'object',
  properties: {
    goals: {
      type: 'array',
      description: 'The whole list, in order.',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'The outcome, in a few words.' },
          status: { type: 'string', enum: ['todo', 'doing', 'done'] },
          note: { type: 'string', description: 'Optional: what it is waiting on, or where it stands.' },
        },
        required: ['title', 'status'],
      },
    },
  },
  required: ['goals'],
}

const list = atom({ plugin: 'goals', key: 'list' } as const, [])
const isOpen = atom({ plugin: 'goals', key: 'isOpen' } as const, false)
const isLight = atom({ plugin: 'goals', key: 'isLight' } as const, false)

// The project the list belongs to: a session elsewhere keeps a list of its own.
let project = ''

const keyOf = () => `goals:${project}`

// The list outlives the session: the next one in this project picks it up.
const save = async ($: EngineInterface, goals: Goal[]) => {
  await update($, list, () => goals)

  try {
    if (goals.length === 0) {
      await $.store.delete(keyOf())
    } else {
      await $.store.set(keyOf(), goals)
    }
  } catch {
    // No store here: the list still stands for this session.
  }
}

const restore = async ($: EngineInterface) => {
  if ((await read($, list)).length > 0) {
    return
  }

  try {
    const kept = parse(await $.store.get(keyOf()))

    if (typeof kept !== 'string' && kept.length > 0) {
      await update($, list, () => kept)
    }
  } catch {
    // Nothing kept, or nothing readable: the list starts empty.
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

const addressee = (value: unknown) =>
  typeof value === 'object' && value !== null ? (value as { to?: unknown }).to : undefined

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    project = e.cwd
    await $.tool.register({ name: 'set', description: DESCRIPTION, inputSchema: SCHEMA })
    await $.command.register({
      name: 'goals',
      description: 'Show every goal or only what is next; "/goals clear" empties the list',
      argumentHint: '[clear]',
    })
    await theme($)
    await restore($)

    return next(e)
  })

  // Listed with the built-in tools, not behind a search: the model has to see it to keep the list.
  on('tool.describe', { tool: TOOL }, async ($, e, next) => ({ ...(await next(e)), isDeferred: false }))

  // The call changes nothing but this list, so it never stops to ask.
  on('tool.check', { tool: TOOL }, () => ({ decision: 'allow' }))

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const goals = parse((e as { goals?: unknown }).goals)

    if (typeof goals === 'string') {
      return { result: `The goals list was not changed. ${goals}` }
    }

    await save($, goals)

    return { result: `The goals list is updated.\n${outline(goals)}` }
  })

  // The model reads the list with each prompt, so "what is next" has an answer
  // and a session that picked the list up from an earlier one knows it has it.
  on('prompt.submit', async ($, e, next) => {
    const goals = await read($, list)

    if (goals.length === 0) {
      return next(e)
    }

    const note = `${outline(goals)}\n(The person sees this list above the prompt. Keep it current with ${TOOL}.)`

    return next({ ...e, context: [...(e.context ?? []), note] })
  })

  on('command.run', { command: 'goals' }, async ($, e) => {
    if (e.args.trim() === 'clear') {
      await save($, [])

      return { text: 'Goals cleared.' }
    }

    const opened = !(await read($, isOpen))
    await update($, isOpen, () => opened)

    return { text: opened ? 'Goals: showing all.' : 'Goals: showing what is next.' }
  })

  // A press on the hud's Goals button shows every goal, or only what is next.
  on('state.set', { plugin: 'hud', key: 'signal' }, async ($, e, next) => {
    const written = await next(e)

    if (addressee(e.value) === 'goals') {
      await update($, isOpen, held => !held)
    }

    return written
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const goals = await read($, list)

    if (e.props.hasSurvey || goals.length === 0) {
      return below
    }

    const open = await read($, isOpen)

    if (e.surface !== 'desktop') {
      const { Box, Text } = $.ui.resolve(e)
      const shown = visible(goals, open)
      const tail = rest(shown.more, shown.done)

      return (
        <Box flexDirection="column">
          <Text bold>
            goals {counts(goals).done} of {goals.length} done
          </Text>
          {shown.rows.map(one => (
            <Text bold={one.status === 'doing'} dimColor={one.status === 'done'}>
              {MARKS[one.status]} {one.title}
            </Text>
          ))}
          {tail !== '' && <Text dimColor>{tail}</Text>}
          {below}
        </Box>
      )
    }

    const { Box, Svg } = $.ui.resolve(e)

    // The band is shared: this list sits over whatever the plugins beneath drew.
    return (
      <Box flexDirection="column" gap={1}>
        <Svg
          source={goalsSvg(goals, open, await read($, isLight))}
          alt={`Goals: ${counts(goals).done} of ${goals.length} done.`}
        />
        {below}
      </Box>
    )
  })
}
