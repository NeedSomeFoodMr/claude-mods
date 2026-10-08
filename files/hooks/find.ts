/** The most a page holds: the code element draws 10000 characters and no more. */
export const PAGE = 9000

const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1)

export const folderOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')

/** `button.tsx  ·  components/ui`: the name first, since that is what the eye looks for. */
export const labelOf = (path: string) => {
  const folder = folderOf(path)

  return folder === '' ? nameOf(path) : `${nameOf(path)}  ·  ${folder}`
}

const hasInOrder = (text: string, letters: string) => {
  let at = 0

  for (const letter of letters) {
    at = text.indexOf(letter, at) + 1

    if (at === 0) {
      return false
    }
  }

  return true
}

// How well one word fits a path: the name's start, the name, the path, then
// the word's letters in order; 0 where it fits nowhere.
const fitOf = (path: string, name: string, word: string) => {
  if (name.startsWith(word)) {
    return 100
  }

  if (name.includes(word)) {
    return 60
  }

  if (path.includes(word)) {
    return 30
  }

  return hasInOrder(name, word) ? 10 : hasInOrder(path, word) ? 4 : 0
}

/** The paths every word of the search fits, the best first; shorter paths win a tie. */
export const rank = (paths: readonly string[], query: string, limit: number) => {
  const words = query.toLowerCase().split(/\s+/).filter(word => word !== '')

  if (words.length === 0) {
    return { hits: [], total: 0 }
  }

  const scored: { path: string; score: number }[] = []

  for (const path of paths) {
    const lower = path.toLowerCase()
    const name = nameOf(lower)
    let score = 0

    for (const word of words) {
      const fit = fitOf(lower, name, word)

      if (fit === 0) {
        score = 0
        break
      }

      score += fit
    }

    if (score > 0) {
      scored.push({ path, score: score - path.length * 0.05 })
    }
  }

  scored.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))

  return { hits: scored.slice(0, limit).map(one => one.path), total: scored.length }
}

/** Text the code element will draw: tab and newline are the only control characters it takes. */
export const clean = (text: string) => text.replace(/\r/g, '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')

// A line longer than a page is cut, not left to refuse the whole drawing.
const fitted = (raw: string) => (raw.length > PAGE ? `${raw.slice(0, PAGE - 1)}…` : raw)

/** The page of a file that starts on line `from` (1-based): whole lines, as many as the code element draws. */
export const windowOf = (lines: readonly string[], from: number) => {
  const startLine = Math.min(Math.max(from, 1), Math.max(lines.length, 1))
  const held: string[] = []
  let size = 0

  for (let at = startLine - 1; at < lines.length; at++) {
    const line = fitted(lines[at] ?? '')

    if (held.length > 0 && size + line.length + 1 > PAGE) {
      break
    }

    held.push(line)
    size += line.length + 1
  }

  return { startLine, endLine: startLine + Math.max(held.length, 1) - 1, text: held.join('\n') }
}

/** The line a page starts on when it is to end just above `startLine`. */
export const beforeOf = (lines: readonly string[], startLine: number) => {
  let from = Math.max(startLine - 1, 1)
  let size = 0

  for (let line = startLine - 1; line >= 1; line--) {
    const length = fitted(lines[line - 1] ?? '').length + 1

    if (line < startLine - 1 && size + length > PAGE) {
      break
    }

    size += length
    from = line
  }

  return from
}

/** What git says of a path: `M` for one it tracks and that changed, `U` for one it does not track yet. */
export type Mark = 'M' | 'U'

// `git status --porcelain -z` as its rows: the two status letters and the path, a rename by its new name.
const rowsOf = (porcelain: string) => {
  const out: { code: string; path: string }[] = []
  const parts = porcelain.split('\0')

  for (let at = 0; at < parts.length; at++) {
    const part = parts[at] ?? ''

    if (part.length < 4) {
      continue
    }

    // A rename or copy is followed by the path it came from.
    if (/[RC]/.test(part.slice(0, 2))) {
      at++
    }

    if (!part.endsWith('/')) {
      out.push({ code: part.slice(0, 2), path: part.slice(3) })
    }
  }

  return out
}

const isDeleted = (code: string) => code.startsWith('D') || code[1] === 'D'

/** Git's status by path, for the tree: changed and new files, the deleted left out since the tree has no row for them. */
export const statusOf = (porcelain: string) => {
  const out = new Map<string, Mark>()

  for (const row of rowsOf(porcelain)) {
    if (!isDeleted(row.code)) {
      out.set(row.path, row.code === '??' ? 'U' : 'M')
    }
  }

  return out
}

