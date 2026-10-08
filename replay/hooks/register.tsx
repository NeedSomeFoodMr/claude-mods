import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { heading, relative, stepOf } from './diff'
import type { Hunk } from './diff'

const PANE = 'replay'
const KEPT = 80

const steps = atom({ plugin: 'replay', key: 'steps' } as const, [])
const at = atom({ plugin: 'replay', key: 'at' } as const, 0)
const isFresh = atom({ plugin: 'replay', key: 'isFresh' } as const, false)

// The session's directory, set as it starts (a reload starts it again).
let root = ''

// The first edit after a turn starts replaces the last turn's steps, so a
// turn that edits nothing leaves them to look at.
const record = async ($: EngineInterface, tool: string, path: string, hunks: readonly Hunk[]) => {
  const step = stepOf(tool, relative(path, root), hunks)

  if (step === undefined) {
    return
  }

  const fresh = await read($, isFresh)
  await update($, steps, list => (fresh ? [step] : [...list, step].slice(-KEPT)))
  await update($, isFresh, () => false)
  await update($, at, () => 0)
}

// A press on the hud's Replay button: the pane opens, or closes when it is up.
const toggle = async ($: EngineInterface) => {
  if ((await $.ui.panes()).some(one => one.id === PANE)) {
    await $.ui.close({ id: PANE })
  } else {
    await $.ui.open({ id: PANE, title: 'Replay' })
  }
}

const addressee = (value: unknown) =>
  typeof value === 'object' && value !== null ? (value as { to?: unknown }).to : undefined

export const register: Register = on => {
  on('state.set', { plugin: 'hud', key: 'signal' }, async ($, e, next) => {
    const written = await next(e)

    if (addressee(e.value) === PANE) {
      await toggle($)
    }

    return written
  })

  on('session.start', async ($, e, next) => {
    root = e.cwd
    await $.command.register({
      name: 'replay',
      description: 'Step through the file edits of the last turn that made any, as diffs',
    })

    return next(e)
  })

  on('command.run', { command: 'replay' }, async $ => {
    await update($, at, () => 0)
    await $.ui.open({ id: PANE, title: 'Replay' })

    return { text: 'Replay opened.' }
  })

  on('turn.start', async ($, e, next) => {
    await update($, isFresh, () => true)

    return next(e)
  })

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const ran = await next(e)

    if (ran.deny === undefined && ran.isError !== true && ran.result.staged !== true) {
      await record($, 'Edit', ran.result.filePath, ran.result.structuredPatch)
    }

    return ran
  })

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const ran = await next(e)

    if (ran.deny === undefined && ran.isError !== true) {
      await record($, 'Write', ran.result.filePath, ran.result.structuredPatch)
    }

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Code, Text } = $.ui.resolve(e)
    const list = await read($, steps)
    const index = Math.min(await read($, at), Math.max(0, list.length - 1))
    const step = list[index]

    if (step === undefined) {
      return <Text dimColor>No edits recorded yet. They appear here as a turn changes files.</Text>
    }

    const last = list.length - 1

    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>{heading(step, index, list.length)}</Text>
        <Box gap={1}>
          <Button key="prev" label="Prev" hotkey="p" onPress={() => update($, at, () => Math.max(0, index - 1))} />
          <Button
            key="next"
            label="Next"
            hotkey="n"
            variant="primary"
            onPress={() => update($, at, () => Math.min(last, index + 1))}
          />
          <Button key="first" label="First" onPress={() => update($, at, () => 0)} />
          <Button key="last" label="Last" onPress={() => update($, at, () => last)} />
        </Box>
        <Code source={step.diff} format="diff" path={step.file} />
      </Box>
    )
  })
}
