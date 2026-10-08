import { folderOf } from './find'

/** One error the type checker reports, by the file's path from the folder browsed. */
export type Problem = { path: string; line: number; column: number; code: string; message: string }

// `src/a.ts(12,5): error TS2322: Type 'x' is not assignable to type 'y'.`
const ROW = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/
// An error of the project itself, with no file to name: `error TS18003: No inputs were found…`
const LOOSE = /^error (TS\d+): (.*)$/
// The longest message kept: a type spelled out in one can run to pages.
const MESSAGE = 300
// How many errors a request to fix them names; the rest are counted.
const ASKED = 15

// A path the checker tells from the project's folder, told from the folder browsed.
const joined = (folder: string, path: string) => {
  const parts: string[] = []

  for (const part of `${folder}/${path.replace(/\\/g, '/')}`.split('/')) {
    if (part === '..') {
      parts.pop()
    } else if (part !== '' && part !== '.') {
      parts.push(part)
    }
  }

  return parts.join('/')
}

/**
 * The type checker's plain output as problems: the first `limit` of them, how
 * many there were in how many files, and what it said of the project itself.
 * The lines under an error that spell it out further are left out.
 */
export const problemsOf = (output: string, folder: string, limit: number) => {
  const problems: Problem[] = []
  const files = new Set<string>()
  const notes: string[] = []
  let total = 0

  for (const raw of output.split('\n')) {
    const row = raw.replace(/\r$/, '')
    const found = ROW.exec(row)

    if (found === null) {
      const loose = LOOSE.exec(row)

      if (loose !== null) {
        notes.push(`${loose[1] ?? ''}: ${loose[2] ?? ''}`)
      }

      continue
    }

    const path = joined(folder, found[1] ?? '')

    total++
    files.add(path)

    if (problems.length < limit) {
      problems.push({
        path,
        line: Number(found[2]),
        column: Number(found[3]),
        code: found[4] ?? '',
        message: (found[5] ?? '').slice(0, MESSAGE),
      })
    }
  }

  return { problems, total, files: files.size, notes }
}

/** The folders that hold a `tsconfig.json`, the nearest the top first: the projects that can be checked. */
export const projectsOf = (paths: readonly string[], limit: number) =>
  paths
    .filter(path => /(^|\/)tsconfig\.json$/.test(path))
    .map(folderOf)
    .sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))
    .slice(0, limit)

/** Where a project's own type checker may be installed: in its folder, or in one above it. */
export const tscPlaces = (folder: string) => {
  const parts = folder === '' ? [] : folder.split('/')

  return Array.from({ length: parts.length + 1 }, (_, up) => {
    const at = parts.slice(0, parts.length - up).join('/')

    return `${at === '' ? '' : `${at}/`}node_modules/typescript/bin/tsc`
  })
}

/**
 * The request put in the prompt: one error with its file mentioned, so the
 * model reads it, or several as a list of places, the rest counted.
 */
export const askOf = (problems: readonly Problem[], total: number) => {
  const [only] = problems

  if (only !== undefined && total === 1) {
    return `Fix this type error in @${only.path} at line ${only.line}: ${only.code}: ${only.message}`
  }

  const named = problems.slice(0, ASKED)
  const rest = total - named.length

  return [
    `Fix these ${total} type errors:`,
    ...named.map(one => `- ${one.path}:${one.line} ${one.code}: ${one.message}`),
    ...(rest > 0 ? [`- and ${rest} more: run the type checker again to see them`] : []),
  ].join('\n')
}

/**
 * The problems among what the session's state holds. The state outlives a
 * reload of the mod, so one may be of another shape: it is left out, not drawn.
 */
export const soundProblems = (list: readonly unknown[]): Problem[] =>
  list.filter((one): one is Problem => {
    const problem = one as Partial<Problem> | null

    return (
      typeof problem === 'object' &&
      problem !== null &&
      typeof problem.path === 'string' &&
      typeof problem.line === 'number' &&
      typeof problem.code === 'string' &&
      typeof problem.message === 'string'
    )
  })
