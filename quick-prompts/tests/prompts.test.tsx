import { expect, test } from 'claude-code/testing'

import { PROMPTS, drafted } from '../hooks/prompts'

const BAND = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
} as const

test('every prompt has a key of its own', () => {
  expect(new Set(PROMPTS.map(one => one.key)).size).toBe(PROMPTS.length)
  expect(PROMPTS.every(one => /^[a-z0-9-]+$/.test(one.key))).toBe(true)
})

test('a prompt goes under what is already typed', () => {
  expect(drafted('', 'Run the checks.')).toBe('Run the checks.')
  expect(drafted('Fix the header first.\n', 'Run the checks.')).toBe('Fix the header first.\n\nRun the checks.')
})

test('a press fills the prompt box and submits nothing', async ($, on) => {
  const fills: string[] = []
  let draft = ''

  on('ui.render', { component: 'AbovePrompt' }, ($$, e) => {
    const { Box } = $$.ui.resolve(e)

    return <Box />
  })
  on('prompt.read', () => ({ value: { text: draft, cursor: draft.length } }))
  on('prompt.fill', ($$, e) => {
    fills.push(e.text)
    draft = e.text

    return { isFilled: true }
  })

  on('session.start', ($$, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'quick-prompts' } }))

  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })

  const hidden = await $.ui.mount({ plugin: 'quick-prompts', surface: 'desktop', component: 'AbovePrompt', props: BAND })

  expect(await hidden.find({ type: 'Button' })).toBeUndefined()
  await hidden.unmount()
  await $.command.run({
    command: 'quick-prompts',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 100 },
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    draft = ''
    fills.length = 0

    const ui = await $.ui.mount({ plugin: 'quick-prompts', surface, component: 'AbovePrompt', props: BAND })

    await ui.press({ key: 'checks' })
    await ui.press({ key: 'scope' })
    expect(fills[0]).toMatch(/typecheck and build/)
    expect(fills[1]).toMatch(/typecheck and build[^]*\n\nReview the final diff/)
    await ui.unmount()
  }
})
