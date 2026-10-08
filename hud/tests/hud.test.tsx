import { expect, mock, test } from 'claude-code/testing'

import { aheadOf, baseNameOf, besideOf, nameOf, statusOf } from '../hooks/branch'
import { altOf, cardSvg, slices, standingAlt, standingSvg } from '../hooks/chart'
import type { Card } from '../hooks/chart'
import { compact, crossed, levelOf, resetsIn, share, shortLimit } from '../hooks/format'
import { portsOf } from '../hooks/probe'

const at = (percent: number) => ({ percent, tokens: percent * 10_000, window: 1_000_000 })

const FILLING = [
  { name: 'MCP tools', tokens: 16_000 },
  { name: 'Messages', tokens: 282_000 },
  { name: 'Custom agents', tokens: 3000 },
  { name: 'System tools', tokens: 32_000 },
  { name: 'MCP server instructions', tokens: 4000 },
]

const CARD: Card = {
  reading: { percent: 35, tokens: 352_000, window: 1_000_000 },
  categories: FILLING,
  compactAt: 750_000,
  usage: { limits: [{ kind: 'five_hour', percent: 23, resetsAt: '1970-01-01T00:42:00.000Z' }], usd: 7.94, at: 0 },
  dev: { ports: [3000], up: [] },
  isCompact: false,
  isLight: false,
}

const SUMMARY = { role: 'user' as const, text: 'What came before, in short.', toolUses: [] }

const BAND = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
} as const

test('formats tokens, shares, limits and resets', () => {
  expect(compact(352_000)).toBe('352k')
  expect(compact(1_000_000)).toBe('1.0M')
  expect(share(282_000, 1_000_000)).toBe('28%')
  expect(share(170, 1_000_000)).toBe('<1%')
  expect(shortLimit({ kind: 'five_hour', percent: 22.4 })).toBe('5h 22%')
  expect(resetsIn('1970-01-01T02:14:00.000Z', 0)).toBe('resets in 2h 14m')
  expect(crossed({ kind: 'five_hour', percent: 70 }, { kind: 'five_hour', percent: 97 })).toBe(95)
  expect(portsOf('{"configurations":[{"port":3000},{"port":3000},{"port":3108}]}')).toEqual([3000, 3108])
})

test('reads the branch, how far it is from main, and how many files are changed', () => {
  const status = [
    '# branch.oid 1a2b3c4',
    '# branch.head feature/checkout-flow',
    '# branch.upstream origin/feature/checkout-flow',
    '# branch.ab +0 -0',
    '1 .M N... 100644 100644 100644 5d6e7f8 5d6e7f8 apps/anchor-ui/next-env.d.ts',
    '2 R. N... 100644 100644 100644 1111111 2222222 R100 src/new.ts',
    '1 old name.ts',
    '? .claude/launch.json',
    '? .claude/worktrees/other/',
    '',
  ].join('\0')

  // A rename is one change, the path it came from no change of its own; a nested repository is none.
  expect(statusOf(status)).toEqual({ branch: 'feature/checkout-flow', changed: 3 })
  expect(statusOf('# branch.oid 1a2b3c4\0# branch.head (detached)\0')).toEqual({ branch: '', changed: 0 })
  expect(aheadOf('1\t80\n')).toEqual({ ahead: 80, behind: 1 })
  expect(aheadOf('')).toEqual({ ahead: 0, behind: 0 })
  expect(baseNameOf('origin/main', 'feature/x')).toBe('main')
  expect(baseNameOf('origin/main', 'main')).toBe('origin/main')
  expect(baseNameOf('master', 'feature/x')).toBe('master')

  const stands = { branch: 'feature/x', base: 'main', ahead: 3, behind: 1, changed: 2, isBase: false }

  expect(besideOf(stands)).toBe('3 ahead of main, 1 behind · 2 changed')
  expect(besideOf({ ...stands, ahead: 0, changed: 0 })).toBe('1 behind main')
  expect(besideOf({ ...stands, ahead: 0, behind: 0 })).toBe('level with main · 2 changed')
  expect(besideOf({ ...stands, branch: 'main', base: 'origin/main', ahead: 0, behind: 0, changed: 0, isBase: true })).toBe(
    'level with origin/main',
  )
  // No branch to tell it against: only what is changed is said.
  expect(besideOf({ ...stands, base: '', ahead: 0, behind: 0 })).toBe('2 changed')
  expect(nameOf(stands)).toBe('feature/x')
  expect(nameOf({ ...stands, branch: '' })).toBe('no branch')

  // The branch's line: the name, each thing said of it apart, and a rule above and below.
  const strip = standingSvg(stands, false)

  expect(strip).toContain('>feature/x</tspan>')
  expect(strip).toContain('>3 ahead of main, 1 behind</tspan>')
  expect(strip).toContain('>2 changed</tspan>')
  expect(strip.match(/height="1"/g)?.length).toBe(2)
  expect(standingAlt(stands)).toBe('Branch feature/x: 3 ahead of main, 1 behind · 2 changed.')
  expect(standingAlt({ ...stands, base: '', ahead: 0, behind: 0, changed: 0 })).toBe('Branch feature/x.')
  // On the branch work is merged to, the name is in the colour of a warning; a name too long is cut.
  expect(standingSvg({ ...stands, branch: 'main', isBase: true }, true)).toContain('fill="#895503" font-weight="700">main<')
  expect(standingSvg({ ...stands, branch: 'a<b' }, true)).toContain('>a&lt;b</tspan>')
  expect(standingSvg({ ...stands, branch: 'x'.repeat(60) }, true)).toContain(`>${'x'.repeat(43)}…</tspan>`)
})

