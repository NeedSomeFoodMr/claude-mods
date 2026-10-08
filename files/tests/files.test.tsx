import { expect, mock, test } from 'claude-code/testing'

import {
  COMMIT_MS,
  LIVE_MS,
  SLACK_MS,
  dueOf,
  lightsOf,
  movesHead,
  seenOf,
  settledOf,
  soundActivity,
  touchedBy,
  wholeOf,
  withinOf,
} from '../hooks/activity'
import { diffPagesOf } from '../hooks/diff'
import {
  PAGE,
  aheadOf,
  beforeOf,
  changesOf,
  clean,
  countsOf,
  excerptOf,
  fittedTo,
  foldersOf,
  hitsOf,
  labelOf,
  namedOf,
  rank,
  sizeOf,
  soundHits,
  standingOf,
  statusOf,
  treeOf,
  windowOf,
} from '../hooks/find'
import { ROW, edgeOf, glyphOf, indentOf, reachOf, restOf } from '../hooks/icons'
import { askOf, problemsOf, projectsOf, soundProblems, tscPlaces } from '../hooks/problems'

// A label without the blank room that carries it across the row.
const bare = (text: string | undefined) => text?.replace(/[\u00A0\u2800]+$/, '')

const PATHS = [
  'README.md',
  'apps/anchor-ui/components/ui/button.tsx',
  'apps/anchor-ui/components/ui/button-group.tsx',
  'apps/anchor-ui/domain/session.ts',
  'apps/anchor-ui/services/session-service.ts',
  'docs/ARCHITECTURE_AND_DECISIONS.md',
]

const PANE = {
  title: 'Files',
  isFocused: true,
  bodyColumns: 80,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 30 },
  view: {},
} as const

const DIFF = [
  'diff --git a/README.md b/README.md',
  'index 1111111..2222222 100644',
  '--- a/README.md',
  '+++ b/README.md',
  '@@ -1,3 +1,3 @@',
  ' # Title',
  '-old line',
  '+new line',
  ' tail',
  '\\ No newline at end of file',
  '',
].join('\n')

// What a child that ran leaves behind.
const ran = (stdout: string, exitCode = 0) => ({
  value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
})

const slashed = (path: string) => path.replace(/\\/g, '/')

test('ranks a name that starts with the search first, and needs every word to fit', () => {
  expect(rank(PATHS, 'button', 5).hits).toEqual([
    'apps/anchor-ui/components/ui/button.tsx',
    'apps/anchor-ui/components/ui/button-group.tsx',
  ])
  expect(rank(PATHS, 'session serv', 5).hits).toEqual(['apps/anchor-ui/services/session-service.ts'])
  // Letters in order find a name typed loosely.
  expect(rank(PATHS, 'bttn', 5).total).toBe(2)
  expect(rank(PATHS, 'ui/', 1)).toEqual({ hits: ['apps/anchor-ui/domain/session.ts'], total: 4 })
  expect(rank(PATHS, 'nothing-like-it', 5)).toEqual({ hits: [], total: 0 })
  expect(rank(PATHS, '   ', 5).total).toBe(0)
})

test('labels a path by its name, pages a file from any line, and reads what git says', () => {
  expect(labelOf('apps/anchor-ui/components/ui/button.tsx')).toBe('button.tsx  ·  apps/anchor-ui/components/ui')
  expect(labelOf('README.md')).toBe('README.md')
  expect(clean('a\r\n\tb\u0007')).toBe('a\n\tb')
  expect(sizeOf(900)).toBe('900 B')
  expect(sizeOf(20_480)).toBe('20 KB')

  // 200 lines of 100 characters with their line ends: 90 of them fill a page.
  const lines = Array.from({ length: 200 }, () => 'x'.repeat(99))

  expect(windowOf(lines, 1)).toMatchObject({ startLine: 1, endLine: 90 })
  expect(windowOf(lines, 91)).toMatchObject({ startLine: 91, endLine: 180 })
  expect(windowOf(lines, 181)).toMatchObject({ startLine: 181, endLine: 200 })
  expect(windowOf(lines, 1).text.length <= PAGE).toBe(true)
  // A line asked for past the end is the last one; an empty file is one empty line.
  expect(windowOf(lines, 900).startLine).toBe(200)
  expect(windowOf([''], 1)).toEqual({ startLine: 1, endLine: 1, text: '' })
  expect(windowOf(['x'.repeat(PAGE * 2)], 1).text.length).toBe(PAGE)
  // The page above one: as many lines as fit, ending just over it.
  expect(beforeOf(lines, 181)).toBe(91)
  expect(beforeOf(lines, 40)).toBe(1)
  expect(beforeOf(lines, 1)).toBe(1)

  const status = ' M apps/a.ts\0?? new.ts\0R  to.ts\0from.ts\0 D gone.ts\0?? folder/\0'
  const numstat = '3\t1\tapps/a.ts\0' + '0\t0\t\0from.ts\0to.ts\0' + '-\t-\tlogo.png\0' + '0\t7\tgone.ts\0'

  // The tree has no row for a deleted file; the list of changes has.
  expect([...statusOf(status)]).toEqual([
    ['apps/a.ts', 'M'],
    ['new.ts', 'U'],
    ['to.ts', 'M'],
  ])
  expect([...countsOf(numstat).keys()]).toEqual(['apps/a.ts', 'to.ts', 'gone.ts'])
  expect(changesOf(status, numstat)).toEqual([
    { path: 'apps/a.ts', mark: 'M', added: 3, removed: 1 },
    { path: 'new.ts', mark: 'U' },
    { path: 'to.ts', mark: 'M', added: 0, removed: 0 },
    { path: 'gone.ts', mark: 'D', added: 0, removed: 7 },
  ])
  expect(foldersOf('apps/anchor-ui/domain/session.ts')).toEqual(['apps', 'apps/anchor-ui', 'apps/anchor-ui/domain'])
  expect(foldersOf('README.md')).toEqual([])

  const grep = [['a/b.ts', '12', '  const tenant = 1'], ['a/b.ts', '40', 'tenant()'], ['c.md', '3', 'x: tenant']]
    .map(row => row.join('\0'))
    .join('\n')

  // A hit is kept as the text found and what stands on either side of it.
  expect(hitsOf(`${grep}\n`, 2, 'tenant')).toEqual({
    hits: [
      { path: 'a/b.ts', line: 12, before: 'const ', match: 'tenant', after: ' = 1' },
      { path: 'a/b.ts', line: 40, before: '', match: 'tenant', after: '()' },
    ],
    total: 3,
    files: 2,
  })
  expect(hitsOf('', 5, 'tenant')).toEqual({ hits: [], total: 0, files: 0 })
})

test('cuts a line found around the text looked for, and fits it to a row', () => {
  // Small letters find either case and the line's own spelling is kept; a capital makes it exact.
  expect(excerptOf('\tconst  Tenant\t= tenant', 'tenant')).toEqual({ before: 'const ', match: 'Tenant', after: ' = tenant' })
  expect(excerptOf('const Tenant = tenant', 'tenant =')).toEqual({ before: 'const ', match: 'Tenant =', after: ' tenant' })
  expect(excerptOf('a tenant, a Tenant', 'Tenant')).toEqual({ before: 'a tenant, a ', match: 'Tenant', after: '' })
  // A line that does not hold the text is shown from its start.
  expect(excerptOf('nothing here', 'tenant')).toEqual({ before: '', match: 'nothing here', after: '' })

  // In a long line the text found stays in sight: both ends are cut and marked.
  const long = excerptOf(`${'a'.repeat(300)} tenant ${'b'.repeat(300)}`, 'tenant')

  expect(long.before).toBe(`…${'a'.repeat(59)} `)
  expect(long.after).toBe(` ${'b'.repeat(159)}…`)

  const short = { before: 'export const ', match: 'tenant', after: ' = 1' }

  expect(fittedTo(short, 30)).toEqual(short)

  const cut = fittedTo(long, 80)

  expect(cut.match).toBe('tenant')
  expect(cut.before).toBe(`…${'a'.repeat(26)} `)
  expect(cut.after).toBe(` ${'b'.repeat(44)}…`)
  expect(`${cut.before}${cut.match}${cut.after}`.length).toBe(80)
  // What stands before gives way first; the text found is cut only when it alone is too long.
  expect(fittedTo(short, 12)).toEqual({ before: '…st ', match: 'tenant', after: ' …' })
  expect(fittedTo({ before: '', match: 'x'.repeat(50), after: '' }, 20).match).toBe(`${'x'.repeat(19)}…`)
  // The state outlives a reload: a line an older version kept whole, as `text`, is left out, not drawn.
  const kept = { path: 'README.md', line: 9, before: 'a ', match: 'tenant', after: '' }

  expect(soundHits([{ path: 'README.md', line: 3, text: 'tenant notes' }, kept, null, 'x'])).toEqual([kept])

  // A text found that nearly fills the row leaves what stands around it only the room there is.
  const wide = fittedTo({ before: 'b'.repeat(30), match: 'm'.repeat(70), after: 'a'.repeat(30) }, 80)

  expect(`${wide.before}${wide.match}${wide.after}`.length).toBe(80)
  expect(fittedTo({ before: 'b'.repeat(30), match: 'm'.repeat(90), after: 'a' }, 80)).toEqual({
    before: '',
    match: `${'m'.repeat(79)}…`,
    after: '',
  })
})

test('cuts a diff into pages of whole hunks, a long hunk into hunks with their own numbers', () => {
  // The file header and the remark about a missing line end are read past.
  expect(diffPagesOf(DIFF)).toEqual({
    pages: ['@@ -1,3 +1,3 @@\n # Title\n-old line\n+new line\n tail'],
    added: 1,
    removed: 1,
  })
  expect(diffPagesOf('Binary files a/x.png and b/x.png differ\n').pages).toEqual([])

  // A new file of 400 lines, 100 characters each with the line end: 89 fit under a hunk's own line.
  const added = Array.from({ length: 400 }, () => `+${'y'.repeat(98)}`)
  const cut = diffPagesOf(['--- /dev/null', '+++ b/new.ts', '@@ -0,0 +1,400 @@', ...added].join('\n'))

  expect(cut.added).toBe(400)
  expect(cut.pages.length).toBe(5)
  expect(cut.pages.every(page => page.length <= PAGE)).toBe(true)
  expect(cut.pages.map(page => page.slice(0, page.indexOf('\n')))).toEqual([
    '@@ -0,0 +1,89 @@',
    '@@ -0,0 +90,89 @@',
    '@@ -0,0 +179,89 @@',
    '@@ -0,0 +268,89 @@',
    '@@ -0,0 +357,44 @@',
  ])

  // Two short hunks share a page, each numbered from where it starts.
  const two = diffPagesOf('@@ -4,2 +4,3 @@ function a() {\n a\n+b\n c\n@@ -20 +21,0 @@\n-gone\n')

  expect(two.pages).toEqual(['@@ -4,2 +4,3 @@\n a\n+b\n c\n@@ -20,1 +21,0 @@\n-gone'])
  expect(two).toMatchObject({ added: 1, removed: 1 })
})

