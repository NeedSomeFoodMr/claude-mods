// What Claude does to the files as it works: the tools' calls read as paths,
// kept by their whole path, and told as the marks a row of the tree wears.

import type { Activity, Deed, Showing, Touch } from '../types'
import { foldersOf } from './find'

/** How long a read or a write is marked at full strength, and a commit, which is looked at later. */
export const LIVE_MS = 5000
export const COMMIT_MS = 20_000
/** Marks due to settle within this of one another settle in one drawing. */
export const SLACK_MS = 1000

/** One thing done to one path: as the tool was given it, or whole once it was read from where the session works. */
export type Seen = { deed: Deed; path: string }

// The tools that tell of a path, what each does to it, and the argument that names it.
const TOLD = new Map<string, { deed: 'read' | 'write'; key: string }>([
  ['Read', { deed: 'read', key: 'file_path' }],
  ['Grep', { deed: 'read', key: 'path' }],
  ['Glob', { deed: 'read', key: 'path' }],
  ['Edit', { deed: 'write', key: 'file_path' }],
  ['MultiEdit', { deed: 'write', key: 'file_path' }],
  ['Write', { deed: 'write', key: 'file_path' }],
  ['NotebookEdit', { deed: 'write', key: 'notebook_path' }],
])

/** True for a path told from the disk's root or a drive's. */
export const isRooted = (path: string) => /^(\/|[A-Za-z]:\/)/.test(path)

/**
 * What a tool's call does to which path, from its arguments; nothing for a
 * tool that names no file. A search is of a folder, or of the one file it
 * names: an empty path is where the session works.
 */
export const seenOf = (tool: string, input: Readonly<Record<string, unknown>>): Seen | undefined => {
  const told = TOLD.get(tool)

  if (told === undefined) {
    return undefined
  }

  const named = input[told.key]
  const path = typeof named === 'string' ? named.replace(/\\/g, '/') : ''

  if (tool === 'Glob') {
    // A pattern's leading folders are where it looks: `src/ui/**/*.ts` is a search of `src/ui`.
    const parts = (typeof input.pattern === 'string' ? input.pattern.replace(/\\/g, '/') : '').split('/')
    const wild = parts.findIndex(part => /[*?[\]{}]/.test(part))
    const lead = (wild < 0 ? parts : parts.slice(0, wild)).join('/')

    return { deed: 'read', path: isRooted(lead) || path === '' ? lead : lead === '' ? path : `${path.replace(/\/$/, '')}/${lead}` }
  }

  // A file's tool that names no file marks nothing.
  return path === '' && tool !== 'Grep' ? undefined : { deed: told.deed, path }
}

/** True for a command that may have moved the branch's last commit: git is worth asking again after it. */
export const movesHead = (command: string) => /\bgit\b[^\n;&|]*\b(commit|merge|rebase|cherry-pick|revert|pull|am)\b/.test(command)

/** A path as the disk has it: told from `cwd` where it is not whole, its `.` and `..` steps taken, no slash at its end. */
export const wholeOf = (path: string, cwd: string) => {
  const joined = isRooted(path) || cwd === '' ? path : path === '' ? cwd : `${cwd.replace(/\/$/, '')}/${path}`
  const head = /^([A-Za-z]:)?\//.exec(joined)?.[0] ?? ''
  const kept: string[] = []

  for (const part of joined.slice(head.length).split('/')) {
    if (part === '..') {
      kept.pop()
    } else if (part !== '' && part !== '.') {
      kept.push(part)
    }
  }

  return `${head}${kept.join('/')}`
}

/** Windows spells one path in either case: under a drive a path is looked up by its small letters. */
export const foldedBy = (base: string) => (/^[A-Za-z]:/.test(base) ? (path: string) => path.toLowerCase() : (path: string) => path)

/**
 * A whole path as the folder in view tells it: empty for the folder itself,
 * nothing where it lies outside. With no folder known, a path told from where
 * the session works is taken as it is.
 */
export const withinOf = (path: string, base: string) => {
  if (base === '') {
    return isRooted(path) ? undefined : path
  }

  const fold = foldedBy(base)
  const top = base.replace(/\/$/, '')

  if (fold(path) === fold(top) || fold(path) === fold(base)) {
    return ''
  }

  return fold(path).startsWith(`${fold(top)}/`) ? path.slice(top.length + 1) : undefined
}

const keyOf = (path: string) => foldedBy(path)(path)

/**
 * The activity with what was just seen written in at `now`: one touch for
 * each path, the latest first and no more than `limit`, its mark at full
 * strength from now. Marks that were due by now are settled in the same write.
 */
