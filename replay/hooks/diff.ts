import type { Step } from '../types'

export type Hunk = {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: readonly string[]
}

const MAX_LINES = 240

const slashed = (path: string) => path.replace(/\\/g, '/')

/** The path as the repo names it: under the session's directory when it is there. */
export const relative = (path: string, root: string) => {
  const full = slashed(path)
  const base = slashed(root).replace(/\/$/, '')

  return base !== '' && full.toLowerCase().startsWith(`${base.toLowerCase()}/`) ? full.slice(base.length + 1) : full
}

/** One recorded edit from a file tool's own patch; nothing when the patch is empty. */
export const stepOf = (tool: string, file: string, hunks: readonly Hunk[]): Step | undefined => {
  if (hunks.length === 0) {
    return undefined
  }

  const body = hunks.flatMap(one => [
    `@@ -${one.oldStart},${one.oldLines} +${one.newStart},${one.newLines} @@`,
    ...one.lines,
  ])
  const added = body.filter(line => line.startsWith('+')).length
  const removed = body.filter(line => line.startsWith('-')).length
  const shown = body.slice(0, MAX_LINES)

  return {
    tool,
    file,
    diff: [`--- a/${file}`, `+++ b/${file}`, ...shown].join('\n'),
    added,
    removed,
  }
}

export const heading = (step: Step, at: number, of: number) =>
  `Edit ${at + 1} of ${of} · ${step.file} · +${step.added} −${step.removed}`