test('draws the files as a tree: folders first, an opened folder with what is in it', () => {
  const said = (expanded: string[], limit = 20) =>
    treeOf(PATHS, expanded, limit).rows.map(row => `${'  '.repeat(row.depth)}${row.kind === 'dir' ? (row.isOpen ? 'v ' : '> ') : ''}${row.name}`)

  expect(said([])).toEqual(['> apps', '> docs', 'README.md'])
  expect(said(['apps', 'apps/anchor-ui'])).toEqual([
    'v apps',
    '  v anchor-ui',
    '    > components',
    '    > domain',
    '    > services',
    '> docs',
    'README.md',
  ])
  // A folder opened under a closed one stays out of sight.
  expect(said(['apps/anchor-ui'])).toEqual(['> apps', '> docs', 'README.md'])
  expect(treeOf(PATHS, ['docs'], 2)).toMatchObject({ more: 2 })
})

test('gives a file the icon of its type, and a row an edge as wide as it is deep', () => {
  expect(glyphOf('button.tsx')).toMatchObject({ kind: 'shape', shape: 'atom' })
  expect(glyphOf('session.ts')).toMatchObject({ kind: 'mark', text: 'TS' })
  expect(glyphOf('package.json')).toMatchObject({ kind: 'mark', text: '{}' })
  expect(glyphOf('package-lock.json')).toMatchObject({ shape: 'lock' })
  expect(glyphOf('.gitignore')).toMatchObject({ shape: 'git' })
  expect(glyphOf('next.config.ts')).toMatchObject({ shape: 'gear' })
  expect(glyphOf('.env.example')).toMatchObject({ shape: 'gear' })
  expect(glyphOf('LICENSE')).toMatchObject({ shape: 'page' })

  const file = edgeOf({ depth: 2, name: 'a<b>.ts' }, false)

  expect(file.width - edgeOf({ depth: 0, name: 'x.ts' }, false).width).toBe(24)
  expect(file.source).toMatch(new RegExp(`^<svg [^>]*viewBox="0 0 ${file.width} ${ROW}"`))
  // One guide for each folder the row sits inside.
  expect(file.source.match(/stroke-opacity="0.16"/g)?.length).toBe(2)
  expect(indentOf(2, false).source.match(/stroke-opacity="0.16"/g)?.length).toBe(2)
  expect(indentOf(2, false).width).toBe(24)
  // At the root a folder has no indent to draw.
  expect(indentOf(0, false).width).toBe(0)
  expect(edgeOf({ depth: 0, name: 'x.json' }, true).source).toContain('#9a8f00')
  // The room after a name: most of what the row has left, closed by a blank no trim takes.
  expect(reachOf(100, 700)).toMatch(/^\u00A0{133}\u2800$/)
  expect(`x${reachOf(100, 700)}`.trim()).toBe(`x${reachOf(100, 700)}`)
  expect(restOf(100, 700).trim()).toBe(restOf(100, 700))
  expect(restOf(690, 700)).toBe('')
  expect(reachOf(690, 700)).toBe('')
})

test('browses the tree: a press opens a folder, another opens a file in it', async ($, on) => {
  mock.clock(on, { now: 100_000 })
  on('process.run', ($$, e) =>
    ran(
      e.argv[1] === 'ls-files'
        ? `${PATHS.join('\0')}\0.claude/worktrees/other/\0`
        : e.argv[1] === 'rev-parse'
          ? 'C:\\Users\\sam\\anchor-platform\n'
          : e.argv[1] === 'status'
            ? '?? docs/ARCHITECTURE_AND_DECISIONS.md\0?? .claude/worktrees/other/\0'
            : '',
    ),
  )
  on('fs.stat', () => ({ value: { kind: 'file' as const, size: 6, mtimeMs: 0, isLink: false } }))
  on('fs.read', () => ({ value: '# Docs' }))

  const ui = await $.ui.mount({ plugin: 'files', surface: 'desktop', component: 'Pane', requestId: 'files', props: PANE })

  // The files are listed behind the first drawing: an empty search waits for the list.
  await ui.input({ key: 'q', text: '', kind: 'change' })

  // The tab in view is a heading; the others are pressed, and the changes are counted on theirs.
  // Every tab is a button of the same room whichever is in view, so a press moves none of them.
  expect((await ui.find({ key: 'tab-explorer' }))?.text).toBe('EXPLORER')
  expect((await ui.find({ key: 'tab-search' }))?.text).toBe('SEARCH')
  expect((await ui.find({ key: 'tab-changes' }))?.text).toBe('CHANGES 1')
  expect((await ui.find({ key: 'repo' }))?.text).toBe('anchor-platform ▾')
  expect(await ui.find({ type: 'Text', text: '6 files' })).toBeDefined()
  // All of a folder's row is one button: chevron, folder and name.
  expect(bare((await ui.find({ key: 'row-1' }))?.text)).toBe('▸ \u{1F5C0} docs')
  // A folder holding a change wears a dot; the new file wears git's U once its folder is open.
  expect(await ui.find({ type: 'Text', text: '• ' })).toBeDefined()
  expect((await ui.findAll({ type: 'Text', text: 'U ' })).length).toBe(0)
  expect(bare((await ui.find({ key: 'row-2' }))?.text)).toBe('README.md')
  // On the desktop the label runs on past the name, so a press beside it lands.
  expect((await ui.find({ key: 'row-1' }))?.text).toMatch(/docs\u00A0{20,}\u2800$/)
  await ui.press({ key: 'row-1' })
  expect(bare((await ui.find({ key: 'row-1' }))?.text)).toBe('▾ \u{1F5C1} docs')
  expect(bare((await ui.find({ key: 'row-2' }))?.text)).toBe('ARCHITECTURE_AND_DECISIONS.md')
  expect((await ui.findAll({ type: 'Text', text: 'U ' })).length).toBe(1)
  await ui.press({ key: 'row-1' })
  expect(bare((await ui.find({ key: 'row-2' }))?.text)).toBe('README.md')
  await ui.press({ key: 'row-1' })
  await ui.press({ key: 'row-2' })
  expect(await ui.find({ type: 'Text', text: 'docs/ARCHITECTURE_AND_DECISIONS.md' })).toBeDefined()
  expect(await ui.find({ type: 'Code' })).toBeDefined()
  // A new file has no diff to offer.
  expect(await ui.find({ key: 'diff' })).toBeUndefined()
  await ui.unmount()
})

test('searches by name, opens a file, pages it, mentions it, and shows what changed in one', async ($, on) => {
  const filled: string[] = []
  const copied: string[] = []
  const long = Array.from({ length: 300 }, (_, at) => `const line${at} = ${'y'.repeat(60)}`).join('\r\n')

  mock.clock(on, { now: 200_000 })
  on('session.start', ($$, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'files' } }))
  on('process.run', ($$, e) =>
    ran(
      e.argv[1] === 'ls-files'
        ? `${PATHS.join('\0')}\0`
        : e.argv[1] === 'status'
          ? ' M README.md\0'
          : e.argv[1] === 'diff'
            ? e.argv.includes('--numstat')
              ? '1\t1\tREADME.md\0'
              : DIFF
            : '',
    ),
  )
  on('fs.stat', () => ({ value: { kind: 'file' as const, size: long.length, mtimeMs: 0, isLink: false } }))
  on('fs.read', () => ({ value: long }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('prompt.read', () => ({ value: { text: 'look at', cursor: 7 } }))
  on('prompt.fill', ($$, e) => {
    filled.push(e.text)

    return { isFilled: true }
  })
  on('ui.copy', ($$, e) => {
    copied.push(e.text)

    return { value: { isCopied: true } }
  })

  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'files', surface, component: 'Pane', requestId: 'files', props: PANE })

    await ui.input({ key: 'q', text: 'button', kind: 'change' })
    expect(bare((await ui.find({ key: 'hit-0' }))?.text)).toBe('button.tsx')
    // A row with its folder beside the name carries the room in a button of its own.
    expect((await ui.find({ key: 'hit-0-rest' })) !== undefined).toBe(surface === 'desktop')
    expect(await ui.find({ type: 'Text', text: /apps\/anchor-ui\/components\/ui/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /2 matches/ })).toBeDefined()

    await ui.input({ key: 'q', text: 'session.ts', kind: 'submit' })
    expect(await ui.find({ type: 'Text', text: 'apps/anchor-ui/domain/session.ts' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /lines 1–\d+ of 300/ })).toBeDefined()
    expect(await ui.find({ type: 'Code' })).toBeDefined()
    // Git reports no change in it, so there is none to offer.
    expect(await ui.find({ key: 'diff' })).toBeUndefined()

    await ui.press({ key: 'next' })
    expect(await ui.find({ type: 'Text', text: /lines \d+–\d+ of 300/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /lines 1–/ })).toBeUndefined()
    await ui.press({ key: 'prev' })
    expect(await ui.find({ type: 'Text', text: /lines 1–\d+ of 300/ })).toBeDefined()
    // At either end there is no further page: the last one stays as it is.
    await ui.press({ key: 'prev' })
    expect(await ui.find({ type: 'Text', text: /lines 1–\d+ of 300/ })).toBeDefined()
    await ui.press({ key: 'next' })
    await ui.press({ key: 'next' })
    expect(await ui.find({ type: 'Text', text: /lines \d+–300 of 300/ })).toBeDefined()
    await ui.press({ key: 'next' })
    expect(await ui.find({ type: 'Text', text: /lines 300–300/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /lines \d+–300 of 300/ })).toBeDefined()

    await ui.press({ key: 'mention' })
    await ui.press({ key: 'copy' })
    await ui.press({ key: 'back' })
    expect(await ui.find({ type: 'Code' })).toBeUndefined()

    // With nothing typed the pane lists what was opened.
    await ui.input({ key: 'q', text: '', kind: 'change' })
    expect(bare((await ui.find({ key: 'recent-0' }))?.text)).toBe('session.ts')

    // The changes: each file with the lines git counted, opened as its diff.
    await ui.press({ key: 'tab-changes' })
    // A terminal marks the tab in view by its type; the desktop keeps it a button over a rule.
    expect(
      surface === 'terminal' ? await ui.find({ type: 'Text', text: 'CHANGES 1' }) : await ui.find({ key: 'tab-changes' }),
    ).toBeDefined()
    expect(bare((await ui.find({ key: 'change-0' }))?.text)).toBe('README.md')
    expect(await ui.find({ type: 'Text', text: '+1 ' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '−1 ' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'M ' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /1 file changed/ })).toBeDefined()

    await ui.press({ key: 'change-0' })
    expect(await ui.find({ type: 'Text', text: 'README.md' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '+1' })).toBeDefined()
    expect(await ui.find({ type: 'Code' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /lines/ })).toBeUndefined()

    // From the diff to the whole file and back.
    await ui.press({ key: 'whole' })
    expect(await ui.find({ type: 'Text', text: /lines 1–\d+ of 300/ })).toBeDefined()
    await ui.press({ key: 'diff' })
    expect(await ui.find({ type: 'Text', text: /lines/ })).toBeUndefined()
    await ui.press({ key: 'back' })
    expect(await ui.find({ key: 'change-0' })).toBeDefined()

    // Back in the explorer the field is drawn empty, as it was left.
    await ui.press({ key: 'tab-explorer' })
    expect(await ui.find({ key: 'q' })).toBeDefined()
    await ui.unmount()
  }

  expect(filled).toEqual(['look at @apps/anchor-ui/domain/session.ts ', 'look at @apps/anchor-ui/domain/session.ts '])
  expect(copied).toEqual(['apps/anchor-ui/domain/session.ts', 'apps/anchor-ui/domain/session.ts'])
})