test('rates the window against where compaction runs', () => {
  expect(levelOf(at(35), 750_000)).toBe('good')
  expect(levelOf(at(50), 750_000)).toBe('warning')
  expect(levelOf(at(62), 750_000)).toBe('serious')
  expect(levelOf(at(72), 750_000)).toBe('critical')
  expect(levelOf(at(62), null)).toBe('warning')
})

test('a category keeps its colour whatever its size, the unnamed fold into other', () => {
  const drawn = slices(FILLING)

  expect(drawn.map(one => one.name)).toEqual(['messages', 'system tools', 'mcp tools', 'other'])
  expect(drawn.map(one => one.color)).toEqual(['#3987e5', '#d95926', '#199e70', '#898781'])
  expect(drawn.at(-1)?.tokens).toBe(7000)
  expect(slices([{ name: 'MCP tools', tokens: 9 }])[0]?.color).toBe('#199e70')
})

test('draws the card: header, pill, bar, legend and the line beneath', () => {
  const svg = cardSvg(CARD)

  expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 720 \d+"/)
  expect(svg).toContain('>context</tspan>')
  expect(svg).toContain('>352k</tspan>')
  expect(svg).toContain('· compacts at 750k')
  expect(svg).toContain('fill="#0ca30c"')
  expect(svg).toContain('>35%</text>')
  expect(svg).toContain('>messages</tspan>')
  expect(svg).toContain('>free</tspan>')
  // A share under one percent prints `<1%`: escaped, or the drawing is not XML.
  expect(cardSvg({ ...CARD, categories: [...FILLING, { name: 'Memory files', tokens: 170 }] })).toContain('>&lt;1%</tspan>')
  expect(svg.replace(/<\/?[a-zA-Z][^<>]*>/g, '')).not.toMatch(/[<>]/)
  expect(svg).toContain('5-hour 23%')
  expect(svg).toContain('resets in 42m')
  expect(svg).toContain('$7.94')
  expect(svg).toContain('dev server down')
  expect(altOf(CARD)).toBe('Context 35% full: 352k of 1.0M tokens, most of it messages.')
})

test('the one-line form keeps the header and the bar, with the limits beside the pill', () => {
  const svg = cardSvg({ ...CARD, isCompact: true })

  expect(svg).toMatch(/viewBox="0 0 720 38"/)
  expect(svg).toContain('5h 23% · $7.94')
  expect(svg).not.toContain('>messages</tspan>')
  expect(cardSvg({ ...CARD, isLight: true })).toContain('fill="#0b0b0b"')
  expect(cardSvg({ ...CARD, dev: { ports: [3000], up: [3000] } })).toContain('localhost:3000')
})

