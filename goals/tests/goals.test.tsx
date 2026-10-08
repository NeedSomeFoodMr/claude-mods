import { expect, test } from 'claude-code/testing'

import { goalsSvg } from '../hooks/draw'
import { outline, parse, rest, visible } from '../hooks/list'
import type { Goal } from '../types'

const GOALS: Goal[] = [
  { title: 'Build the hud card', status: 'done' },
  { title: 'Write the settings migration', status: 'doing', note: 'two tables left' },
  { title: 'Verify in a new session', status: 'todo' },
  { title: 'Update the changelog', status: 'todo' },
  { title: 'Tune <chart> & colours', status: 'todo' },
]

const BAND = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
} as const

test('checks a list before it is kept', () => {
  expect(parse(GOALS)).toEqual(GOALS)
  expect(parse([{ title: '  Ship   it ', status: 'todo', note: ' ' }])).toEqual([{ title: 'Ship it', status: 'todo' }])
  expect(parse('nope')).toMatch(/must be an array/)
  expect(parse([{ title: '', status: 'todo' }])).toMatch(/non-empty/)
  expect(parse([{ title: 'Ship it', status: 'started' }])).toMatch(/todo, doing, done/)
})

test('reads to the model as a checklist', () => {
  expect(outline(GOALS).split('\n').slice(0, 3)).toEqual([
    'Goals (1 of 5 done):',
    '[x] Build the hud card',
    '[>] Write the settings migration (two tables left)',
  ])
  expect(outline([])).toBe('The goals list is empty.')
})

test('collapsed, shows what is in hand and what is next, and counts the rest', () => {
  const shown = visible(GOALS, false)

  expect(shown.rows.map(one => one.title)).toEqual([
    'Write the settings migration',
    'Verify in a new session',
    'Update the changelog',
  ])
  expect(rest(shown.more, shown.done)).toBe('+1 more to do · 1 done')
  expect(visible(GOALS, true).rows.length).toBe(5)
  expect(rest(0, 0)).toBe('')
})

test('draws valid markup, whatever a title holds', () => {
  const svg = goalsSvg(GOALS, true, false)

  expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 720 \d+"/)
  expect(svg).toContain('1 of 5 done')
  expect(svg).toContain('Tune &lt;chart&gt; &amp; colours')
  expect(svg.replace(/<\/?[a-zA-Z][^<>]*>/g, '')).not.toMatch(/[<>]/)
  expect(goalsSvg(GOALS, false, false)).toContain('+1 more to do · 1 done')
})

test('the model sets the list; it is drawn, kept for the project, and read back with a prompt', async ($, on) => {
  const kept = new Map<string, unknown>()
  const contexts: (readonly string[] | undefined)[] = []

  on('session.start', ($$, e) => ({ cwd: e.cwd }))
  on('tool.register', () => ({ value: { tool: 'mcp__goals__set' } }))
  on('command.register', () => ({ value: { command: 'goals' } }))
  on('config.list', () => ({ value: [] }))
  on('store.get', ($$, e) => ({ value: kept.get(e.key) }))
  on('store.set', ($$, e) => {
    kept.set(e.key, e.value)

    return { value: undefined }
  })
  on('prompt.submit', ($$, e) => {
    contexts.push(e.context)

    return { text: e.text, isSubmitted: true }
  })
  on('ui.render', { component: 'AbovePrompt' }, ($$, e) => {
    const { Box } = $$.ui.resolve(e)

    return <Box />
  })

  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })

  const empty = await $.ui.mount({ plugin: 'goals', surface: 'desktop', component: 'AbovePrompt', props: BAND })

  expect(await empty.find({ type: 'Svg' })).toBeUndefined()
  await empty.unmount()

  const refused = await $.tool.call({ tool: 'mcp__goals__set', goals: [{ title: 'Ship it', status: 'soon' }] })

  expect(String(refused.result)).toMatch(/was not changed/)

  const set = await $.tool.call({ tool: 'mcp__goals__set', goals: GOALS })

  expect(String(set.result)).toMatch(/Goals \(1 of 5 done\)/)
  expect(kept.get('goals:/repo')).toEqual(GOALS)
  expect((await $.tool.check({ tool: 'mcp__goals__set', input: { goals: [] } })).decision).toBe('allow')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'goals', surface, component: 'AbovePrompt', props: BAND })

    expect(await ui.find({ type: surface === 'desktop' ? 'Svg' : 'Text' })).toBeDefined()
    await ui.unmount()
  }

  await $.prompt.submit({ text: 'what is next?', wait: false, origin: { kind: 'composer' } })
  expect(contexts.at(-1)?.[0]).toMatch(/^Goals \(1 of 5 done\):[^]*Keep it current with mcp__goals__set/)
})