export const touchedBy = (held: Activity, seen: readonly Seen[], now: number, limit: number): Activity => {
  let touches = held.touches

  for (const one of seen) {
    const was = touches.find(touch => keyOf(touch.path) === keyOf(one.path))
    const next: Touch = {
      path: one.path,
      read: was?.read ?? 0,
      write: was?.write ?? 0,
      commit: was?.commit ?? 0,
      liveUntil: now + (one.deed === 'commit' ? COMMIT_MS : LIVE_MS),
    }

    next[one.deed] = now
    touches = [next, ...touches.filter(touch => touch !== was)]
  }

  // Marks are settled up to a moment past now and no further: a time beyond that is not kept.
  return { at: Math.max(Math.min(held.at, now + SLACK_MS), now), touches: touches.slice(0, limit) }
}

/**
 * The activity with the marks due by `now`, or within `SLACK_MS` of it, made
 * quiet; nothing where none is due. No mark is set to last longer than a
 * commit's: one due later than that was not written by this mod, and settles too.
 */
export const settledOf = (held: Activity, now: number): Activity | undefined => {
  const at = now + SLACK_MS
  const isLate = (touch: Touch) => touch.liveUntil > now + COMMIT_MS

  return held.touches.some(touch => touch.liveUntil > held.at && (touch.liveUntil <= at || isLate(touch)))
    ? { at, touches: held.touches.map(touch => (isLate(touch) ? { ...touch, liveUntil: at } : touch)) }
    : undefined
}

/** When the next mark at full strength is due to settle; nothing where all are quiet. */
export const dueOf = (held: Activity) => {
  let due: number | undefined

  for (const touch of held.touches) {
    if (touch.liveUntil > held.at && (due === undefined || touch.liveUntil < due)) {
      due = touch.liveUntil
    }
  }

  return due
}

const SHOWS: Record<Showing, readonly Deed[]> = {
  all: ['read', 'write', 'commit'],
  writes: ['write', 'commit'],
  reads: ['read', 'commit'],
  none: [],
}

/** The deeds a choice of what to show lets through; all of them for a choice the state holds in another shape. */
export const showsOf = (showing: Showing): readonly Deed[] => (Object.hasOwn(SHOWS, showing) ? SHOWS[showing] : SHOWS.all)

/** The mark a row wears: what was done, whether it is still new, and when. */
export type Light = { deed: Deed; isLive: boolean; at: number }

/** The stronger of two marks: one still new, then the later one. */
export const strongerOf = (a: Light | undefined, b: Light | undefined) =>
  a === undefined ? b : b === undefined ? a : a.isLive !== b.isLive ? (a.isLive ? a : b) : a.at >= b.at ? a : b

/**
 * The marks of the folder in view, by path as the tree spells it: `own` for
 * what was itself touched, `inside` for each folder that holds something
 * touched. A new mark is the latest deed; a quiet one is the commit or the
 * write that came last, and a read only where the path was never written.
 */
export const lightsOf = (held: Activity, base: string, showing: Showing) => {
  const own = new Map<string, Light>()
  const inside = new Map<string, Light>()
  const fold = foldedBy(base)
  const shows = showsOf(showing)

  for (const touch of held.touches) {
    const path = withinOf(touch.path, base)

    if (path === undefined || path === '') {
      continue
    }

    const read = shows.includes('read') ? touch.read : 0
    const write = shows.includes('write') ? touch.write : 0
    const commit = shows.includes('commit') ? touch.commit : 0
    const at = Math.max(read, write, commit)

    if (at === 0) {
      continue
    }

    // A deed that is not shown leaves the path its quiet mark, however new it is.
    const isLive = touch.liveUntil > held.at && at === Math.max(touch.read, touch.write, touch.commit)
    const latest = commit === at ? 'commit' : write === at ? 'write' : 'read'
    const light: Light = { deed: isLive ? latest : commit > 0 && commit >= write ? 'commit' : write > 0 ? 'write' : 'read', isLive, at }

    own.set(fold(path), light)

    for (const folder of foldersOf(path)) {
      inside.set(fold(folder), strongerOf(inside.get(fold(folder)), light) ?? light)
    }
  }

  return { own, inside }
}

/**
 * The activity among what the session's state holds. The state outlives a
 * reload of the mod, so it may have been written by an older one in another
 * shape: what does not fit is left out.
 */
export const soundActivity = (held: unknown): Activity => {
  const kept = held as Partial<Activity> | null
  // A time is a count of milliseconds a date can hold: not a fraction of nothing, not past the last day there is.
  const isTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 8.64e15

  if (typeof kept !== 'object' || kept === null || !isTime(kept.at) || !Array.isArray(kept.touches)) {
    return { at: 0, touches: [] }
  }

  return {
    at: kept.at,
    touches: kept.touches.filter((one: unknown): one is Touch => {
      const touch = one as Partial<Touch> | null

      return (
        typeof touch === 'object' &&
        touch !== null &&
        typeof touch.path === 'string' &&
        isTime(touch.read) &&
        isTime(touch.write) &&
        isTime(touch.commit) &&
        isTime(touch.liveUntil)
      )
    }),
  }
}