test('the band is the card on the desktop and one line of text in a terminal', async ($, on) => {
  const toasts: string[] = []
  const asked: { argv: readonly string[]; cwd?: string; env?: Record<string, string> }[] = []

  const clock = mock.clock(on)

  on('session.start', ($$, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'hud' } }))
  on('command.list', () => ({
    value: [
      { name: 'agent-deck', description: 'Agents', source: 'plugin' as const },
      { name: 'compact', description: 'Compact', source: 'builtin' as const },
    ],
  }))
  on('config.list', () => ({ value: [] }))
  // What the session has cost: it rises while a turn is still running.
  let spentUsd = 7.94

  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: {
        tokens: 352_000,
        window: 1_000_000,
        percent: 35,
        breakdown: {
          categories: FILLING.map(one => ({ ...one, color: 'inactive', isDeferred: false, kind: 'used' as const })),
          totalTokens: 337_000,
          maxTokens: 1_000_000,
          rawMaxTokens: 1_000_000,
          autocompactSource: 'model-default',
          percentage: 34,
          gridRows: [],
          model: 'claude-opus-5-5',
          memoryFiles: [],
          mcpTools: [],
          agents: [],
          autoCompactThreshold: 750_000,
          isAutoCompactEnabled: true,
          apiUsage: null,
        },
      },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 23 },
        { kind: 'seven_day', percentUsed: 18 },
      ],
      cost: { usd: spentUsd },
    },
  }))
  on('session.compact', () => ({ messages: [SUMMARY], tokensBefore: 352_000, tokensAfter: 22_000 }))
  on('session.root', () => ({ value: '/repo' }))
  on('process.run', ($$, e) => {
    asked.push({ argv: e.argv, cwd: e.init?.cwd, env: e.init?.env })

    return {
      value: {
        exitCode: 0,
        stdout:
          e.argv[1] === 'status'
            ? ['# branch.head feature/x', '1 .M N... 100644 100644 100644 5d6e7f8 5d6e7f8 a.ts', ''].join('\0')
            : e.argv[1] === 'symbolic-ref'
              ? 'origin/main\n'
              : e.argv[1] === 'rev-list'
                ? '1\t3\n'
                : '',
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }
  })
  on('fs.read', () => ({ value: '{"configurations":[{"port":3000}]}' }))
  on('http.fetch', () => ({ value: { status: 200, ok: true, headers: {}, text: '' } }))
  on('ui.toast', ($$, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('ui.render', { component: 'AbovePrompt' }, ($$, e) => {
    const { Box } = $$.ui.resolve(e)

    return <Box />
  })

  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ plugin: 'hud', surface: 'desktop', component: 'AbovePrompt', props: BAND })

  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  expect((await ui.find({ key: 'size' }))?.text).toBe('Compact')
  expect(await ui.find({ key: 'agent-deck' })).toBeUndefined()
  // The companions are looked for once the session's commands are registered.
  await clock.advance(800)
  expect((await ui.find({ key: 'agent-deck' }))?.text).toBe('Agents')
  // The branch has a line of its own under the buttons: a second drawing beside the card.
  expect((await ui.findAll({ type: 'Svg' })).length).toBe(2)
  // Git is asked in the session's own folder, and told to take no lock.
  expect(asked[0]).toEqual({
    argv: ['git', 'status', '--porcelain=v2', '--branch', '-z', '-uall'],
    cwd: '/repo',
    env: { GIT_OPTIONAL_LOCKS: '0' },
  })
  expect(asked.at(-1)?.argv).toEqual(['git', 'rev-list', '--left-right', '--count', 'origin/main...HEAD'])
  expect(await ui.find({ key: 'replay' })).toBeUndefined()
  await ui.press({ key: 'agent-deck' })
  await ui.press({ key: 'size' })
  expect((await ui.find({ key: 'size' }))?.text).toBe('Expand')
  expect(toasts).toEqual([])
  await ui.unmount()
  // The cost is read again on the poll, not only at a turn's end.
  spentUsd = 9.1
  await clock.advance(20_000)

  const terminal = await $.ui.mount({ plugin: 'hud', surface: 'terminal', component: 'AbovePrompt', props: BAND })

  expect(
    await terminal.find({
      type: 'Text',
      text: /352k \/ 1\.0M · 5h 23% · wk 18% · \$9\.10 · dev :3000 · on feature\/x \(3 ahead of main, 1 behind · 1 changed\)/,
    }),
  ).toBeDefined()

  // A compaction redraws the card before any reply: the engine's figure is
  // still the old window, so the conversation is what the compaction left.
  await $.session.compact({ trigger: 'manual', messages: [SUMMARY] })
  await clock.advance(400)
  expect(await terminal.find({ type: 'Text', text: /77k \/ 1\.0M/ })).toBeDefined()
  expect(await terminal.find({ type: 'Text', text: '8%' })).toBeDefined()
  await terminal.unmount()
})

test('before any reply is measured, one line says the card is loaded', async ($, on) => {
  mock.clock(on)
  on('session.start', ($$, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'hud' } }))
  on('command.list', () => ({ value: [] }))
  on('config.list', () => ({ value: [] }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1_000_000 }, rateLimits: [] } }))
  on('fs.read', () => ({ value: '{}' }))
  on('http.fetch', () => {
    throw new Error('ECONNREFUSED')
  })
  on('ui.render', { component: 'AbovePrompt' }, ($$, e) => {
    const { Box } = $$.ui.resolve(e)

    return <Box />
  })

  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'hud', surface, component: 'AbovePrompt', props: BAND })

    expect(await ui.find({ type: 'Text', text: /appears after the first reply/ })).toBeDefined()
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    await ui.unmount()
  }
})