test('searches inside the files and opens one at the line found', async ($, on) => {
  const asked: (readonly string[])[] = []
  let env: Record<string, string> | undefined
  const text = Array.from({ length: 40 }, (_, at) => `line ${at + 1}`).join('\n')

  mock.clock(on, { now: 300_000 })
  on('process.run', ($$, e) => {
    if (e.argv[1] === 'grep') {
      asked.push(e.argv)
      env = e.init?.env

      return e.argv.at(-1) === 'nowhere'
        ? ran('', 1)
        : ran(
            `${[
              ['apps/anchor-ui/domain/session.ts', '12', '  export const tenant = 1'],
              ['apps/anchor-ui/domain/session.ts', '30', 'tenant()'],
              ['README.md', '3', 'see tenant'],
            ]
              .map(row => row.join('\0'))
              .join('\n')}\n`,
          )
    }

    return ran(e.argv[1] === 'ls-files' ? `${PATHS.join('\0')}\0` : '')
  })
  on('fs.stat', () => ({ value: { kind: 'file' as const, size: text.length, mtimeMs: 0, isLink: false } }))
  on('fs.read', () => ({ value: text }))

  const ui = await $.ui.mount({ plugin: 'files', surface: 'desktop', component: 'Pane', requestId: 'files', props: PANE })

  await ui.press({ key: 'tab-search' })
  expect(await ui.find({ type: 'Text', text: /Type two letters or more/ })).toBeDefined()

  // One letter is not searched for.
  await ui.input({ key: 'grep', text: 't', kind: 'change' })
  expect(asked.length).toBe(0)

  await ui.input({ key: 'grep', text: 'tenant', kind: 'change' })
  // Small letters find either case, in files git does not track yet too.
  expect(asked[0]).toEqual(['git', 'grep', '-n', '-I', '--null', '--no-color', '-F', '-i', '--untracked', '-e', 'tenant'])
  expect(env).toEqual({ GIT_OPTIONAL_LOCKS: '0', GIT_LITERAL_PATHSPECS: '1' })
  // Each file once, with how many of its lines are listed, then the lines.
  expect(bare((await ui.find({ key: 'found-0' }))?.text)).toBe('session.ts')
  expect(await ui.find({ type: 'Text', text: /apps\/anchor-ui\/domain$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '2 ' })).toBeDefined()
  // A line is its number, then three buttons: the text found at full strength between
  // what stands before and after it, a space at a joint kept from a trim.
  expect((await ui.find({ key: 'find-0-line' }))?.text).toBe('12')
  expect((await ui.find({ key: 'find-0-before' }))?.text).toBe('export const\u00A0\u200B')
  expect((await ui.find({ key: 'find-0' }))?.text).toBe('tenant')
  expect(bare((await ui.find({ key: 'find-0-after' }))?.text)).toBe('\u200B\u00A0= 1')
  expect((await ui.find({ key: 'find-0-after' }))?.text).toMatch(/\u00A0{20,}\u2800$/)
  expect(await ui.find({ key: 'find-1-before' })).toBeUndefined()
  expect((await ui.find({ key: 'find-1' }))?.text).toBe('tenant')
  expect(bare((await ui.find({ key: 'find-1-after' }))?.text)).toBe('()')
  expect(await ui.find({ key: 'found-1' })).toBeUndefined()
  expect(bare((await ui.find({ key: 'found-2' }))?.text)).toBe('README.md')
  // Nothing follows the text found on the last line: the room beside it is still pressed.
  expect((await ui.find({ key: 'find-2-after' }))?.text).toMatch(/^\u2800\u00A0+\u2800$/)
  expect(await ui.find({ type: 'Text', text: /3 lines in 2 files/ })).toBeDefined()

  // A capital makes the search exact.
  await ui.input({ key: 'grep', text: 'Tenant', kind: 'change' })
  expect(asked[1]?.includes('-i')).toBe(false)
  await ui.input({ key: 'grep', text: 'tenant', kind: 'change' })

  // The file opens a few lines above the one found, which is named.
  await ui.press({ key: 'find-0' })
  expect(await ui.find({ type: 'Text', text: 'apps/anchor-ui/domain/session.ts' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /lines 9–40 of 40/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '→ line 12' })).toBeDefined()
  await ui.press({ key: 'prev' })
  expect(await ui.find({ type: 'Text', text: /^40 lines/ })).toBeDefined()
  await ui.press({ key: 'back' })

  // The search is as it was left.
  expect((await ui.find({ key: 'find-0' }))?.text).toBe('tenant')
  await ui.input({ key: 'grep', text: 'nowhere', kind: 'change' })
  expect(await ui.find({ type: 'Text', text: 'Nothing found.' })).toBeDefined()
  await ui.press({ key: 'tab-explorer' })
  await ui.unmount()
})

test('turns the pane to another folder, by name or by path, and back', async ($, on) => {
  const ranIn: string[] = []
  const filled: string[] = []
  let kept: string | undefined
  let draft = ''

  const DIRS: Record<string, string[]> = {
    'Users/sam/code': ['anchor-platform', 'anchor-backend', 'notes', '.cache'],
    'Users/sam': ['code', 'other'],
    'Users/sam/other': ['tools'],
  }
  const entry = (name: string, kind: 'dir' | 'file') => ({ name, kind, size: 0, mtimeMs: 0, isLink: false })
  const endOf = (path: string, tails: string[]) => tails.find(tail => slashed(path).endsWith(tail))

  mock.clock(on, { now: 400_000 })
  on('env.get', ($$, e) => ({ value: e.name === 'USERPROFILE' ? 'C:\\Users\\sam' : undefined }))
  on('session.root', () => ({ value: 'C:\\Users\\sam\\code\\anchor-platform' }))
  on('fs.list', ($$, e) => {
    const folder = endOf(e.path, Object.keys(DIRS))

    return {
      value: slashed(e.path).endsWith('claude-mods')
        ? [entry('README.md', 'file')]
        : folder === undefined
          ? []
          : (DIRS[folder] ?? []).map(name => entry(name, 'dir')),
    }
  })
  on('fs.exists', ($$, e) => ({ value: /(anchor-platform|anchor-backend|tools)\/\.git$/.test(slashed(e.path)) }))
  on('fs.stat', ($$, e) => {
    if (slashed(e.path).includes('nope')) {
      throw new Error('ENOENT')
    }

    return { value: entry('', /anchor-backend$|claude-mods$/.test(slashed(e.path)) ? 'dir' : 'file') }
  })
  on('fs.read', () => {
    if (kept === undefined) {
      throw new Error('ENOENT')
    }

    return { value: kept }
  })
  on('fs.write', ($$, e) => {
    kept = e.text

    return { value: undefined }
  })
  on('prompt.read', () => ({ value: { text: draft, cursor: 0 } }))
  on('prompt.fill', ($$, e) => {
    filled.push(e.text)

    return { isFilled: true }
  })
  on('process.run', ($$, e) => {
    const cwd = slashed(e.init?.cwd ?? '')

    ranIn.push(cwd)

    if (cwd.endsWith('claude-mods')) {
      return ran('', 128)
    }

    if (e.argv[1] === 'rev-parse') {
      return ran(cwd === '' ? 'C:/Users/sam/code/anchor-platform\n' : `${cwd}\n`)
    }

    // Git is asked from the top of the repository, the session's own included.
    return ran(e.argv[1] === 'ls-files' ? (cwd.endsWith('anchor-backend') ? 'src/main.ts\0' : `${PATHS.join('\0')}\0`) : '')
  })

  const ui = await $.ui.mount({ plugin: 'files', surface: 'desktop', component: 'Pane', requestId: 'files', props: PANE })

  // The files are listed behind the first drawing: an empty search waits for the list.
  await ui.input({ key: 'q', text: '', kind: 'change' })

  expect((await ui.find({ key: 'repo' }))?.text).toBe('anchor-platform ▾')
  await ui.press({ key: 'repo' })
  expect(await ui.find({ type: 'Text', text: 'OPEN A FOLDER' })).toBeDefined()
  // The session's own first, then the repositories beside it and one folder over; a plain folder is left out.
  expect(bare((await ui.find({ key: 'folder-0' }))?.text)).toBe('\u{1F5C0} anchor-platform')
  expect(await ui.find({ type: 'Text', text: 'this session ' })).toBeDefined()
  expect(bare((await ui.find({ key: 'folder-1' }))?.text)).toBe('\u{1F5C0} anchor-backend')
  expect(bare((await ui.find({ key: 'folder-2' }))?.text)).toBe('\u{1F5C0} tools')
  expect(await ui.find({ key: 'folder-3' })).toBeUndefined()

  // Typing narrows the list; Enter opens the first folder the name fits.
  await ui.input({ key: 'folder', text: 'back', kind: 'change' })
  expect(bare((await ui.find({ key: 'folder-0' }))?.text)).toBe('\u{1F5C0} anchor-backend')
  await ui.input({ key: 'folder', text: '', kind: 'submit' })
  expect(await ui.find({ type: 'Text', text: 'OPEN A FOLDER' })).toBeDefined()
  await ui.input({ key: 'folder', text: 'back', kind: 'submit' })
  expect((await ui.find({ key: 'repo' }))?.text).toBe('anchor-backend ▾')
  expect(await ui.find({ type: 'Text', text: "Not the session's folder." })).toBeDefined()
  expect(bare((await ui.find({ key: 'row-0' }))?.text)).toBe('▸ \u{1F5C0} src')
  // Git was asked in that folder, and the folder is kept for another session.
  expect(ranIn.at(-1)).toBe('C:/Users/sam/code/anchor-backend')
  expect(JSON.parse(kept ?? '[]')).toEqual(['C:/Users/sam/code/anchor-backend'])

  // The session moves only by a command the person sends: an empty prompt is filled, a draft is left alone.
  draft = 'half a thought'
  await ui.press({ key: 'move' })
  expect(filled).toEqual([])
  expect(await ui.find({ type: 'Text', text: /send or clear it/ })).toBeDefined()
  draft = ''
  await ui.press({ key: 'move' })
  expect(filled).toEqual(['/cd C:/Users/sam/code/anchor-backend'])

  await ui.press({ key: 'home' })
  expect((await ui.find({ key: 'repo' }))?.text).toBe('anchor-platform ▾')
  expect(await ui.find({ key: 'home' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '6 files' })).toBeDefined()

  // A folder that is no repository is opened by its path and walked.
  await ui.press({ key: 'repo' })
  expect(bare((await ui.find({ key: 'folder-1' }))?.text)).toBe('\u{1F5C0} anchor-backend')
  await ui.input({ key: 'folder', text: 'C:\\Users\\sam\\claude-mods\\', kind: 'submit' })
  expect((await ui.find({ key: 'repo' }))?.text).toBe('claude-mods ▾')
  expect(bare((await ui.find({ key: 'row-0' }))?.text)).toBe('README.md')
  await ui.press({ key: 'tab-changes' })
  expect(await ui.find({ type: 'Text', text: /Not a git repository/ })).toBeDefined()
  await ui.press({ key: 'tab-explorer' })

  await ui.press({ key: 'repo' })
  await ui.input({ key: 'folder', text: 'C:/nope/x', kind: 'submit' })
  expect(await ui.find({ type: 'Text', text: 'No folder at C:/nope/x.' })).toBeDefined()
  await ui.input({ key: 'folder', text: 'zzz', kind: 'submit' })
  expect(await ui.find({ type: 'Text', text: /No folder by that name/ })).toBeDefined()
  // A path is opened only whole: one told from somewhere else would mean another folder in another session.
  await ui.input({ key: 'folder', text: '../elsewhere', kind: 'submit' })
  expect(await ui.find({ type: 'Text', text: /whole path/ })).toBeDefined()
  await ui.press({ key: 'back' })
  await ui.press({ key: 'home' })
  expect((await ui.find({ key: 'repo' }))?.text).toBe('anchor-platform ▾')
  await ui.unmount()
})