/**
 * One file git reports as changed (`M`), not tracked yet (`U`), deleted (`D`) or, against another
 * commit, added since it (`A`), with the lines added and removed where git counted them.
 */
export type Change = { path: string; mark: Mark | 'D' | 'A'; added?: number; removed?: number }

/** `git diff --numstat -z` by path; a binary file has no lines to count and is left out. */
export const countsOf = (numstat: string) => {
  const out = new Map<string, { added: number; removed: number }>()
  const parts = numstat.split('\0')

  for (let at = 0; at < parts.length; at++) {
    const [added, removed, path] = (parts[at] ?? '').split('\t')

    if (added === undefined || removed === undefined || path === undefined) {
      continue
    }

    // A rename has no path on its row: the old one and the new one follow it.
    const name = path === '' ? (parts[at + 2] ?? '') : path

    if (path === '') {
      at += 2
    }

    if (/^\d+$/.test(added) && /^\d+$/.test(removed) && name !== '') {
      out.set(name, { added: Number(added), removed: Number(removed) })
    }
  }

  return out
}

/** Every change git reports, in git's order, the deleted included. */
export const changesOf = (porcelain: string, numstat: string): Change[] => {
  const counts = countsOf(numstat)

  return rowsOf(porcelain).map(row => ({
    path: row.path,
    mark: isDeleted(row.code) ? 'D' : row.code === '??' ? 'U' : 'M',
    ...counts.get(row.path),
  }))
}

/**
 * What differs from another commit, from `git diff --name-status -z` and its
 * `--numstat -z`: a rename by its new name, as a change. The files git does
 * not track yet are no part of that diff and are added from `untracked`.
 */
export const namedOf = (nameStatus: string, numstat: string, untracked: readonly Change[]): Change[] => {
  const counts = countsOf(numstat)
  const out: Change[] = []
  const parts = nameStatus.split('\0')

  for (let at = 0; at < parts.length; at++) {
    const code = parts[at] ?? ''

    if (code === '') {
      continue
    }

    // A rename or copy names the path it came from, then the path it has now.
    const path = parts[at + (/^[RC]/.test(code) ? 2 : 1)] ?? ''

    at += /^[RC]/.test(code) ? 2 : 1

    if (path !== '' && !path.endsWith('/')) {
      out.push({ path, mark: code.startsWith('A') ? 'A' : code.startsWith('D') ? 'D' : 'M', ...counts.get(path) })
    }
  }

  return [...out, ...untracked.filter(one => one.mark === 'U' && !out.some(held => held.path === one.path))]
}

/** `3 ahead of main, 1 behind`, from `git rev-list --left-right --count base...HEAD`: behind first, then ahead. */
export const aheadOf = (counted: string) => {
  const [behind, ahead] = counted.trim().split(/\s+/).map(Number)

  return { ahead: Number.isFinite(ahead) ? (ahead ?? 0) : 0, behind: Number.isFinite(behind) ? (behind ?? 0) : 0 }
}

/** Where a branch stands by another: `on feature · 3 ahead of main, 1 behind`. */
export const standingOf = (branch: string, base: string, ahead: number, behind: number) => {
  const head = branch === '' || branch === 'HEAD' ? 'on no branch (a commit is checked out)' : `on ${branch}`

  if (base === '' || base === branch) {
    return head
  }

  const parts = [...(ahead > 0 ? [`${ahead} ahead of ${base}`] : []), ...(behind > 0 ? [`${behind} behind${ahead > 0 ? '' : ` ${base}`}`] : [])]

  return `${head} · ${parts.length === 0 ? `level with ${base}` : parts.join(', ')}`
}

// How much of a line is kept on either side of the text found in it.
const BEFORE = 60
const AFTER = 160

/**
 * A line cut around the text looked for: what stands before it, the text as
 * the line spells it, and what follows; runs of blanks are one space, and a
 * cut end is marked. A line that does not hold the text is all `match`.
 */
export const excerptOf = (line: string, needle: string) => {
  const text = clean(line).replace(/\s+/g, ' ').trim()
  // Capitals make the search exact, as they did when git was asked.
  const at = /[A-Z]/.test(needle) ? text.indexOf(needle) : text.toLowerCase().indexOf(needle.toLowerCase())

  if (needle === '' || at < 0) {
    return { before: '', match: text.slice(0, AFTER), after: '' }
  }

  const end = at + needle.length
  const from = Math.max(0, at - BEFORE)

  return {
    before: `${from > 0 ? '…' : ''}${text.slice(from, at)}`,
    match: text.slice(at, end),
    after: `${text.slice(end, end + AFTER)}${text.length > end + AFTER ? '…' : ''}`,
  }
}

