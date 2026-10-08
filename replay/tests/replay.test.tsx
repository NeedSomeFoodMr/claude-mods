import { expect, test } from 'claude-code/testing'

import { heading, relative, stepOf } from '../hooks/diff'

const HUNK = { oldStart: 4, oldLines: 2, newStart: 4, newLines: 3, lines: [' a', '-b', '+c', '+d'] }

const edited = (file: string) => ({
  result: {
    filePath: file,
    oldString: 'b',
    newString: 'c\nd',
    originalFile: null,
    structuredPatch: [HUNK],
    userModified: false,
    replaceAll: false,
  },
})

test('names a path as the repo does', () => {
  expect(relative('C:\\repo\\apps\\ui\\page.tsx', 'C:\\repo')).toBe('apps/ui/page.tsx')
  expect(relative('C:/elsewhere/page.tsx', 'C:/repo')).toBe('C:/elsewhere/page.tsx')
})

test('turns a tool patch into a unified diff with its counts', () => {
  const step = stepOf('Edit', 'apps/ui/page.tsx', [HUNK])

  expect(step?.diff).toBe('--- a/apps/ui/page.tsx\n+++ b/apps/ui/page.tsx\n@@ -4,2 +4,3 @@\n a\n-b\n+c\n+d')
  expect(step?.added).toBe(2)
  expect(step?.removed).toBe(1)
  expect(stepOf('Write', 'x.ts', [])).toBeUndefined()
  expect(step === undefined ? '' : heading(step, 0, 3)).toBe('Edit 1 of 3 · apps/ui/page.tsx · +2 −1')
})

test('records a turn of edits and steps through them', async ($, on) => {
  on('session.start', ($$, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'replay' } }))
  on('turn.start', ($$, e) => ({ turnId: e.turnId }))
  on('tool.call', { tool: 'Edit' }, ($$, e) => edited(e.file_path))

  const edit = (file: string) => $.tool.call({ tool: 'Edit', file_path: file, old_string: 'b', new_string: 'c\nd' })

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: 'stale turn', turnId: 't0' })
  await edit('/repo/old.ts')
  await $.turn.start({ text: 'change two files', turnId: 't1' })
  await edit('/repo/apps/ui/page.tsx')
  await edit('/repo/apps/ui/layout.tsx')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'replay',
      surface,
      component: 'Pane',
      requestId: 'replay',
      props: {
        title: 'Replay',
        isFocused: false,
        bodyColumns: 80,
        placement: 'dock',
        scroll: { offset: 0, bodyRows: 30 },
        view: {},
      },
    })

    await ui.press({ key: 'first' })
    expect(await ui.find({ type: 'Text', text: 'Edit 1 of 2 · apps/ui/page.tsx' })).toBeDefined()
    expect(await ui.find({ type: 'Code' })).toBeDefined()
    await ui.press({ key: 'next' })
    expect(await ui.find({ type: 'Text', text: 'Edit 2 of 2 · apps/ui/layout.tsx' })).toBeDefined()
    await ui.press({ key: 'next' })
    expect(await ui.find({ type: 'Text', text: 'Edit 2 of 2' })).toBeDefined()
    await ui.unmount()
  }
})