test('tells a branch from the one it left, and reads what the type checker prints', () => {
  // What differs from another commit: added and deleted files by their own marks, a rename by its new name,
  // and the files git does not track yet, which are no part of that diff.
  const named = 'M\0README.md\0A\0docs/new.md\0R096\0old.ts\0src/moved.ts\0D\0gone.ts\0'
  const counted = '5\t2\tREADME.md\0' + '9\t0\tdocs/new.md\0' + '0\t0\t\0old.ts\0src/moved.ts\0' + '0\t7\tgone.ts\0'

  expect(namedOf(named, counted, [{ path: 'draft.md', mark: 'U' }, { path: 'README.md', mark: 'M' }])).toEqual([
    { path: 'README.md', mark: 'M', added: 5, removed: 2 },
    { path: 'docs/new.md', mark: 'A', added: 9, removed: 0 },
    { path: 'src/moved.ts', mark: 'M', added: 0, removed: 0 },
    { path: 'gone.ts', mark: 'D', added: 0, removed: 7 },
    { path: 'draft.md', mark: 'U' },
  ])
  expect(namedOf('', '', [])).toEqual([])
  // Git counts what the branch lacks first, then what it has over the other.
  expect(aheadOf('1\t3\n')).toEqual({ ahead: 3, behind: 1 })
  expect(aheadOf('')).toEqual({ ahead: 0, behind: 0 })
  expect(standingOf('feature/x', 'main', 3, 1)).toBe('on feature/x · 3 ahead of main, 1 behind')
  expect(standingOf('feature/x', 'main', 0, 2)).toBe('on feature/x · 2 behind main')
  expect(standingOf('feature/x', 'main', 0, 0)).toBe('on feature/x · level with main')
  expect(standingOf('main', 'origin/main', 2, 0)).toBe('on main · 2 ahead of origin/main')
  expect(standingOf('main', 'main', 0, 0)).toBe('on main')
  expect(standingOf('HEAD', 'main', 1, 0)).toBe('on no branch (a commit is checked out) · 1 ahead of main')

  // The type checker tells a path from the project's folder; the lines that spell an error out are left out.
  const printed = [
    "domain/session.ts(12,5): error TS2322: Type 'string' is not assignable to type 'number'.\r",
    "  Type 'string' is not assignable to type 'number'.\r",
    "components\\ui\\button.tsx(3,1): error TS2304: Cannot find name 'x'.",
    "../shared/util.ts(1,1): error TS2307: Cannot find module 'y'.",
    'error TS18003: No inputs were found in config file.',
    '',
  ].join('\n')

  expect(problemsOf(printed, 'apps/anchor-ui', 2)).toEqual({
    problems: [
      { path: 'apps/anchor-ui/domain/session.ts', line: 12, column: 5, code: 'TS2322', message: "Type 'string' is not assignable to type 'number'." },
      { path: 'apps/anchor-ui/components/ui/button.tsx', line: 3, column: 1, code: 'TS2304', message: "Cannot find name 'x'." },
    ],
    total: 3,
    files: 3,
    notes: ['TS18003: No inputs were found in config file.'],
  })
  expect(problemsOf(printed, '', 9).problems[0]?.path).toBe('domain/session.ts')
  expect(problemsOf(printed, 'apps/anchor-ui', 9).problems[2]?.path).toBe('apps/shared/util.ts')
  expect(projectsOf(['packages/b/tsconfig.json', 'README.md', 'tsconfig.json', 'apps/a/tsconfig.json', 'apps/a/tsconfig.build.json'], 4)).toEqual([
    '',
    'apps/a',
    'packages/b',
  ])
  // The checker is looked for in the project's own folder, then in each one above it.
  expect(tscPlaces('apps/a')).toEqual([
    'apps/a/node_modules/typescript/bin/tsc',
    'apps/node_modules/typescript/bin/tsc',
    'node_modules/typescript/bin/tsc',
  ])
  expect(tscPlaces('')).toEqual(['node_modules/typescript/bin/tsc'])

  const one = { path: 'a.ts', line: 12, column: 5, code: 'TS2322', message: 'Wrong type.' }

  expect(askOf([one], 1)).toBe('Fix this type error in @a.ts at line 12: TS2322: Wrong type.')
  expect(askOf([one, { ...one, path: 'b.ts', line: 3 }], 40)).toBe(
    'Fix these 40 type errors:\n- a.ts:12 TS2322: Wrong type.\n- b.ts:3 TS2322: Wrong type.\n- and 38 more: run the type checker again to see them',
  )
  expect(soundProblems([one, { path: 'a.ts' }, null])).toEqual([one])
})

test('shows what the branch changed against the one it left', async ($, on) => {
  const diffed: (readonly string[])[] = []

  mock.clock(on, { now: 460_000 })
  on('session.root', () => ({ value: '/repo' }))
  on('process.run', ($$, e) => {
    const [, verb, ...rest] = e.argv

    if (verb === 'rev-parse') {
      return ran(rest.includes('--abbrev-ref') ? 'feature/x\n' : rest.includes('--verify') ? '' : '/repo\n')
    }

    if (verb === 'diff' && rest[0] === 'abc123') {
      diffed.push(e.argv)

      return ran(
        rest.includes('--name-status')
          ? 'M\0README.md\0A\0docs/new.md\0'
          : rest.includes('--numstat')
            ? '5\t2\tREADME.md\0' + '9\t0\tdocs/new.md\0'
            : DIFF,
      )
    }

    return ran(
      verb === 'ls-files'
        ? `${PATHS.join('\0')}\0`
        : verb === 'status'
          ? ' M README.md\0'
          : verb === 'diff'
            ? rest.includes('--numstat')
              ? '1\t1\tREADME.md\0'
              : DIFF
            : verb === 'symbolic-ref'
              ? 'origin/main\n'
              : verb === 'merge-base'
                ? 'abc123\n'
                : verb === 'rev-list'
                  ? '1\t3\n'
                  : '',
    )
  })

  const ui = await $.ui.mount({ plugin: 'files', surface: 'desktop', component: 'Pane', requestId: 'files', props: PANE })

  await ui.input({ key: 'q', text: '', kind: 'change' })
  await ui.press({ key: 'tab-changes' })
  // Where the branch stands, and the choice of what the changes are told against.
  expect(await ui.find({ type: 'Text', text: 'on feature/x · 3 ahead of main, 1 behind' })).toBeDefined()
  expect((await ui.find({ key: 'against-head' }))?.text).toBe('UNCOMMITTED')
  expect((await ui.find({ key: 'against-base' }))?.text).toBe('AGAINST MAIN')
  expect(await ui.find({ type: 'Text', text: /1 file changed since the last commit/ })).toBeDefined()
  expect(diffed.length).toBe(0)

  // Against main: every file that differs from the commit the two last shared, an added one by its own mark.
  await ui.press({ key: 'against-base' })
  expect(bare((await ui.find({ key: 'change-0' }))?.text)).toBe('README.md')
  expect(await ui.find({ type: 'Text', text: '+5 ' })).toBeDefined()
  expect(bare((await ui.find({ key: 'change-1' }))?.text)).toBe('new.md')
  expect(await ui.find({ type: 'Text', text: 'A ' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /2 files differ from main, committed on this branch or not/ })).toBeDefined()
  // The count on the tab stays what is not committed yet.
  expect((await ui.find({ key: 'tab-changes' }))?.text).toBe('CHANGES 1')

  // The diff of one is told against that commit, and says so.
  await ui.press({ key: 'change-1' })
  expect(diffed.at(-1)).toEqual(['git', 'diff', 'abc123', '--no-color', '--no-ext-diff', '-U3', '--', 'docs/new.md'])
  expect(await ui.find({ type: 'Text', text: 'against main' })).toBeDefined()
  await ui.press({ key: 'back' })

  await ui.press({ key: 'against-head' })
  expect(await ui.find({ type: 'Text', text: /1 file changed since the last commit/ })).toBeDefined()
  await ui.press({ key: 'change-0' })
  expect(await ui.find({ type: 'Text', text: 'since the last commit' })).toBeDefined()
  await ui.press({ key: 'back' })
  await ui.press({ key: 'tab-explorer' })
  await ui.unmount()
})