/** One line of a file that holds the text searched for, cut around that text. */
export type Hit = { path: string; line: number; before: string; match: string; after: string }

/** `git grep -n --null` as hits: the first `limit` of them, and how many there were in how many files. */
export const hitsOf = (stdout: string, limit: number, needle: string) => {
  const hits: Hit[] = []
  const files = new Set<string>()
  let total = 0

  for (const row of stdout.split('\n')) {
    const [path, line, ...rest] = row.split('\0')

    if (path === undefined || path === '' || line === undefined || !/^\d+$/.test(line)) {
      continue
    }

    total++
    files.add(path)

    if (hits.length < limit) {
      hits.push({ path, line: Number(line), ...excerptOf(rest.join(' '), needle) })
    }
  }

  return { hits, total, files: files.size }
}

/**
 * The hits among what the session's state holds. The state outlives a reload
 * of the mod, so a line may have been written by an older one in another
 * shape: drawing it would fail, and it is left out.
 */
export const soundHits = (list: readonly unknown[]): Hit[] =>
  list.filter((one): one is Hit => {
    const hit = one as Partial<Hit> | null

    return (
      typeof hit === 'object' &&
      hit !== null &&
      typeof hit.path === 'string' &&
      typeof hit.line === 'number' &&
      typeof hit.before === 'string' &&
      typeof hit.match === 'string' &&
      typeof hit.after === 'string'
    )
  })

/**
 * An excerpt fitted to a row of `letters`: the text found is kept whole, what
 * stands before it gives way first, from its far end.
 */
export const fittedTo = (hit: { before: string; match: string; after: string }, letters: number) => {
  const match = hit.match.length > letters ? `${hit.match.slice(0, Math.max(letters - 1, 1))}…` : hit.match
  const left = Math.max(letters - match.length, 0)
  const lead = Math.min(hit.before.length, left, Math.max(Math.floor(letters * 0.35), left - hit.after.length))
  const before = hit.before.length > lead ? (lead < 2 ? '' : `…${hit.before.slice(hit.before.length - lead + 1)}`) : hit.before
  const room = Math.max(left - before.length, 0)
  const after = hit.after.length > room ? (room < 2 ? '' : `${hit.after.slice(0, room - 1)}…`) : hit.after

  return { before, match, after }
}

/** Every folder a path sits in, the nearest last: `a/b/c.ts` gives `a` and `a/b`. */
export const foldersOf = (path: string) => {
  const parts = path.split('/').slice(0, -1)

  return parts.map((_, at) => parts.slice(0, at + 1).join('/'))
}

export const sizeOf = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`

export type TreeRow = { kind: 'dir' | 'file'; path: string; name: string; depth: number; isOpen: boolean }

/**
 * The files as an explorer draws them: the root's folders and files, and under
 * each opened folder its own, folders first; `more` counts the rows past `limit`.
 */
export const treeOf = (paths: readonly string[], expanded: readonly string[], limit: number) => {
  const open = new Set(expanded)
  const folders = new Map<string, Set<string>>()
  const files = new Map<string, string[]>()

  // One pass: a path is placed under each folder on its way that is in view.
  for (const path of paths) {
    const parts = path.split('/')
    let parent = ''

    for (let at = 0; at < parts.length; at++) {
      const here = parent === '' ? (parts[at] ?? '') : `${parent}/${parts[at] ?? ''}`

      if (at === parts.length - 1) {
        files.set(parent, [...(files.get(parent) ?? []), path])
        break
      }

      folders.set(parent, (folders.get(parent) ?? new Set()).add(here))

      if (!open.has(here)) {
        break
      }

      parent = here
    }
  }

  const rows: TreeRow[] = []
  const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1)
  const byName = (a: string, b: string) => nameOf(a).localeCompare(nameOf(b))

  const walk = (folder: string, depth: number) => {
    for (const path of [...(folders.get(folder) ?? [])].sort(byName)) {
      rows.push({ kind: 'dir', path, name: nameOf(path), depth, isOpen: open.has(path) })

      if (open.has(path)) {
        walk(path, depth + 1)
      }
    }

    for (const path of [...(files.get(folder) ?? [])].sort(byName)) {
      rows.push({ kind: 'file', path, name: nameOf(path), depth, isOpen: false })
    }
  }

  walk('', 0)

  return { rows: rows.slice(0, limit), more: Math.max(0, rows.length - limit) }
}
