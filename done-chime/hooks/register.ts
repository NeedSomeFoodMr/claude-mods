import type { EngineInterface, Register } from 'claude-code'

// Turns shorter than this end silently: the person is still watching.
const MIN_SECONDS = 20
const WAITING = ['permission_prompt', 'elicitation_dialog']

const SOUNDS = {
  done: { windows: 'C:\\Windows\\Media\\chimes.wav', mac: '/System/Library/Sounds/Glass.aiff' },
  waiting: { windows: 'C:\\Windows\\Media\\Windows Notify.wav', mac: '/System/Library/Sounds/Ping.aiff' },
} as const

export const playerFor = (isWindows: boolean, sound: keyof typeof SOUNDS): string[] =>
  isWindows
    ? [
        'powershell.exe',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `(New-Object System.Media.SoundPlayer '${SOUNDS[sound].windows}').PlaySync()`,
      ]
    : ['afplay', SOUNDS[sound].mac]

export const spoken = (ms: number) => {
  const seconds = Math.round(ms / 1000)

  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

// `$.audio.play` has no player on Windows, so the sound is the system's own,
// played by a host command. A machine with neither player stays silent.
const chime = async ($: EngineInterface, sound: keyof typeof SOUNDS) => {
  try {
    const isWindows = (await $.env.get('OS')) === 'Windows_NT'
    await $.process.run(playerFor(isWindows, sound), { timeoutMs: 10_000 })
  } catch {
    // No player, or it could not start: the toast still showed.
  }
}

export const register: Register = on => {
  on('turn.complete', ($, e, next) => {
    const isOwnTurn = e.agentId === undefined && !e.isAborted

    if (isOwnTurn && e.durationMs >= MIN_SECONDS * 1000) {
      $.ui.toast(e.reason === 'answer' ? `Done in ${spoken(e.durationMs)}` : `Stopped after ${spoken(e.durationMs)}`)
      // On a timer, so the sound never holds the turn's end.
      $.clock.after(0, () => void chime($, 'done'))
    }

    return next(e)
  })

  on('classic.Notification', ($, e, next) => {
    if (WAITING.includes(e.notification_type)) {
      $.clock.after(0, () => void chime($, 'waiting'))
    }

    return next(e)
  })
}
