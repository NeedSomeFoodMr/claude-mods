import { expect, mock, test } from 'claude-code/testing'

import { playerFor, spoken } from '../hooks/register'

const turn = { answer: 'ok', isAborted: false, reason: 'answer', turnId: 't1' } as const

test('names the turn length and picks the platform player', () => {
  expect(spoken(42_400)).toBe('42s')
  expect(spoken(135_000)).toBe('2m 15s')
  expect(playerFor(true, 'done')[0]).toBe('powershell.exe')
  expect(playerFor(true, 'done').at(-1)).toMatch(/chimes\.wav/)
  expect(playerFor(false, 'waiting')).toEqual(['afplay', '/System/Library/Sounds/Ping.aiff'])
})

test('a long turn toasts and plays; a short one stays quiet', async ($, on) => {
  const toasts: string[] = []
  const played: string[] = []
  const clock = mock.clock(on)

  mock.env(on, { OS: 'Windows_NT' })
  on('turn.complete', () => ({ text: '' }))
  on('ui.toast', ($$, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('process.run', ($$, e) => {
    played.push(e.argv[0] ?? '')

    return {
      value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    }
  })

  await $.turn.complete({ ...turn, durationMs: 3000 })
  await clock.settle()
  expect(toasts).toEqual([])
  expect(played).toEqual([])

  await $.turn.complete({ ...turn, durationMs: 95_000 })
  await clock.settle()
  expect(toasts).toEqual(['Done in 1m 35s'])
  expect(played).toEqual(['powershell.exe'])
})

test('a subagent turn never chimes', async ($, on) => {
  const toasts: string[] = []

  mock.clock(on)
  on('turn.complete', () => ({ text: '' }))
  on('ui.toast', ($$, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })

  await $.turn.complete({ ...turn, durationMs: 95_000, agentId: 'a1' })
  expect(toasts).toEqual([])
})
