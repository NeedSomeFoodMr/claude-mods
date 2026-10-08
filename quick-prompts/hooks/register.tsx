import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { PROMPTS, drafted } from './prompts'

const isShown = atom({ plugin: 'quick-prompts', key: 'isShown' } as const, false)

// A press fills the box and never submits: the person reads it, then sends it.
const fill = async ($: EngineInterface, text: string) => {
  const { text: draft } = await $.prompt.read()

  await $.prompt.fill({ text: drafted(draft, text), mode: 'replace' })
}

const addressee = (value: unknown) =>
  typeof value === 'object' && value !== null ? (value as { to?: unknown }).to : undefined

export const register: Register = on => {
  // A press on the hud's Prompts button shows or hides the row.
  on('state.set', { plugin: 'hud', key: 'signal' }, async ($, e, next) => {
    const written = await next(e)

    if (addressee(e.value) === 'quick-prompts') {
      await update($, isShown, held => !held)
    }

    return written
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'quick-prompts',
      description: 'Show or hide a row of saved prompts above the prompt box',
    })

    return next(e)
  })

  on('command.run', { command: 'quick-prompts' }, async $ => {
    const shown = !(await read($, isShown))
    await update($, isShown, () => shown)

    return { text: shown ? 'Quick prompts shown.' : 'Quick prompts hidden.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)

    if (e.props.hasSurvey || !(await read($, isShown))) {
      return below
    }

    const { Box, Button } = $.ui.resolve(e)

    // The band is shared: this row sits over whatever the plugins beneath drew.
    return (
      <Box flexDirection="column">
        <Box gap={1} flexWrap="wrap">
          {PROMPTS.map(one => (
            <Button key={one.key} label={one.label} onPress={() => fill($, one.text)} />
          ))}
        </Box>
        {below}
      </Box>
    )
  })
}