test('runs the type checker on a press, lists what it finds, and asks for a fix', async ($, on) => {
  const checked: { argv: readonly string[]; cwd: string }[] = []
  const filled: string[] = []
  const text = Array.from({ length: 40 }, (_, at) => `line ${at + 1}`).join('\n')

  mock.clock(on, { now: 480_000 })
  on('session.root', () => ({ value: '/repo' }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('turn.complete', () => ({ text: '' }))
  on('fs.exists', ($$, e) => ({ value: slashed(e.path).endsWith('apps/anchor-ui/node_modules/typescript/bin/tsc') }))
  on('fs.stat', () => ({ value: { kind: 'file' as const, size: text.length, mtimeMs: 0, isLink: false } }))
  on('fs.read', () => ({ value: text }))
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  on('prompt.fill', ($$, e) => {
    filled.push(e.text)

    return { isFilled: true }
  })
  on('process.run', ($$, e) => {
    if (e.argv[0] === 'node') {
      checked.push({ argv: e.argv, cwd: slashed(e.init?.cwd ?? '') })

      return ran(
        [
          "domain/session.ts(12,5): error TS2322: Type 'string' is not assignable to type 'number'.",
          "  Type 'string' is not assignable to type 'number'.",
          "components/ui/button.tsx(3,1): error TS2304: Cannot find name 'x'.",
          '',
        ].join('\n'),
        2,
      )
    }

    return ran(
      e.argv[1] === 'ls-files' ? `${[...PATHS, 'apps/anchor-ui/tsconfig.json'].join('\0')}\0` : e.argv[1] === 'rev-parse' ? '/repo\n' : '',
    )
  })

  const ui = await $.ui.mount({ plugin: 'files', surface: 'desktop', component: 'Pane', requestId: 'files', props: PANE })
  // The checker runs behind the press: the pane is looked at until it has drawn what was asked for.
  const until = async (key: string) => {
    for (let tries = 0; tries < 400 && (await ui.find({ key })) === undefined; tries++) {
      await Promise.resolve()
    }
  }

  await ui.input({ key: 'q', text: '', kind: 'change' })
  await ui.press({ key: 'tab-problems' })
  expect((await ui.find({ key: 'check-0' }))?.text).toBe('Run the type checker')
  expect(await ui.find({ type: 'Text', text: /with its output turned off/ })).toBeDefined()
  expect(checked.length).toBe(0)

  await ui.press({ key: 'check-0' })
  await until('problem-0')
  // The project's own checker, in the project's folder, with everything it would write turned off.
  expect(checked.length).toBe(1)
  expect(checked[0]?.cwd).toBe('/repo/apps/anchor-ui')
  expect(checked[0]?.argv).toEqual([
    'node',
    '/repo/apps/anchor-ui/node_modules/typescript/bin/tsc',
    '--noEmit',
    '--composite',
    'false',
    '--incremental',
    'false',
    '--pretty',
    'false',
    '-p',
    '/repo/apps/anchor-ui',
  ])
  expect(await ui.find({ type: 'Text', text: '2 errors in 2 files' })).toBeDefined()
  expect((await ui.find({ key: 'tab-problems' }))?.text).toBe('PROBLEMS 2')
  expect(bare((await ui.find({ key: 'trouble-0' }))?.text)).toBe('session.ts')
  expect((await ui.find({ key: 'problem-0-line' }))?.text).toBe('12')
  expect((await ui.find({ key: 'problem-0' }))?.text).toBe("Type 'string' is not assignable to type 'number'.")
  expect(await ui.find({ type: 'Text', text: /TS2322$/ })).toBeDefined()
  expect(bare((await ui.find({ key: 'trouble-1' }))?.text)).toBe('button.tsx')

  // An error opens its file at the line, says what is wrong, and offers the request to fix it.
  await ui.press({ key: 'problem-0' })
  expect(await ui.find({ type: 'Text', text: 'apps/anchor-ui/domain/session.ts' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '→ line 12' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: "TS2322: Type 'string' is not assignable to type 'number'." })).toBeDefined()
  await ui.press({ key: 'fix' })
  await ui.press({ key: 'back' })
  await ui.press({ key: 'fix-all' })
  // The request is put in the prompt, with the file mentioned by its path from where the session works.
  expect(filled).toEqual([
    "Fix this type error in @apps/anchor-ui/domain/session.ts at line 12: TS2322: Type 'string' is not assignable to type 'number'.",
    "Fix these 2 type errors:\n- apps/anchor-ui/domain/session.ts:12 TS2322: Type 'string' is not assignable to type 'number'.\n- apps/anchor-ui/components/ui/button.tsx:3 TS2304: Cannot find name 'x'.",
  ])

  // A turn's end makes what was read old: the pane says so.
  await $.turn.complete({
    answer: 'Done.',
    durationMs: 1000,
    isAborted: false,
    reason: 'answer',
    turnId: 't1',
    usage: { model: 'claude-opus-5-5', input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  })
  expect(await ui.find({ type: 'Text', text: /read before the last turn: run it again/ })).toBeDefined()
  await ui.press({ key: 'tab-explorer' })
  await ui.unmount()
})

test('says why a file is not drawn: too large, binary, or gone', async ($, on) => {
  let size = 2_000_000
  let text: string | undefined = 'x'
  let listed = 0

  // Later than the list the test before read, so it is read again.
  mock.clock(on, { now: 500_000 })
  on('process.run', () => ran('', 128))
  // The engine hands a hook the path resolved, so the root is told by being asked first.
  on('fs.list', () => {
    listed++

    return {
      value:
        listed === 1
          ? [
              { name: 'big.bin', kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false },
              { name: 'node_modules', kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false },
            ]
          : [],
    }
  })
  on('fs.stat', () => {
    if (text === undefined) {
      throw new Error('ENOENT')
    }

    return { value: { kind: 'file' as const, size, mtimeMs: 0, isLink: false } }
  })
  on('fs.read', () => ({ value: text ?? '' }))

  const ui = await $.ui.mount({ plugin: 'files', surface: 'desktop', component: 'Pane', requestId: 'files', props: PANE })

  // No git here: the folders are walked, and node_modules is left alone.
  await ui.input({ key: 'q', text: 'big', kind: 'submit' })
  expect(await ui.find({ type: 'Text', text: /Too large to show here \(1\.9 MB\)/ })).toBeDefined()

  await ui.press({ key: 'back' })
  size = 10
  text = 'a\0b'
  await ui.input({ key: 'q', text: 'big', kind: 'submit' })
  expect(await ui.find({ type: 'Text', text: /A binary file/ })).toBeDefined()

  await ui.press({ key: 'back' })
  text = undefined
  await ui.input({ key: 'q', text: 'big', kind: 'submit' })
  expect(await ui.find({ type: 'Text', text: /cannot be read/ })).toBeDefined()
  // node_modules was never listed: the walk asked for the root alone.
  expect(listed).toBe(1)
  await ui.unmount()
})

// The folder the tests of Claude's marks browse, and the pane as the engine lists it once it is up.
const TOP = 'C:/Users/sam/anchor-platform'
const UP = { value: [{ id: 'files', title: 'Files', isShown: true, isFocused: true, isPlaced: true }] }
// The dark theme's inks: the ground a row is lit with while a mark is new, and a folder's dot new and settled.
const LIT = { read: '#2a2539', write: '#34291f', commit: '#213125' }
const DOT = { read: '#b794f6', write: '#ff9e4a', quietWrite: '#a2683a', git: '#e2c08d' }
// How long a burst of calls is gathered before it is written.
const GATHER = 120

type Drawn = { type?: unknown; props?: Record<string, unknown>; children?: unknown[] }
type Drawing = {
  find: (query: { key: string }) => Promise<Drawn | undefined>
  findAll: (query: { type: string }) => Promise<Drawn[]>
}

// A tool's call as a session raises it. The tools' own types are left out: a test of the marks needs none of them.
const call = ($: unknown, input: Record<string, unknown>) =>
  ($ as { tool: { call: (input: Record<string, unknown>) => Promise<unknown> } }).tool.call(input)

// Git as the tests of a commit see it: what is changed, the commit the branch is at and when it was made,
// whether the branch went on from the commit it was at before, and the files that commit changed.
type Told = { status: string; head: string; changed: string[]; isOnward: boolean; madeAt: number }

const gitOf = (told: Told, asked: (readonly string[])[]) => ($$: unknown, e: { argv: readonly string[] }) => {
  const [, verb, ...rest] = e.argv

  if (verb === 'diff' && rest.includes('--name-only')) {
    asked.push(e.argv)

    return ran(`${told.changed.join('\0')}\0`)
  }

  if (verb === 'merge-base' && rest.includes('--is-ancestor')) {
    return ran('', told.isOnward ? 0 : 1)
  }

  return ran(
    verb === 'ls-files'
      ? `${PATHS.join('\0')}\0`
      : verb === 'rev-parse'
        ? rest[0] === 'HEAD'
          ? `${told.head}\n`
          : `${TOP}\n`
        : verb === 'status'
          ? told.status
          : verb === 'log'
            ? `${Math.floor(told.madeAt / 1000)}\n`
            : '',
  )
}

// What a row wears: the ground it is lit with, what its icon says of the file, and the ink of its dot.
const wornBy = async (ui: Drawing, key: string) => {
  const row = await ui.find({ key: `line-${key}` })
  let says: unknown
  let dot: unknown
  let glyph: unknown

  const walk = (node: unknown) => {
    const one = node as Drawn | null

    if (typeof one !== 'object' || one === null) {
      return
    }

    const said = (one.children ?? []).filter(child => typeof child === 'string').join('')

    if (one.type === 'Svg' && one.props?.alt !== 'indent') {
      says = one.props?.alt
    }

    if (one.type === 'Text' && said === '• ') {
      dot = one.props?.color
    }

    if (one.type === 'Text' && (said === '● ' || said === '· ')) {
      glyph = said
    }

    for (const child of one.children ?? []) {
      walk(child)
    }
  }

  walk(row)

  return { ground: row?.props?.backgroundColor, says, dot, glyph }
}

// The file icons in view that say this of their file.
const iconsOf = async (ui: Drawing, says: RegExp) =>
  (await ui.findAll({ type: 'Svg' })).filter(icon => says.test(String(icon.props?.alt)))

// The tree as it is drawn, a row a line.
const treeIn = async (ui: { find: (query: { key: string }) => Promise<{ text: string } | undefined> }, prefix = 'row') => {
  const out: (string | undefined)[] = []

  for (let at = 0; at < 100; at++) {
    const row = await ui.find({ key: `${prefix}-${at}` })

    if (row === undefined) {
      break
    }

    out.push(bare(row.text))
  }

  return out
}

test('reads a tool call as a path, and tells the marks of the folder in view', () => {
  // The tools that name a file, by the argument that names it, with either slash.
  expect(seenOf('Read', { file_path: 'C:\\repo\\a.ts' })).toEqual({ deed: 'read', path: 'C:/repo/a.ts' })
  expect(seenOf('Edit', { file_path: '/repo/a.ts' })).toEqual({ deed: 'write', path: '/repo/a.ts' })
  expect(seenOf('Write', { file_path: 'a.ts' })).toEqual({ deed: 'write', path: 'a.ts' })
  expect(seenOf('NotebookEdit', { notebook_path: '/repo/n.ipynb' })).toEqual({ deed: 'write', path: '/repo/n.ipynb' })
  expect(seenOf('Bash', { command: 'cat a.ts' })).toBeUndefined()
  expect(seenOf('Read', {})).toBeUndefined()
  expect(seenOf('constructor', { file_path: 'a.ts' })).toBeUndefined()
  // A search is of the folder it names, or of where the session works; a pattern's leading folders count.
  expect(seenOf('Grep', { pattern: 'x', path: '/repo/src' })).toEqual({ deed: 'read', path: '/repo/src' })
  expect(seenOf('Grep', { pattern: 'x' })).toEqual({ deed: 'read', path: '' })
  expect(seenOf('Glob', { pattern: '**/*.ts' })).toEqual({ deed: 'read', path: '' })
  expect(seenOf('Glob', { pattern: 'src/ui/**/*.tsx', path: '/repo/' })).toEqual({ deed: 'read', path: '/repo/src/ui' })
  expect(seenOf('Glob', { pattern: 'C:/repo/docs/*.md', path: 'C:/other' })).toEqual({ deed: 'read', path: 'C:/repo/docs' })

  // A path told from where the session works is read from there; one outside the folder in view is none of its own.
  expect(wholeOf('src/../a.ts', '/repo')).toBe('/repo/a.ts')
  expect(wholeOf('', 'C:/repo/')).toBe('C:/repo')
  expect(wholeOf('C:/repo/./x/', 'D:/else')).toBe('C:/repo/x')
  expect(withinOf('c:/Repo/src/a.ts', 'C:/repo')).toBe('src/a.ts')
  expect(withinOf('C:/repo', 'C:/repo')).toBe('')
  expect(withinOf('C:/repository/a.ts', 'C:/repo')).toBeUndefined()
  expect(withinOf('/Repo/a.ts', '/repo')).toBeUndefined()
  expect(withinOf('a.ts', '')).toBe('a.ts')
  expect(withinOf('/x/a.ts', '')).toBeUndefined()

  expect(movesHead('git commit -m "x"')).toBe(true)
  expect(movesHead('cd app && git -C ../lib commit -am x')).toBe(true)
  expect(movesHead('git status')).toBe(false)
  expect(movesHead('git log | grep commit')).toBe(false)

  // One touch a path, the latest first: a mark is new until its time is up.
  const read = touchedBy({ at: 0, touches: [] }, [{ deed: 'read', path: 'C:/repo/a.ts' }, { deed: 'read', path: 'C:/repo/src/b.ts' }], 1000, 10)

  expect(read).toEqual({
    at: 1000,
    touches: [
      { path: 'C:/repo/src/b.ts', read: 1000, write: 0, commit: 0, liveUntil: 1000 + LIVE_MS },
      { path: 'C:/repo/a.ts', read: 1000, write: 0, commit: 0, liveUntil: 1000 + LIVE_MS },
    ],
  })
  expect(lightsOf(read, 'C:/repo', 'all').own.get('src/b.ts')).toEqual({ deed: 'read', isLive: true, at: 1000 })
  expect(lightsOf(read, 'C:/repo', 'all').inside.get('src')).toEqual({ deed: 'read', isLive: true, at: 1000 })
  // What lies outside the folder in view is kept and not shown: turned there, the pane shows it.
  expect(lightsOf(read, 'C:/elsewhere', 'all').own.size).toBe(0)
  expect(lightsOf(read, 'C:/', 'all').own.get('repo/a.ts')).toBeDefined()

  // Windows spells one path in either case: a write of it is the same touch.
  const written = touchedBy(read, [{ deed: 'write', path: 'c:/repo/SRC/b.ts' }], 2000, 10)

  expect(written.touches.length).toBe(2)
  expect(written.touches[0]).toEqual({ path: 'c:/repo/SRC/b.ts', read: 1000, write: 2000, commit: 0, liveUntil: 2000 + LIVE_MS })
  expect(lightsOf(written, 'C:/repo', 'all').own.get('src/b.ts')).toEqual({ deed: 'write', isLive: true, at: 2000 })
  // Told to show writes alone, the read is left out and the write stays.
  expect([...lightsOf(written, 'C:/repo', 'writes').own.keys()]).toEqual(['src/b.ts'])
  expect([...lightsOf(written, 'C:/repo', 'reads').own.values()]).toEqual([
    { deed: 'read', isLive: false, at: 1000 },
    { deed: 'read', isLive: true, at: 1000 },
  ])
  expect(lightsOf(written, 'C:/repo', 'none').own.size).toBe(0)

  // Marks settle together: the one due, and any due within a moment of it.
  expect(dueOf(written)).toBe(1000 + LIVE_MS)
  expect(settledOf(written, 3000)).toBeUndefined()

  const settled = settledOf(written, 1000 + LIVE_MS)

  expect(settled?.at).toBe(1000 + LIVE_MS + SLACK_MS)
  expect(lightsOf(settled ?? written, 'C:/repo', 'all').own.get('a.ts')).toEqual({ deed: 'read', isLive: false, at: 1000 })
  // The write was due within the same moment, and is quiet with it.
  expect(dueOf(settled ?? written)).toBeUndefined()

  // A read after a write is new as a read, and settles back to the write; a commit after it settles green.
  const again = touchedBy(settled ?? written, [{ deed: 'read', path: 'C:/repo/src/b.ts' }], 20_000, 10)

  expect(lightsOf(again, 'C:/repo', 'all').own.get('src/b.ts')).toMatchObject({ deed: 'read', isLive: true })
  expect(lightsOf(settledOf(again, 30_000) ?? again, 'C:/repo', 'all').own.get('src/b.ts')).toMatchObject({ deed: 'write', isLive: false })

  const committed = touchedBy(again, [{ deed: 'commit', path: 'C:/repo/src/b.ts' }], 40_000, 1)

  expect(committed.touches).toEqual([{ path: 'C:/repo/src/b.ts', read: 20_000, write: 2000, commit: 40_000, liveUntil: 40_000 + COMMIT_MS }])
  expect(lightsOf(settledOf(committed, 90_000) ?? committed, 'C:/repo', 'all').own.get('src/b.ts')).toMatchObject({ deed: 'commit', isLive: false })

  // The state outlives a reload: what an older mod wrote in another shape is left out, not drawn.
  expect(soundActivity(['a.ts'])).toEqual({ at: 0, touches: [] })
  expect(soundActivity({ at: 5, touches: [{ path: 'a.ts', kind: 'read' }, read.touches[0], null] })).toEqual({ at: 5, touches: [read.touches[0]] })

  // Nor is a time that is no time, or a choice of what to show that is none of the four.
  expect(soundActivity({ at: Number.NaN, touches: [read.touches[0]] })).toEqual({ at: 0, touches: [] })
  expect(soundActivity({ at: 5, touches: [{ ...read.touches[0], liveUntil: Number.POSITIVE_INFINITY }, { ...read.touches[0], read: -1 }] })).toEqual({
    at: 5,
    touches: [],
  })
  expect([...lightsOf(read, 'C:/repo', 'constructor' as never).own.keys()]).toEqual(['src/b.ts', 'a.ts'])

  // A mark due later than any is ever set settles with the next that are due, and a wait is never kept for it.
  const late = { at: 1000, touches: [{ path: 'C:/repo/a.ts', read: 1000, write: 0, commit: 0, liveUntil: 8e15 }] }

  expect(settledOf(late, 2000)).toEqual({ at: 2000 + SLACK_MS, touches: [{ ...late.touches[0], liveUntil: 2000 + SLACK_MS }] })
  expect(dueOf(settledOf(late, 2000) ?? late)).toBeUndefined()
  // Marks settled up to a time that has not come are settled up to now, so a new one is new.
  expect(touchedBy({ at: 8e15, touches: [] }, [{ deed: 'read', path: 'C:/repo/a.ts' }], 5000, 10).at).toBe(5000 + SLACK_MS)

  // A file's mark is drawn in the room a chevron would take: the edge is no wider for it.
  const plain = edgeOf({ depth: 1, name: 'a.ts' }, false)
  const marked = edgeOf({ depth: 1, name: 'a.ts' }, false, { color: '#b794f6', isLive: true })

  expect(marked.width).toBe(plain.width)
  expect(marked.source.match(/<circle [^>]*#b794f6/g)?.length).toBe(2)
  expect(edgeOf({ depth: 1, name: 'a.ts' }, false, { color: '#75619f', isLive: false }).source.match(/<circle /g)?.length).toBe(1)
})

test('marks the file Claude reads, another way the one it writes, and lets the mark settle', async ($, on) => {
  const clock = mock.clock(on, { now: 600_000 })
  let refused = ''

  on('ui.panes', () => UP)
  on('tool.call', ($$, e) => {
    const named = (e as { file_path?: unknown }).file_path

    return refused !== '' && named === refused ? { deny: 'Not this one.' } : { result: {} }
  })
  on('process.run', ($$, e) =>
    ran(e.argv[1] === 'ls-files' ? `${PATHS.join('\0')}\0` : e.argv[1] === 'rev-parse' ? (e.argv[2] === 'HEAD' ? 'aaa\n' : `${TOP}\n`) : ''),
  )

  const ui = await $.ui.mount({ plugin: 'files', surface: 'desktop', component: 'Pane', requestId: 'files', props: PANE })

  await ui.input({ key: 'q', text: '', kind: 'change' })
  expect(bare((await ui.find({ key: 'row-2' }))?.text)).toBe('README.md')
  expect(await wornBy(ui, 'row-2')).toEqual({ ground: undefined, says: 'file', dot: undefined, glyph: undefined })

  const label = (await ui.find({ key: 'row-2' }))?.text
  const edge = (await iconsOf(ui, /^file$/)).at(-1)?.props?.width

  expect(edge).toBe(36)

  // A file outside the folder in view is none of this tree's: nothing is marked.
  await call($, { tool: 'Read', file_path: 'C:\\Users\\sam\\elsewhere\\README.md' })
  await clock.advance(GATHER)
  expect((await wornBy(ui, 'row-2')).says).toBe('file')
  expect((await ui.findAll({ type: 'Text', text: '• ' })).length).toBe(0)

  // A read, by a path with the other slash and the drive in small letters. It is written a moment after the call.
  await call($, { tool: 'Read', file_path: 'c:\\Users\\sam\\anchor-platform\\README.md' })
  expect((await wornBy(ui, 'row-2')).says).toBe('file')
  await clock.advance(GATHER)
  expect(await wornBy(ui, 'row-2')).toMatchObject({ ground: LIT.read, says: 'file, read by Claude just now' })
  // The mark takes room that was there: the name and the edge are as wide as they were.
  expect((await ui.find({ key: 'row-2' }))?.text).toBe(label)
  expect((await iconsOf(ui, /read by Claude/)).map(icon => icon.props?.width)).toEqual([edge])

  // A write is another colour.
  await call($, { tool: 'Edit', file_path: `${TOP}/README.md`, old_string: 'a', new_string: 'b' })
  await clock.advance(GATHER)
  expect(await wornBy(ui, 'row-2')).toMatchObject({ ground: LIT.write, says: 'file, written by Claude just now' })

  // After a while the mark settles into a quiet one that stays.
  await clock.advance(LIVE_MS)
  expect(await wornBy(ui, 'row-2')).toMatchObject({ ground: undefined, says: 'file, written by Claude this session' })
  await clock.advance(60_000)
  expect((await wornBy(ui, 'row-2')).says).toBe('file, written by Claude this session')

  // A read after that is new as a read, and settles back to what was written.
  await call($, { tool: 'Read', file_path: `${TOP}/README.md` })
  await clock.advance(GATHER)
  expect(await wornBy(ui, 'row-2')).toMatchObject({ ground: LIT.read, says: 'file, read by Claude just now' })
  await clock.advance(LIVE_MS)
  expect(await wornBy(ui, 'row-2')).toMatchObject({ ground: undefined, says: 'file, written by Claude this session' })

  // A search of a folder marks the folder, not the files in it; a call that was refused marks nothing.
  refused = `${TOP}/apps/anchor-ui/domain/session.ts`
  await call($, { tool: 'Edit', file_path: refused, old_string: 'a', new_string: 'b' })
  await call($, { tool: 'Grep', pattern: 'baseline', path: `${TOP}/docs` })
  await clock.advance(GATHER)
  expect(bare((await ui.find({ key: 'row-1' }))?.text)).toBe('▸ \u{1F5C0} docs')
  expect(await wornBy(ui, 'row-1')).toMatchObject({ ground: LIT.read, dot: DOT.read })
  expect((await wornBy(ui, 'row-0')).dot).toBeUndefined()
  await ui.press({ key: 'row-1' })
  expect((await wornBy(ui, 'row-2')).says).toBe('file')
  await clock.advance(LIVE_MS)
  await ui.unmount()

  // A terminal has no drawing: the mark is a glyph in the two cells before the name.
  const text = await $.ui.mount({ plugin: 'files', surface: 'terminal', component: 'Pane', requestId: 'files', props: PANE })

  expect(bare((await text.find({ key: 'row-3' }))?.text)).toBe('README.md')
  expect((await wornBy(text, 'row-3')).glyph).toBe('· ')
  await call($, { tool: 'Read', file_path: `${TOP}/README.md` })
  await clock.advance(GATHER)
  expect(await wornBy(text, 'row-3')).toMatchObject({ ground: LIT.read, glyph: '● ' })
  await clock.advance(LIVE_MS)
  await text.unmount()
})

test('follows Claude into a closed folder, and leaves what is in view where it is', async ($, on) => {
  const clock = mock.clock(on, { now: 700_000 })
  const files = [...PATHS]

  on('ui.panes', () => UP)
  on('session.cwd', () => ({ value: 'C:\\Users\\sam\\anchor-platform\\apps' }))
  on('tool.call', () => ({ result: {} }))
  on('fs.stat', () => ({ value: { kind: 'file' as const, size: 6, mtimeMs: 0, isLink: false } }))
  on('fs.read', () => ({ value: '# Docs' }))
  on('process.run', ($$, e) =>
    ran(e.argv[1] === 'ls-files' ? `${files.join('\0')}\0` : e.argv[1] === 'rev-parse' ? (e.argv[2] === 'HEAD' ? 'aaa\n' : `${TOP}\n`) : ''),
  )

  const ui = await $.ui.mount({ plugin: 'files', surface: 'desktop', component: 'Pane', requestId: 'files', props: PANE })
  const rows = () => treeIn(ui)

  await ui.input({ key: 'q', text: '', kind: 'change' })
  expect((await ui.find({ key: 'follow' }))?.text).toBe('◉ follow')
  expect(await rows()).toEqual(['▸ \u{1F5C0} apps', '▸ \u{1F5C0} docs', 'README.md'])

  // A file told from where the session works, three folders down: each closed folder over it opens.
  await call($, { tool: 'Read', file_path: 'anchor-ui\\domain\\session.ts' })
  await clock.advance(GATHER)
  expect(await rows()).toEqual([
    '▾ \u{1F5C1} apps',
    '▾ \u{1F5C1} anchor-ui',
    '▸ \u{1F5C0} components',
    '▾ \u{1F5C1} domain',
    'session.ts',
    '▸ \u{1F5C0} services',
    '▸ \u{1F5C0} docs',
    'README.md',
  ])
  expect(await wornBy(ui, 'row-4')).toMatchObject({ ground: LIT.read, says: 'file, read by Claude just now' })
  // The folders over it wear a dot in the read's ink; only the file's own row is lit.
  expect(await wornBy(ui, 'row-0')).toMatchObject({ ground: undefined, dot: DOT.read })

  // Told not to follow, the tree stays as it was left, and the closed folder still says what happens in it.
  await ui.press({ key: 'row-0' })
  await ui.press({ key: 'follow' })
  expect((await ui.find({ key: 'follow' }))?.text).toBe('○ follow')
  await call($, { tool: 'Edit', file_path: `${TOP}/apps/anchor-ui/services/session-service.ts`, old_string: 'a', new_string: 'b' })
  await clock.advance(GATHER)
  expect(await rows()).toEqual(['▸ \u{1F5C0} apps', '▸ \u{1F5C0} docs', 'README.md'])
  expect((await wornBy(ui, 'row-0')).dot).toBe(DOT.write)
  await clock.advance(LIVE_MS)
  expect((await wornBy(ui, 'row-0')).dot).toBe(DOT.quietWrite)
  await ui.press({ key: 'follow' })
  expect((await ui.find({ key: 'follow' }))?.text).toBe('◉ follow')

  // A search by name in progress is not moved, and its rows wear the marks too.
  await ui.input({ key: 'q', text: 'session', kind: 'change' })

  const hits = await treeIn(ui, 'hit')

  expect(hits.slice(0, 2)).toEqual(['session.ts', 'session-service.ts'])
  expect((await wornBy(ui, 'hit-0')).says).toBe('file, read by Claude this session')
  expect((await wornBy(ui, 'hit-1')).says).toBe('file, written by Claude this session')
  await call($, { tool: 'Read', file_path: `${TOP}/docs/ARCHITECTURE_AND_DECISIONS.md` })
  await clock.advance(GATHER)
  expect(await treeIn(ui, 'hit')).toEqual(hits)
  expect(await ui.find({ key: 'row-0' })).toBeUndefined()

  // Nor is an open file closed, nor the tab in view left.
  await ui.press({ key: 'hit-0' })
  expect(await ui.find({ type: 'Code' })).toBeDefined()
  await call($, { tool: 'Read', file_path: `${TOP}/apps/anchor-ui/components/ui/button.tsx` })
  await clock.advance(GATHER)
  expect(await ui.find({ type: 'Code' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'apps/anchor-ui/domain/session.ts' })).toBeDefined()
  await ui.press({ key: 'back' })
  await ui.press({ key: 'tab-changes' })
  // A file Claude makes is not in the list yet: git is asked again, and the file is there once the tree is.
  files.push('docs/NEW.md')
  await call($, { tool: 'Write', file_path: `${TOP}/docs/NEW.md`, content: '# New' })
  await clock.advance(GATHER)
  expect(await ui.find({ type: 'Text', text: 'Nothing changed since the last commit.' })).toBeDefined()

  // Back at the tree, the folders opened meanwhile show what was touched in them.
  await ui.press({ key: 'tab-explorer' })
  await ui.input({ key: 'q', text: '', kind: 'change' })
  expect((await rows()).slice(-4)).toEqual(['▾ \u{1F5C1} docs', 'ARCHITECTURE_AND_DECISIONS.md', 'NEW.md', 'README.md'])
  expect(await ui.find({ type: 'Text', text: '7 files' })).toBeDefined()
  expect((await wornBy(ui, `row-${(await rows()).indexOf('NEW.md')}`)).says).toBe('file, written by Claude just now')
  await clock.advance(LIVE_MS)
  await ui.unmount()
})

test('turns a changed file green once a commit has made it clean', async ($, on) => {
  const clock = mock.clock(on, { now: 800_000 })
  const asked: (readonly string[])[] = []
  const told: Told = {
    status: ' M README.md\0',
    head: 'h1',
    changed: ['README.md', 'apps/anchor-ui/domain/session.ts'],
    isOnward: true,
    madeAt: 0,
  }

  on('ui.panes', () => UP)
  on('tool.call', () => ({ result: {} }))
  on('process.run', gitOf(told, asked))

  const ui = await $.ui.mount({ plugin: 'files', surface: 'desktop', component: 'Pane', requestId: 'files', props: PANE })

  await ui.input({ key: 'q', text: '', kind: 'change' })
  expect(await ui.find({ type: 'Text', text: 'M ' })).toBeDefined()
  expect((await wornBy(ui, 'row-2')).says).toBe('file')

  // The list of changes wears the marks too, beside what git says of the file.
  await call($, { tool: 'Read', file_path: `${TOP}/README.md` })
  await clock.advance(GATHER)
  await ui.press({ key: 'tab-changes' })
  expect(bare((await ui.find({ key: 'change-0' }))?.text)).toBe('README.md')
  expect(await wornBy(ui, 'change-0')).toMatchObject({ ground: LIT.read, says: 'file, read by Claude just now' })
  expect(await ui.find({ type: 'Text', text: 'M ' })).toBeDefined()
  await ui.press({ key: 'tab-explorer' })
  expect(asked.length).toBe(0)

  // A commit: git is asked again as the command comes back, and the file that went clean is green.
  Object.assign(told, { status: '', head: 'h2', madeAt: clock.now() })
  await call($, { tool: 'Bash', command: 'git commit -am "docs: readme"' })
  await clock.advance(GATHER)
  expect(asked).toEqual([['git', 'diff', '--name-only', '-z', 'h1', 'h2']])
  expect(await ui.find({ type: 'Text', text: 'M ' })).toBeUndefined()
  expect(await wornBy(ui, 'row-2')).toMatchObject({ ground: LIT.commit, says: 'file, committed just now' })
  // Green stays longer than a read's mark, then settles as the others do.
  await clock.advance(LIVE_MS + SLACK_MS)
  expect((await wornBy(ui, 'row-2')).says).toBe('file, committed just now')
  await clock.advance(COMMIT_MS)
  expect(await wornBy(ui, 'row-2')).toMatchObject({ ground: undefined, says: 'file, committed this session' })

  // A change that is undone goes clean with no commit: it is not green.
  told.status = ' M docs/ARCHITECTURE_AND_DECISIONS.md\0'
  await clock.advance(21_000)
  await ui.input({ key: 'q', text: '', kind: 'change' })
  expect((await wornBy(ui, 'row-1')).dot).toBe(DOT.git)
  told.status = ''
  await clock.advance(21_000)
  await ui.input({ key: 'q', text: '', kind: 'change' })
  await clock.advance(GATHER)
  expect((await wornBy(ui, 'row-1')).dot).toBeUndefined()
  expect(asked.length).toBe(1)
  await ui.unmount()
})

test('writes a burst of calls as one mark of the tree, and settles them as one', async ($, on) => {
  const clock = mock.clock(on, { now: 900_000 })
  const written: string[] = []

  on('ui.panes', () => UP)
  on('tool.call', () => ({ result: {} }))
  on('state.set', { plugin: 'files' }, ($$, e, next) => {
    written.push(e.key)

    return next(e)
  })
  on('process.run', ($$, e) =>
    ran(e.argv[1] === 'ls-files' ? `${PATHS.join('\0')}\0` : e.argv[1] === 'rev-parse' ? (e.argv[2] === 'HEAD' ? 'aaa\n' : `${TOP}\n`) : ''),
  )

  const ui = await $.ui.mount({ plugin: 'files', surface: 'desktop', component: 'Pane', requestId: 'files', props: PANE })

  await ui.input({ key: 'q', text: '', kind: 'change' })
  written.length = 0

  // Twenty reads at once, as subagents make them: nothing is written until the burst is over.
  await Promise.all(
    Array.from({ length: 20 }, (_, at) => call($, { tool: 'Read', file_path: `${TOP}/${PATHS[at % PATHS.length] ?? ''}` })),
  )
  expect(written).toEqual([])
  await clock.advance(GATHER)
  // One write opens the folders, one marks the files: the tree is drawn for the burst, not for each call.
  expect(written).toEqual(['expanded', 'activity'])
  expect((await iconsOf(ui, /read by Claude just now/)).length).toBe(PATHS.length)

  // And all of them settle in one write.
  await clock.advance(LIVE_MS)
  expect(written).toEqual(['expanded', 'activity', 'activity'])
  expect((await iconsOf(ui, /read by Claude this session/)).length).toBe(PATHS.length)
  await clock.advance(60_000)
  expect(written.length).toBe(3)
  await ui.unmount()
})

test('turns green what Claude wrote and committed in one turn, and nothing a commit did not make clean', async ($, on) => {
  const clock = mock.clock(on, { now: 10_000_000 })
  const asked: (readonly string[])[] = []
  const told: Told = { status: '', head: 'k1', changed: [], isOnward: true, madeAt: 0 }

  on('ui.panes', () => UP)
  on('tool.call', () => ({ result: {} }))
  on('process.run', gitOf(told, asked))

  const ui = await $.ui.mount({ plugin: 'files', surface: 'desktop', component: 'Pane', requestId: 'files', props: PANE })
  const edit = async () => {
    await call($, { tool: 'Edit', file_path: `${TOP}/README.md`, old_string: 'a', new_string: 'b' })
    await clock.advance(GATHER)
  }
  // A commit as the branch going on from where it was, made now, unless told otherwise.
  const commit = async (to: Partial<Told>) => {
    Object.assign(told, { isOnward: true, madeAt: clock.now() }, to)
    await call($, { tool: 'Bash', command: 'git commit -am "work"' })
    await clock.advance(GATHER)
  }

  await ui.input({ key: 'q', text: '', kind: 'change' })
  expect(bare((await ui.find({ key: 'row-2' }))?.text)).toBe('README.md')

  // An edit of a file the list holds asks git nothing: the tree never saw the file as changed.
  await edit()
  expect((await wornBy(ui, 'row-2')).says).toBe('file, written by Claude just now')
  expect(await ui.find({ type: 'Text', text: 'M ' })).toBeUndefined()
  // Committed in the same turn, it is green all the same: what was written is known from the calls.
  await commit({ head: 'k2', changed: ['README.md'] })
  expect(asked).toEqual([['git', 'diff', '--name-only', '-z', 'k1', 'k2']])
  expect(await wornBy(ui, 'row-2')).toMatchObject({ ground: LIT.commit, says: 'file, committed just now' })

  // Written again, and a commit that did not change it: not green.
  await edit()
  await commit({ head: 'k3', changed: ['apps/anchor-ui/domain/session.ts'] })
  expect(asked.length).toBe(2)
  expect((await wornBy(ui, 'row-2')).says).toMatch(/written by Claude/)

  // The branch put back, or another one checked out: the file is clean, and nothing committed it.
  await commit({ head: 'k4', changed: ['README.md'], isOnward: false })
  expect(asked.length).toBe(2)
  expect((await wornBy(ui, 'row-2')).says).toMatch(/written by Claude/)

  // A commit made an hour ago, found only now, is no news.
  await commit({ head: 'k5', changed: ['README.md'], madeAt: clock.now() - 3_600_000 })
  expect(asked.length).toBe(2)
  expect((await wornBy(ui, 'row-2')).says).toMatch(/written by Claude/)

  // And one that did commit it, a moment ago.
  await commit({ head: 'k6', changed: ['README.md'], madeAt: clock.now() - 30_000 })
  expect(asked.at(-1)).toEqual(['git', 'diff', '--name-only', '-z', 'k5', 'k6'])
  expect((await wornBy(ui, 'row-2')).says).toBe('file, committed just now')
  await clock.advance(COMMIT_MS + SLACK_MS)
  await ui.unmount()
})

test('hands a tool call back as it was answered, and marks nothing for one that failed or was held', async ($, on) => {
  const clock = mock.clock(on, { now: 11_000_000 })
  const file = `${TOP}/README.md`
  let answer: Record<string, unknown> = {}

  on('ui.panes', () => UP)
  on('tool.call', () => answer as never)
  on('process.run', gitOf({ status: '', head: 'aaa', changed: [], isOnward: true, madeAt: 0 }, []))

  const ui = await $.ui.mount({ plugin: 'files', surface: 'desktop', component: 'Pane', requestId: 'files', props: PANE })

  await ui.input({ key: 'q', text: '', kind: 'change' })

  // What the engine answered is what the caller gets, the engine's own fields with it.
  answer = { result: { filePath: file, numLines: 3 }, ref: 7, text: 'Read 3 lines.', isReadOnly: true }
  expect(await call($, { tool: 'Read', file_path: file })).toEqual(answer)
  await clock.advance(GATHER)
  expect((await wornBy(ui, 'row-2')).says).toBe('file, read by Claude just now')
  await clock.advance(LIVE_MS)

  // A call that failed changed nothing on the disk: it is handed back as it is, and the file is not marked as written.
  answer = { isError: true, result: 'File has not been read yet.', text: 'File has not been read yet.' }
  expect(await call($, { tool: 'Edit', file_path: file, old_string: 'a', new_string: 'b' })).toEqual(answer)
  await clock.advance(GATHER)
  expect((await wornBy(ui, 'row-2')).says).toBe('file, read by Claude this session')

  // Nor has an edit that is held until it is approved.
  answer = { result: { filePath: file, staged: true }, ref: 8, text: 'Staged.' }
  expect(await call($, { tool: 'Edit', file_path: file, old_string: 'a', new_string: 'b' })).toEqual(answer)
  await clock.advance(GATHER)
  expect((await wornBy(ui, 'row-2')).says).toBe('file, read by Claude this session')

  // One that went through has.
  answer = { result: { filePath: file }, ref: 9, text: 'Edited.' }
  expect(await call($, { tool: 'Edit', file_path: file, old_string: 'a', new_string: 'b' })).toEqual(answer)
  await clock.advance(GATHER)
  expect((await wornBy(ui, 'row-2')).says).toBe('file, written by Claude just now')
  await clock.advance(LIVE_MS)
  await ui.unmount()
})

test('gives each new file its row when several are written while git is still being asked', async ($, on) => {
  const clock = mock.clock(on, { now: 12_000_000 })
  const files = [...PATHS]
  let slow = false

  on('ui.panes', () => UP)
  on('tool.call', () => ({ result: {} }))
  on('process.run', async ($$, e) => {
    // Git lists what is there when it is asked, and takes its time to answer.
    const listed = `${files.join('\0')}\0`

    if (slow && e.argv[1] === 'ls-files') {
      await clock.sleep(500)
    }

    return ran(e.argv[1] === 'ls-files' ? listed : e.argv[1] === 'rev-parse' ? (e.argv[2] === 'HEAD' ? 'aaa\n' : `${TOP}\n`) : '')
  })

  const ui = await $.ui.mount({ plugin: 'files', surface: 'desktop', component: 'Pane', requestId: 'files', props: PANE })

  await ui.input({ key: 'q', text: '', kind: 'change' })
  expect(await treeIn(ui)).toEqual(['▸ \u{1F5C0} apps', '▸ \u{1F5C0} docs', 'README.md'])
  slow = true

  // Three files, each written while the list is still being read for the one before.
  for (const name of ['ONE.md', 'TWO.md', 'THREE.md']) {
    files.push(`docs/${name}`)
    await call($, { tool: 'Write', file_path: `${TOP}/docs/${name}`, content: '# New' })
    await clock.advance(200)
  }

  await clock.advance(3000)
  expect(await treeIn(ui)).toEqual([
    '▸ \u{1F5C0} apps',
    '▾ \u{1F5C1} docs',
    'ARCHITECTURE_AND_DECISIONS.md',
    'ONE.md',
    'THREE.md',
    'TWO.md',
    'README.md',
  ])
  expect(await ui.find({ type: 'Text', text: '9 files' })).toBeDefined()
  expect((await iconsOf(ui, /written by Claude/)).length).toBe(3)
  slow = false
  await clock.advance(LIVE_MS)
  await ui.unmount()
})
