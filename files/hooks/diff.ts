import { PAGE } from './find'

// A line of a diff wider than this is cut: a minified file would fill the page with one of them.
const WIDE = 400
// The room a hunk's lines have on a page, its own `@@` line left out.
const BODY = PAGE - 60

// Where a hunk starts, as git writes it: a side with no lines names the line above.
const sideOf = (start: number, count: number) => `${count === 0 ? Math.max(start - 1, 0) : start},${count}`

/**
 * A unified diff as pages the code element draws: the file header dropped, each
 * page whole hunks, a hunk too long for a page cut into hunks of its own with
 * their own line numbers, since a diff cut mid-hunk no longer parses.
 */
export const diffPagesOf = (diff: string) => {
  const hunks: string[] = []
  let body: string[] = []
  let size = 0
  let added = 0
  let removed = 0
  // The line each side is on, and where the hunk being gathered started.
  let oldAt = 0
  let newAt = 0
  let oldStart = 0
  let newStart = 0
  let oldCount = 0
  let newCount = 0
  let isInHunk = false

  const close = () => {
    if (body.length > 0) {
      hunks.push(`@@ -${sideOf(oldStart, oldCount)} +${sideOf(newStart, newCount)} @@\n${body.join('\n')}`)
    }

    body = []
    size = 0
    oldStart = oldAt
    newStart = newAt
    oldCount = 0
    newCount = 0
  }

  const rows = diff.split('\n')

  for (const [at, row] of rows.entries()) {
    // Git may write an empty line of context with no space before it; the last row is the output's own end.
    const raw = row === '' && at < rows.length - 1 ? ' ' : row
    const head = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(raw)

    if (head !== null) {
      close()
      // A side with no lines is written as the line above it: the next line is one on.
      oldAt = Number(head[1]) + (head[2] === '0' ? 1 : 0)
      newAt = Number(head[3]) + (head[4] === '0' ? 1 : 0)
      oldStart = oldAt
      newStart = newAt
      isInHunk = true
      continue
    }

    // `\ No newline at end of file` is a remark, not a line of either side.
    if (!isInHunk || raw.startsWith('\\')) {
      continue
    }

    const sign = raw[0]

    if (sign !== ' ' && sign !== '+' && sign !== '-') {
      close()
      isInHunk = false
      continue
    }

    const line = raw.length > WIDE ? `${raw.slice(0, WIDE - 1)}…` : raw

    if (body.length > 0 && size + line.length + 1 > BODY) {
      close()
    }

    body.push(line)
    size += line.length + 1

    if (sign !== '+') {
      oldAt++
      oldCount++
    }

    if (sign !== '-') {
      newAt++
      newCount++
    }

    added += sign === '+' ? 1 : 0
    removed += sign === '-' ? 1 : 0
  }

  close()

  const pages: string[] = []
  let page = ''

  for (const hunk of hunks) {
    if (page !== '' && page.length + hunk.length + 1 > PAGE) {
      pages.push(page)
      page = ''
    }

    page = page === '' ? hunk : `${page}\n${hunk}`
  }

  if (page !== '') {
    pages.push(page)
  }

  return { pages, added, removed }
}
