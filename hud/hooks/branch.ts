import type { Standing } from '../types'

/** `git status --porcelain=v2 --branch -z -uall`: the branch checked out, and how many files are changed or new. */
export const statusOf = (status: string) => {
  const parts = status.split('\0')
  let branch = ''
  let changed = 0

  for (let at = 0; at < parts.length; at++) {
    const part = parts[at] ?? ''

    if (part.startsWith('# branch.head ')) {
      // With a commit checked out and no branch, git says `(detached)`.
      branch = part.slice('# branch.head '.length).replace(/^\(detached\)$/, '')
    } else if (part.startsWith('2 ')) {
      // A rename is followed by the path it came from.
      changed++
      at++
    } else if (/^[1u?] /.test(part) && !part.endsWith('/')) {
      changed++
    }
  }

  return { branch, changed }
}

/** `git rev-list --left-right --count base...HEAD`: what the branch lacks first, then what it has over the base. */
export const aheadOf = (counted: string) => {
  const [behind, ahead] = counted.trim().split(/\s+/).map(Number)

  return { ahead: Number.isFinite(ahead) ? (ahead ?? 0) : 0, behind: Number.isFinite(behind) ? (behind ?? 0) : 0 }
}

/**
 * The branch work is merged to, as it is called: `origin/main` is `main`,
 * save on `main` itself, where the remote's copy is what it is told against.
 */
export const baseNameOf = (ref: string, branch: string) => (ref.replace(/^origin\//, '') === branch ? ref : ref.replace(/^origin\//, ''))

/** What stands beside the branch's name: `3 ahead of main, 1 behind · 2 changed`. */
export const besideOf = (one: Standing) => {
  const apart = [
    ...(one.ahead > 0 ? [`${one.ahead} ahead of ${one.base}`] : []),
    ...(one.behind > 0 ? [`${one.behind} behind${one.ahead > 0 ? '' : ` ${one.base}`}`] : []),
  ]
  const stands = one.base === '' || one.base === one.branch ? '' : apart.length === 0 ? `level with ${one.base}` : apart.join(', ')

  return [stands, one.changed > 0 ? `${one.changed} changed` : ''].filter(part => part !== '').join(' · ')
}

/** The branch as it is named to the person: a commit checked out with no branch is said so. */
export const nameOf = (one: Standing) => (one.branch === '' ? 'no branch' : one.branch)
