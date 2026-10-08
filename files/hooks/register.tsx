import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Found, Tab, View } from '../types'
import {
  COMMIT_MS,
  SLACK_MS,
  dueOf,
  foldedBy,
  isRooted,
  lightsOf,
  movesHead,
  seenOf,
  settledOf,
  showsOf,
  soundActivity,
  strongerOf,
  touchedBy,
  wholeOf,
  withinOf,
} from './activity'
import type { Seen } from './activity'
import { diffPagesOf } from './diff'
import {
  aheadOf,
  beforeOf,
  changesOf,
  clean,
  fittedTo,
  folderOf,
  foldersOf,
  hitsOf,
  namedOf,
  rank,
  sizeOf,
  soundHits,
  standingOf,
  statusOf,
  treeOf,
  windowOf,
} from './find'
import type { Change, Mark } from './find'
import { ROW, edgeOf, indentOf, reachOf, restOf, ruleOf, widthOf } from './icons'
import { askOf, problemsOf, projectsOf, soundProblems, tscPlaces } from './problems'
import type { Problem } from './problems'

const PANE = 'files'
const SHOWN = 14
const LISTED = 8
// The most rows the tree draws: past it, searching is quicker than scrolling.
const TREE = 80
// The most lines a search inside the files lists, and the fewest letters it runs on.
const FOUND = 60
const NEEDLE = 2
// The most changed files listed, and the most folders offered to open.
const CHANGES = 60
const FOLDERS = 16
// How many folders beside the session's are asked whether they are repositories.
const NEAR = 150
const KEPT = 12
// A cell of the desktop's pane is this many CSS pixels: 90 cells measured 709 across.
const CELL_PX = 7.88
const LETTER_PX = 6.4
// A file's list is read again when it is this old, so a new file turns up.
const STALE_MS = 20_000
// How long a search inside the files may take before it is given up.
const GREP_MS = 10_000
const MAX_BYTES = 1_500_000
// The folders a walk never enters, where git cannot say what to leave out.
const SKIPPED = ['.git', 'node_modules', '.next', 'dist', 'build', 'coverage', '.turbo', '.venv', '__pycache__']
const WALK_FILES = 5000
const WALK_FOLDERS = 600
// The row under the pointer, and git's marks, in the editor's own colours.
const HOVER = { dark: '#2b2a28', light: '#eceae3' }
// A folder closed and open, as glyphs a button's label can hold (U+1F5C0, U+1F5C1).
const FOLDER = { closed: '\u{1F5C0}', open: '\u{1F5C1}' }
const MARKS = {
  dark: { M: '#e2c08d', U: '#73c991', A: '#73c991', D: '#c74e39' },
  light: { M: '#895503', U: '#587c0c', A: '#587c0c', D: '#ad0707' },
}
// Claude's own marks: a read or a search, a write, and a commit that made a
// changed file clean. Each has its ink while it is new, a quiet ink for the
// rest of the session, and the ground its row is lit with while it is new.
const DEEDS = {
  dark: {
    read: { live: '#b794f6', quiet: '#75619f', ground: '#2a2539' },
    write: { live: '#ff9e4a', quiet: '#a2683a', ground: '#34291f' },
    commit: { live: '#5fd38a', quiet: '#3f7d55', ground: '#213125' },
  },
  light: {
    read: { live: '#7c3aed', quiet: '#a08ad2', ground: '#ece6fa' },
    write: { live: '#d9601a', quiet: '#d2915f', ground: '#fae9d9' },
    commit: { live: '#1a7f37', quiet: '#6aa87a', ground: '#dff1e2' },
  },
}
// What a mark says to a reader that cannot see it.
const SAID = { read: 'read by Claude', write: 'written by Claude', commit: 'committed' }
// The most paths the activity keeps, and how long a burst of calls is gathered into one write.
const TOUCHES = 200
const GATHER_MS = 120
// A commit older than this when git is next asked is not marked: it was made
// while nobody looked, and is no news now.
const COMMIT_NEWS_MS = 300_000
const TABS: readonly (readonly [Tab, string])[] = [
  ['explorer', 'EXPLORER'],
  ['search', 'SEARCH'],
  ['changes', 'CHANGES'],
  ['problems', 'PROBLEMS'],
]
// The cells of a choice inside a tab, and the rule under it.
const CHOICE_CELLS = 22
const CHOICE_PX = 140
// The most errors kept and listed, the most projects offered, and how long the type checker may run.
const PROBLEMS = 100
const PROJECTS = 4
const CHECK_MS = 180_000
// A tab is this many cells wide whatever it says, so none moves when another is
// pressed; the rule under it is drawn this many CSS pixels across.
const TAB_CELLS = 12
const RULE_PX = 72
// The cells a line number is set flush right in.
const NUMBER_CELLS = 6
// A space at the end of a label that a trim leaves alone: on the desktop a
// no-break space with a mark of no width outside it, in a terminal a blank cell.
const EDGE = {
  desktop: { before: '\u00A0\u200B', after: '\u200B\u00A0' },
  terminal: { before: '\u2800', after: '\u2800' },
}

const tab = atom({ plugin: 'files', key: 'tab' } as const, 'explorer')
const query = atom({ plugin: 'files', key: 'query' } as const, '')
const seed = atom({ plugin: 'files', key: 'seed' } as const, '')
const hits = atom({ plugin: 'files', key: 'hits' } as const, [])
const total = atom({ plugin: 'files', key: 'total' } as const, 0)
const indexed = atom({ plugin: 'files', key: 'indexed' } as const, -1)
const recent = atom({ plugin: 'files', key: 'recent' } as const, [])
const view = atom({ plugin: 'files', key: 'view' } as const, null)
const expanded = atom({ plugin: 'files', key: 'expanded' } as const, [])
const scanned = atom({ plugin: 'files', key: 'scanned' } as const, 0)
const root = atom({ plugin: 'files', key: 'root' } as const, '')
const isLight = atom({ plugin: 'files', key: 'isLight' } as const, false)
const needle = atom({ plugin: 'files', key: 'needle' } as const, '')
const needleSeed = atom({ plugin: 'files', key: 'needleSeed' } as const, '')
const finds = atom({ plugin: 'files', key: 'finds' } as const, [])
const findTotal = atom({ plugin: 'files', key: 'findTotal' } as const, 0)
const findFiles = atom({ plugin: 'files', key: 'findFiles' } as const, 0)
const repo = atom({ plugin: 'files', key: 'repo' } as const, '')
const home = atom({ plugin: 'files', key: 'home' } as const, '')
const repos = atom({ plugin: 'files', key: 'repos' } as const, [])
const isPicking = atom({ plugin: 'files', key: 'isPicking' } as const, false)
const repoFilter = atom({ plugin: 'files', key: 'repoFilter' } as const, '')
const repoNote = atom({ plugin: 'files', key: 'repoNote' } as const, '')
const against = atom({ plugin: 'files', key: 'against' } as const, 'head')
const problems = atom({ plugin: 'files', key: 'problems' } as const, [])
const problemTotal = atom({ plugin: 'files', key: 'problemTotal' } as const, 0)
const problemFiles = atom({ plugin: 'files', key: 'problemFiles' } as const, 0)
const checking = atom({ plugin: 'files', key: 'checking' } as const, 'idle')
const problemProject = atom({ plugin: 'files', key: 'problemProject' } as const, '')
const problemNote = atom({ plugin: 'files', key: 'problemNote' } as const, '')
const isProblemsStale = atom({ plugin: 'files', key: 'isProblemsStale' } as const, false)
const activity = atom({ plugin: 'files', key: 'activity' } as const, { at: 0, touches: [] })
const isFollowing = atom({ plugin: 'files', key: 'isFollowing' } as const, true)
// Which activity the rows are marked with: 'all', 'writes', 'reads' or 'none'. Nothing writes it yet.
const showing = atom({ plugin: 'files', key: 'showing' } as const, 'all')

// The index and the open file are the module's own: too large for the
// session's state, and rebuilt from the disk in a moment after a reload.
let index: string[] = []
let indexedAt = 0
let hasScanned = false
let isGit = false
// What git says changed, by file, and the folders those files sit in.
let marks = new Map<string, Mark>()
let touched = new Set<string>()
let changes: Change[] = []
// Where the branch stands by the one it left: read while the changes are in view.
// `baseRef` is what git is asked about (`origin/main`), `baseName` what it is called (`main`),
// `mergeBase` the commit the two last shared: what "against main" is told from.
let compared = { branch: '', baseRef: '', baseName: '', mergeBase: '', ahead: 0, behind: 0, list: [] as Change[] }
const UNCOMPARED = compared
// The branch a repository's work is merged to, asked once for each folder.
let baseFor: { folder: string; ref: string } | undefined
// True while the type checker runs: the state alone would say so for ever after a reload.
let isChecking = false
let scanning: Promise<void> | undefined
// Counts the folders the pane has been turned to: a scan started for one is not written over the next.
let era = 0
// The folder every path here is told from, absolute: the top of the repository
// being browsed, or the folder itself where git is not there. Empty where the
// session's own folder is no repository, and paths are told from where it works.
let base = ''
// The last commit of the folder that was read, as git names it: a changed
// file that is clean once it has moved was committed.
let headWas = { base: '', sha: '' }
// What the tools were seen to do and git to commit, not yet written: a burst
// is one write, made when `gatherDue` comes.
let unsaid: Seen[] = []
let gatherDue = 0
// The one wait kept for the next mark at full strength to settle.
let settling: { due: number; timer: Timer } | undefined
// The list's files and folders by the spelling a lookup uses, for the list they were read from.
let seats: { of: string[]; files: Set<string>; folders: Map<string, string> } | undefined
// New files git was asked about once already: one it ignores is not asked about again.
const awaited = new Set<string>()
let held: { base: string; path: string; lines: string[]; bytes: number } | undefined
let heldDiff: { base: string; path: string; versus: string; pages: string[]; added: number; removed: number } | undefined

// A path with one kind of slash and none at its end, a drive's or the disk's root left whole.
const slashed = (path: string) => {
  const one = path.replace(/\\/g, '/')

  return /^([A-Za-z]:)?\/+$/.test(one) ? one.replace(/\/+$/, '/') : one.replace(/\/+$/, '')
}
// Windows spells one folder in either case; elsewhere the case tells two apart.
const isSame = (a: string, b: string) => (/^[A-Za-z]:/.test(a) ? a.toLowerCase() === b.toLowerCase() : a === b)
const lastOf = (path: string) => path.slice(path.lastIndexOf('/') + 1)
// A file of the folder being browsed, as the disk is asked for it.
const under = (folder: string, path: string) => (folder === '' ? path : `${folder.replace(/\/$/, '')}/${path}`)

// Git only reads here: it takes no lock on the index, so a commit made while
// the pane asks is not refused, and a path is a name, never a pattern.
const GIT_ENV = { GIT_OPTIONAL_LOCKS: '0', GIT_LITERAL_PATHSPECS: '1' }

// Git, run in a folder: the session's own where none is named.
const run = ($: EngineInterface, folder: string, args: string[], timeoutMs?: number) =>
  $.process
    .run(['git', ...args], {
      env: GIT_ENV,
      ...(folder === '' ? {} : { cwd: folder }),
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
    })
    .catch(() => undefined)

const topOf = async ($: EngineInterface, folder: string) => {
  const asked = await run($, folder, ['rev-parse', '--show-toplevel'])

  return asked?.exitCode === 0 ? slashed(asked.stdout.trim()) : ''
}

// The branch work is merged to: the remote's default, or a local `main` or `master`. Empty where there is none.
const baseOf = async ($: EngineInterface, folder: string) => {
  if (baseFor?.folder === folder) {
    return baseFor.ref
  }

  const remote = await run($, folder, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'])
  let ref = remote?.exitCode === 0 ? remote.stdout.trim() : ''

  for (const name of ['main', 'master']) {
    if (ref === '') {
      const local = await run($, folder, ['rev-parse', '--verify', '--quiet', `refs/heads/${name}`])

      ref = local?.exitCode === 0 && local.stdout.trim() !== '' ? name : ''
    }
  }

  // Kept only when there is one: a repository with no commit yet has none, and gets one.
  baseFor = ref === '' ? undefined : { folder, ref }

  return ref
}

// Where the branch stands by the one it left, and with `isListed` every file
// that differs from the commit the two last shared, committed or not.
const compare = async ($: EngineInterface, folder: string, isListed: boolean, uncommitted: readonly Change[]) => {
  const head = await run($, folder, ['rev-parse', '--abbrev-ref', 'HEAD'])
  const branch = head?.exitCode === 0 ? head.stdout.trim() : ''
  const baseRef = await baseOf($, folder)

  if (baseRef === '') {
    return { ...UNCOMPARED, branch }
  }

  const shared = await run($, folder, ['merge-base', 'HEAD', baseRef])
  const mergeBase = shared?.exitCode === 0 ? shared.stdout.trim() : ''
  const counted = await run($, folder, ['rev-list', '--left-right', '--count', `${baseRef}...HEAD`])
  let list: Change[] = []

  if (isListed && mergeBase !== '') {
    const named = await run($, folder, ['diff', mergeBase, '--name-status', '-z'])
    const numbered = await run($, folder, ['diff', mergeBase, '--numstat', '-z'])

    list = namedOf(named?.exitCode === 0 ? named.stdout : '', numbered?.exitCode === 0 ? numbered.stdout : '', uncommitted)
  }

  return {
    branch,
    baseRef,
    // On the branch itself the remote's copy is what it is told against, and is called by its whole name.
    baseName: baseRef.replace(/^origin\//, '') === branch ? baseRef : baseRef.replace(/^origin\//, ''),
    mergeBase,
    ...aheadOf(counted?.exitCode === 0 ? counted.stdout : ''),
    list,
  }
}

// The session's own folder: its project root, which a command's `cd` does not
// move, so a turn that ends in another folder does not turn the pane there.
const sessionRoot = async ($: EngineInterface) => slashed(await $.session.root().catch(() => ''))

// The folder the session's own files are told from: its repository's top, or the root itself.
const sessionTop = async ($: EngineInterface) => {
  const here = await sessionRoot($)

  return (await topOf($, here)) || here
}

// Where git is not there to list the files: the folders, breadth first, to a bound.
const walk = async ($: EngineInterface, where: string) => {
  const found: string[] = []
  const queue = ['']
  let folders = 0

  while (queue.length > 0 && found.length < WALK_FILES && folders < WALK_FOLDERS) {
    const folder = queue.shift() ?? ''
    const entries = await $.fs.list(folder === '' ? (where === '' ? '.' : where) : under(where, folder)).catch(() => [])
    folders++

    for (const entry of entries) {
      const path = folder === '' ? entry.name : `${folder}/${entry.name}`

      if (entry.kind === 'file') {
        found.push(path)
      } else if (entry.kind === 'dir' && !SKIPPED.includes(entry.name)) {
        queue.push(path)
      }
    }
  }

  return found
}

// What was listed, typed and opened belongs to one folder: none of it is
// carried to another, and what is still being read for the one left is dropped.
const forget = async ($: EngineInterface) => {
  era++
  held = undefined
  heldDiff = undefined

  await update($, view, () => null)
  await update($, query, () => '')
  await update($, seed, () => '')
  await update($, hits, () => [])
  await update($, total, () => 0)
  await update($, needle, () => '')
  await update($, needleSeed, () => '')
  await update($, finds, () => [])
  await update($, findTotal, () => 0)
  await update($, findFiles, () => 0)
  await update($, expanded, () => [])
  await update($, recent, () => [])
  await update($, problems, () => [])
  await update($, problemTotal, () => 0)
  await update($, problemFiles, () => 0)
  await update($, checking, () => 'idle')
  await update($, problemProject, () => '')
  await update($, problemNote, () => '')
  await update($, isProblemsStale, () => false)
}

// The list's files, and its folders as the tree spells them, by the spelling a
// lookup uses: built once for each list read.
const seatsOf = () => {
  if (seats?.of !== index) {
    const fold = foldedBy(base)
    const folders = new Map<string, string>()

    for (const path of index) {
      for (const folder of foldersOf(path)) {
        folders.set(fold(folder), folder)
      }
    }

    seats = { of: index, files: new Set(index.map(fold)), folders }
  }

  return seats
}

// The marks at full strength that are due are made quiet in one write, and one
// wait is kept for the next that will be: marks settle a few at a time, not each by itself.
const calm = async ($: EngineInterface) => {
  const now = await $.clock.now()

  if (settledOf(soundActivity(await read($, activity)), now) !== undefined) {
    await update($, activity, kept => settledOf(soundActivity(kept), now) ?? kept)
  }

  const due = dueOf(soundActivity(await read($, activity)))

  // A wait kept for a time still to come, and no later than this one, stands.
  if (due === undefined || (settling !== undefined && settling.due > now && settling.due <= due)) {
    return
  }

  settling?.timer.cancel()
  settling = {
    due,
    // No mark lasts longer than a commit's: a wait is never asked for beyond that.
    timer: $.clock.after(Math.min(Math.max(due - now, 50), COMMIT_MS + SLACK_MS), () => {
      settling = undefined
      void calm($).catch(() => {})
    }),
  }
}

// What was seen since the last write, written as one: the marks, and with the
// pane up and the tree following, the closed folders over what was touched.
// Only the tree's folders are opened: the tab, an open file and a search stay as they are.
const record = async ($: EngineInterface) => {
  const seen = unsaid

  unsaid = []
  gatherDue = 0

  if (seen.length === 0) {
    return
  }

  // While the list is being read again it is not known what it holds: that
  // reading is let finish, and one or two that follow it, before the list is asked.
  for (let tries = 0; tries < 3 && scanning !== undefined; tries++) {
    await scanning.catch(() => {})
  }

  const now = await $.clock.now()
  const isUp = hasScanned && (await $.ui.panes().catch(() => [])).some(one => one.id === PANE)
  const shows = showsOf(await read($, showing))
  const known = seatsOf()
  const fold = foldedBy(base)
  const opens: string[] = []
  let hasNew = false

  for (const one of isUp ? seen : []) {
    const path = withinOf(one.path, base)

    if (path === undefined || path === '' || one.deed === 'commit') {
      continue
    }

    // A file written that the list does not hold is new: git is asked for the list again, once.
    if (one.deed === 'write' && !known.files.has(fold(path)) && !awaited.has(fold(one.path))) {
      awaited.add(fold(one.path))
      hasNew = true
    }

    if (shows.includes(one.deed)) {
      for (const folder of foldersOf(path)) {
        // A folder the list does not hold is opened only for a write: the file is about to be in it.
        const seat = known.folders.get(fold(folder)) ?? (one.deed === 'write' ? folder : undefined)

        if (seat !== undefined && !opens.includes(seat)) {
          opens.push(seat)
        }
      }
    }
  }

  if (opens.length > 0 && (await read($, isFollowing)) !== false) {
    const open = await read($, expanded)

    if (opens.some(folder => !open.includes(folder))) {
      await update($, expanded, list => [...list, ...opens.filter(folder => !list.includes(folder))])
    }
  }

  await update($, activity, kept => touchedBy(soundActivity(kept), seen, now, TOUCHES))
  await calm($)

  if (hasNew) {
    void rescan($).catch(() => {})
  }
}

// Something seen, by its whole path, kept for the next write: twenty calls in
// a burst are one write and one drawing. The wait is told by its time, so one
// that was lost is asked for again.
const gather = async ($: EngineInterface, seen: readonly Seen[]) => {
  unsaid.push(...seen)

  const now = await $.clock.now()

  if (gatherDue > now && gatherDue <= now + GATHER_MS) {
    return
  }

  gatherDue = now + GATHER_MS
  $.clock.after(GATHER_MS, () => void record($).catch(() => {}))
}

// A call's path as the disk has it: one told from where the session works is read from there.
const witness = async ($: EngineInterface, seen: Seen) => {
  const cwd = isRooted(seen.path) ? '' : slashed(await $.session.cwd().catch(() => ''))

  await gather($, [{ deed: seen.deed, path: wholeOf(seen.path, cwd) }])
}

// The files a commit made clean, of those that are clean now and were changed
// or written before, as git spells them. The branch must have gone on from the
// commit it was at, since a reset or another branch checked out also leaves
// files clean; the commit must be news; and it must have changed the file.
const committedIn = async ($: EngineInterface, folder: string, was: string, head: string, cleaned: ReadonlySet<string>, now: number) => {
  if (cleaned.size === 0) {
    return []
  }

  const onward = await run($, folder, ['merge-base', '--is-ancestor', was, head])

  if (onward?.exitCode !== 0) {
    return []
  }

  const dated = await run($, folder, ['log', '-1', '--format=%ct', head])
  const madeAt = dated?.exitCode === 0 && /^\d+$/.test(dated.stdout.trim()) ? Number(dated.stdout.trim()) * 1000 : undefined

  if (madeAt === undefined || now - madeAt > COMMIT_NEWS_MS) {
    return []
  }

  const differing = await run($, folder, ['diff', '--name-only', '-z', was, head])
  const fold = foldedBy(folder)

  return differing?.exitCode === 0 ? differing.stdout.split('\0').filter(path => path !== '' && cleaned.has(fold(path))) : []
}

// Git knows the files and what it ignores, and answers in milliseconds. It is
// asked from the repository's top, since it tells a status from there wherever
// it is run, and the list, the changes and a diff must name a file one way.
const scan = async ($: EngineInterface) => {
  const mine = era
  const where = await read($, repo)
  const own = await sessionTop($)
  const from = where === '' ? own : (await topOf($, where)) || where
  const listed = await run($, from, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
  let files: string[]
  let porcelain = ''
  let numstat = ''
  let head = ''
  const hasGit = listed !== undefined && listed.exitCode === 0

  if (hasGit) {
    // A repository nested in this one is listed as a folder, not a file: it has no row.
    files = listed.stdout.split('\0').filter(path => path !== '' && !path.endsWith('/'))

    // Each new file by its own path, not by the folder it is in.
    const status = await run($, from, ['status', '--porcelain', '-z', '-uall'])
    const counted = await run($, from, ['diff', 'HEAD', '--numstat', '-z'])
    const headed = await run($, from, ['rev-parse', 'HEAD'])

    porcelain = status?.exitCode === 0 ? status.stdout : ''
    numstat = counted?.exitCode === 0 ? counted.stdout : ''
    head = headed?.exitCode === 0 ? headed.stdout.trim() : ''
  } else {
    files = await walk($, from)
  }

  // The changes show where the branch stands, and a diff told against the other
  // branch needs the commit the two last shared: git is asked for both while
  // the changes are in view or that choice is made.
  const isAgainstBase = (await read($, against)) === 'base'
  const standing =
    hasGit && (isAgainstBase || (await read($, tab)) === 'changes')
      ? await compare($, from, isAgainstBase, changesOf(porcelain, numstat))
      : undefined

  const now = await $.clock.now()

  // A commit since the list was last read: a file that is clean now, and was
  // changed then or written by Claude since, was committed if the commit
  // changed it. An edit of a file the list holds asks git nothing, so what was
  // written is taken from the activity, the calls not yet written in it too.
  const current = statusOf(porcelain)
  const fold = foldedBy(from)
  const dirty = new Set([...current.keys()].map(fold))
  const cleaned = new Set<string>()

  if (head !== '' && headWas.sha !== '' && headWas.sha !== head && isSame(headWas.base, from)) {
    const written = [
      ...soundActivity(await read($, activity))
        .touches.filter(touch => touch.write > touch.commit)
        .map(touch => touch.path),
      ...unsaid.filter(one => one.deed === 'write').map(one => one.path),
    ].map(path => withinOf(path, from))

    for (const path of [...marks.keys(), ...written]) {
      if (path !== undefined && path !== '' && !dirty.has(fold(path))) {
        cleaned.add(fold(path))
      }
    }
  }

  const committed = await committedIn($, from, headWas.sha, head, cleaned, now)

  // The pane was turned to another folder while this one was read: its answer is dropped.
  if (mine !== era) {
    return
  }

  // The session's own folder is another one than was read last: the session moved.
  const hasMoved = where === '' && base !== '' && from !== '' && !isSame(base, from)
  // The session has moved into the folder the pane was turned to: it is the session's own now.
  const isHome = where !== '' && isSame(from, own)

  // One step, with nothing awaited in it: a folder switch lands before it or after it, never inside.
  base = from
  isGit = hasGit
  index = files
  marks = current
  headWas = { base: from, sha: head }
  changes = changesOf(porcelain, numstat)
  touched = new Set([...marks.keys()].flatMap(foldersOf))
  // What was read of another folder's branch is not kept for this one.
  compared = hasGit ? (standing ?? (hasMoved ? UNCOMPARED : compared)) : UNCOMPARED
  indexedAt = now
  hasScanned = true

  if (committed.length > 0) {
    void gather(
      $,
      committed.map(path => ({ deed: 'commit' as const, path: under(from, path) })),
    ).catch(() => {})
  }

  if (hasMoved) {
    await forget($)
  }

  if (isHome) {
    await update($, repo, () => '')
    await update($, repoNote, () => '')
  }

  const name = lastOf(from)

  if ((await read($, root)) !== name) {
    await update($, root, () => name)
  }

  if ((await read($, indexed)) !== index.length) {
    await update($, indexed, () => index.length)
  }

  // The tree is drawn from the module's own list: this write is what redraws it.
  await update($, scanned, count => count + 1)
}

const fresh = async ($: EngineInterface) => {
  // A scan that was dropped leaves the list unread: it is read again for the folder now open.
  for (let tries = 0; tries < 3 && (!hasScanned || (await $.clock.now()) - indexedAt > STALE_MS); tries++) {
    scanning ??= scan($).finally(() => {
      scanning = undefined
    })
    await scanning
  }
}

// The list read again now, whatever its age: git's answer after an edit.
const rescan = async ($: EngineInterface) => {
  // A scan already running read the tab and the choices as they were before
  // the press that asks for this one: it is let finish, and another is run.
  if (scanning !== undefined) {
    await scanning.catch(() => {})
  }

  hasScanned = false
  await fresh($)
}

// Git asked again in the middle of a turn, with the pane up: a commit shows when it is made, not at the turn's end.
const relist = async ($: EngineInterface) => {
  // A list being read again was read once: the pane has one.
  if ((hasScanned || scanning !== undefined) && (await $.ui.panes().catch(() => [])).some(one => one.id === PANE)) {
    await rescan($)
  }
}

// The folder paths are told from is known once the list was read: after a
// reload it is read first. Its age is no matter here, since the folder does not go stale.
const ready = async ($: EngineInterface) => {
  if (!hasScanned) {
    await fresh($)
  }
}

const search = async ($: EngineInterface, text: string) => {
  await update($, query, () => text)
  await fresh($)

  // A search overtaken by the next keystroke writes nothing.
  if ((await read($, query)) !== text) {
    return
  }

  const found = rank(index, text, SHOWN)

  await update($, hits, () => found.hits)
  await update($, total, () => found.total)
}

// The text looked for inside the files: git reads them faster than a walk could,
// and outside a repository it still reads the folder. Capitals make it exact.
// A search git does not finish in time is told as -1 lines found.
const grep = async ($: EngineInterface, text: string) => {
  await update($, needle, () => text)

  const asked = text.trim()
  let found: ReturnType<typeof hitsOf> = { hits: [], total: 0, files: 0 }

  if (asked.length >= NEEDLE) {
    await fresh($)

    const out = await run(
      $,
      base,
      [
        'grep',
        '-n',
        '-I',
        '--null',
        '--no-color',
        '-F',
        ...(/[A-Z]/.test(asked) ? [] : ['-i']),
        ...(isGit ? ['--untracked'] : ['--no-index', '--exclude-standard']),
        '-e',
        asked,
      ],
      GREP_MS,
    )

    found = out === undefined ? { ...found, total: -1 } : out.exitCode === 0 ? hitsOf(out.stdout, FOUND, asked) : found
  }

  // A search overtaken by the next keystroke writes nothing.
  if ((await read($, needle)) !== text) {
    return
  }

  await update($, finds, () => found.hits)
  await update($, findTotal, () => found.total)
  await update($, findFiles, () => found.files)
}

const BLANK_VIEW = { mode: 'file', startLine: 1, endLine: 1, lines: 0, bytes: 0, page: 0, pages: 1, added: 0, removed: 0, text: '' } as const

const fileView = (path: string, from: number): View | undefined => {
  if (held === undefined || held.base !== base || held.path !== path) {
    return undefined
  }

  return { ...BLANK_VIEW, path, lines: held.lines.length, bytes: held.bytes, ...windowOf(held.lines, from) }
}

const diffView = (path: string, page: number): View | undefined => {
  if (heldDiff === undefined || heldDiff.base !== base || heldDiff.path !== path) {
    return undefined
  }

  const at = Math.min(Math.max(page, 0), heldDiff.pages.length - 1)

  return {
    ...BLANK_VIEW,
    path,
    mode: 'diff',
    page: at,
    pages: heldDiff.pages.length,
    added: heldDiff.added,
    removed: heldDiff.removed,
    text: heldDiff.pages[at] ?? '',
    ...(heldDiff.versus === '' ? {} : { versus: heldDiff.versus }),
  }
}

// The file read from the disk as it is now, from one of its lines on; a note where it is not drawn.
const loadFile = async ($: EngineInterface, path: string, from: number): Promise<View> => {
  await ready($)

  const blank = { ...BLANK_VIEW, path }
  const stat = await $.fs.stat(under(base, path)).catch(() => undefined)

  if (stat === undefined || stat.kind !== 'file') {
    return { ...blank, note: 'This file cannot be read: it may have been moved or deleted.' }
  }

  if (stat.size > MAX_BYTES) {
    return { ...blank, bytes: stat.size, note: `Too large to show here (${sizeOf(stat.size)}).` }
  }

  const raw = await $.fs.read(under(base, path)).catch(() => undefined)

  if (raw === undefined) {
    return { ...blank, bytes: stat.size, note: 'This file cannot be read.' }
  }

  if (raw.includes('\0')) {
    return { ...blank, bytes: stat.size, note: `A binary file (${sizeOf(stat.size)}): nothing to read as text.` }
  }

  const lines = clean(raw).split('\n')

  // A file that ends with a line end has no line after it.
  if (lines.length > 1 && lines.at(-1) === '') {
    lines.pop()
  }

  held = { base, path, lines, bytes: stat.size }

  return fileView(path, from) ?? blank
}

// What changed in the file, as git tells it: since the last commit, or since
// the branch left the one it is told against. Nothing where git has no diff of it.
const loadDiff = async ($: EngineInterface, path: string, page: number): Promise<View | undefined> => {
  await ready($)

  const isBase = (await read($, against)) === 'base' && compared.mergeBase !== ''
  const out = await run($, base, ['diff', isBase ? compared.mergeBase : 'HEAD', '--no-color', '--no-ext-diff', '-U3', '--', path])
  const cut = out?.exitCode === 0 ? diffPagesOf(clean(out.stdout)) : undefined

  if (cut === undefined || cut.pages.length === 0) {
    return undefined
  }

  heldDiff = { base, path, versus: isBase ? compared.baseName : '', ...cut }

  return diffView(path, page)
}

const noted = ($: EngineInterface, path: string) =>
  update($, recent, list => [path, ...list.filter(one => one !== path)].slice(0, LISTED))

// A file opened to read; from a search hit, a few lines above the line it is on.
// What was read for a folder the pane has since left is not shown.
const show = async ($: EngineInterface, path: string, line?: number, extra: { hint?: string; problem?: Problem } = {}) => {
  const mine = era
  const shown = await loadFile($, path, line === undefined ? 1 : Math.max(1, line - 3))

  if (mine !== era) {
    return
  }

  await update($, view, () => ({
    ...shown,
    ...(line === undefined ? {} : { at: line }),
    ...(extra.hint === undefined ? {} : { hint: extra.hint }),
    ...(extra.problem === undefined ? {} : { problem: extra.problem }),
  }))
  await noted($, path)
}

// A changed file opened as its diff. A new file has none and is opened whole;
// so is one git lists with no line changed in it, with a word why.
const showDiff = async ($: EngineInterface, path: string) => {
  const mine = era
  const shown = await loadDiff($, path, 0)

  if (mine !== era) {
    return
  }

  if (shown === undefined) {
    const isNew = changes.some(one => one.path === path && one.mark === 'U')

    await show(
      $,
      path,
      undefined,
      isNew ? {} : { hint: 'Git has no changed lines to show for this file: here it is whole.' },
    )

    return
  }

  await update($, view, () => shown)
  await noted($, path)
}

// Another page of what is open; after a reload it is read again. At either end there is no further page.
const turn = async ($: EngineInterface, by: number) => {
  const shown = await read($, view)

  if (shown === null) {
    return
  }

  if (shown.mode === 'diff') {
    const next = diffView(shown.path, shown.page + by) ?? (await loadDiff($, shown.path, shown.page + by))

    if (next !== undefined) {
      await update($, view, () => next)
    }

    return
  }

  if (by > 0 ? shown.endLine >= shown.lines : shown.startLine <= 1) {
    return
  }

  if (fileView(shown.path, 1) === undefined) {
    await loadFile($, shown.path, 1)
  }

  const from = by > 0 ? shown.endLine + 1 : beforeOf(held?.lines ?? [], shown.startLine)
  const next = fileView(shown.path, from)

  if (next !== undefined) {
    await update($, view, () => next)
  }
}

// What is open read again where it stands: a turn may have edited it, so an
// error it was opened at is no longer said over it. A diff
// that is no more, the change undone, gives way to the file; a file grown
// shorter than where the page stood is shown at its last page.
const reopen = async ($: EngineInterface) => {
  const shown = await read($, view)

  if (shown === null) {
    return
  }

  const mine = era
  const diff = shown.mode === 'diff' ? await loadDiff($, shown.path, shown.page) : undefined
  let again = diff ?? (await loadFile($, shown.path, shown.startLine))

  if (again.mode === 'file' && again.note === undefined) {
    if (again.startLine < shown.startLine && held !== undefined) {
      again = fileView(shown.path, beforeOf(held.lines, held.lines.length + 1)) ?? again
    }

    again = {
      ...again,
      ...(shown.mode === 'file' && shown.at !== undefined ? { at: shown.at } : {}),
      ...(shown.mode === 'file' && shown.hint !== undefined ? { hint: shown.hint } : {}),
    }
  }

  const now = await read($, view)
  const next = again

  // Written only over the very page that was read again: a press made meanwhile stands.
  if (
    mine === era &&
    now !== null &&
    now.path === shown.path &&
    now.mode === shown.mode &&
    now.startLine === shown.startLine &&
    now.page === shown.page
  ) {
    await update($, view, () => next)
  }
}

// A file as the prompt or another program is to be told of it: by its path
// from where the session works when that is the folder shown, else in full.
const spell = async ($: EngineInterface, path: string) => {
  await ready($)

  if (base === '') {
    return path
  }

  const isHere = (await read($, repo)) === '' && isSame(slashed(await $.session.cwd().catch(() => '')), base)

  return isHere ? path : under(base, path)
}

// The path goes into the box as a mention and is never sent: the model reads
// the file only once the person sends the prompt.
const mention = async ($: EngineInterface, path: string) => {
  const spelled = await spell($, path)
  const { text: draft } = await $.prompt.read()
  const gap = draft === '' || /\s$/.test(draft) ? '' : ' '

  await $.prompt.fill({ text: `${draft}${gap}@${spelled} `, mode: 'replace' })
}

const copyPath = async ($: EngineInterface, path: string, surface: Parameters<EngineInterface['ui']['copy']>[0]['surface']) =>
  $.ui.copy({ text: await spell($, path), surface })

// The changes told against the last commit, or against the branch this one left.
const tellAgainst = async ($: EngineInterface, to: 'head' | 'base') => {
  heldDiff = undefined
  await update($, against, () => to)
  await rescan($)
}

// The project's own type checker, run on a press and never by itself, with
// its output, its build record and a composite project's own record all
// turned off, so it leaves no file behind.
const check = async ($: EngineInterface, folder: string) => {
  const mine = era
  // What is written of a run belongs to the folder it was started in.
  const fail = async (note: string) => {
    if (mine === era) {
      await update($, problemNote, () => note)
      await update($, checking, () => 'failed')
    }
  }

  if (isChecking) {
    // One run at a time: the one for the folder left is still finishing.
    if ((await read($, checking)) !== 'running') {
      await fail('The type checker is still finishing for the folder you left: try again in a moment.')
    }

    return
  }

  isChecking = true

  try {
    await ready($)
    await update($, problemProject, () => folder)
    await update($, problemNote, () => '')
    await update($, checking, () => 'running')

    let tsc = ''

    for (const place of tscPlaces(folder)) {
      if (tsc === '' && (await $.fs.exists(under(base, place)).catch(() => false))) {
        tsc = under(base, place)
      }
    }

    if (tsc === '') {
      await fail('TypeScript is not installed for this project: run its install, then try again.')

      return
    }

    const at = folder === '' ? base : under(base, folder)
    const out = await $.process
      .run(['node', tsc, '--noEmit', '--composite', 'false', '--incremental', 'false', '--pretty', 'false', '-p', at === '' ? '.' : at], {
        ...(at === '' ? {} : { cwd: at }),
        timeoutMs: CHECK_MS,
      })
      .catch(() => undefined)

    // The pane was turned to another folder meanwhile: these errors are of the one left.
    if (mine !== era) {
      return
    }

    if (out === undefined) {
      await fail('The type checker did not finish: it is given three minutes, and needs node to run.')

      return
    }

    const found = problemsOf(`${out.stdout}\n${out.stderr}`, folder, PROBLEMS)

    if (found.total === 0 && out.exitCode !== 0) {
      const said = found.notes[0] ?? clean(`${out.stderr}\n${out.stdout}`).trim().split('\n')[0] ?? ''

      await fail(said === '' ? 'The type checker stopped without saying why.' : said.slice(0, 300))

      return
    }

    await update($, problems, () => found.problems)
    await update($, problemTotal, () => found.total)
    await update($, problemFiles, () => found.files)
    await update($, isProblemsStale, () => false)
    await update($, checking, () => 'done')
  } catch {
    await fail('The type checker could not be run here.').catch(() => {})
  } finally {
    isChecking = false
  }
}

// A request to fix what the type checker found, put in the prompt after what
// is there and never sent: the person reads it, changes it, and sends it.
const askFix = async ($: EngineInterface, list: readonly Problem[], total: number) => {
  const named: Problem[] = []

  for (const one of list.slice(0, 15)) {
    named.push({ ...one, path: await spell($, one.path) })
  }

  const { text: draft } = await $.prompt.read()
  const gap = draft === '' || draft.endsWith('\n') ? '' : '\n'

  await $.prompt.fill({ text: `${draft}${gap}${askOf(named, total)}`, mode: 'replace' })
}

// A press on a folder of the tree: it opens, or closes when it is open.
const flip = ($: EngineInterface, folder: string) =>
  update($, expanded, list => (list.includes(folder) ? list.filter(one => one !== folder) : [...list, folder]))

const first = async ($: EngineInterface, text: string) => {
  await search($, text)

  const top = (await read($, hits))[0]

  if (top !== undefined) {
    await show($, top)
  }
}

// Enter in the search inside the files opens the first line found.
const firstFound = async ($: EngineInterface, text: string) => {
  await grep($, text)

  const top = (await read($, finds))[0]

  if (top !== undefined) {
    await show($, top.path, top.line)
  }
}

// Another tab: its field is drawn with what was last typed in it, and the
// changes are asked of git again, since an edit may have come since.
const switchTab = async ($: EngineInterface, to: Tab) => {
  await update($, seed, () => '')
  await update($, needleSeed, () => '')

  const typed = await read($, query)
  const sought = await read($, needle)

  await update($, seed, () => typed)
  await update($, needleSeed, () => sought)
  await update($, tab, () => to)

  if (to === 'changes') {
    await rescan($)
  }
}

const homeDir = async ($: EngineInterface) => slashed((await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? '')

// The folders opened before, kept in a file of the person's own so another session has them.
const recall = async ($: EngineInterface) => {
  const person = await homeDir($)

  if (person === '') {
    return []
  }

  try {
    const kept: unknown = JSON.parse(await $.fs.read(`${person}/.claude/files-folders.json`))

    return Array.isArray(kept) ? kept.filter((one): one is string => typeof one === 'string').slice(0, KEPT) : []
  } catch {
    return []
  }
}

const remember = async ($: EngineInterface, path: string) => {
  const person = await homeDir($)

  if (person === '') {
    return
  }

  const kept = [path, ...(await recall($)).filter(one => !isSame(one, path))].slice(0, KEPT)

  await $.fs.write(`${person}/.claude/files-folders.json`, `${JSON.stringify(kept, null, 2)}\n`).catch(() => {})
}

const foldersIn = async ($: EngineInterface, folder: string) =>
  (await $.fs.list(folder).catch(() => []))
    .filter(entry => entry.kind === 'dir' && !entry.name.startsWith('.') && !SKIPPED.includes(entry.name))
    .map(entry => `${folder}/${entry.name}`)

// What can be opened: the session's folder, those opened before, and the
// repositories that sit beside it or one folder over.
const discover = async ($: EngineInterface) => {
  const here = await sessionRoot($)
  const parent = folderOf(here)
  const near: string[] = []

  if (parent.includes('/')) {
    const grand = folderOf(parent)
    const beside = await foldersIn($, parent)
    const over = grand.includes('/')
      ? (await Promise.all((await foldersIn($, grand)).filter(one => !isSame(one, parent)).slice(0, KEPT).map(one => foldersIn($, one)))).flat()
      : []
    const asked = [...beside, ...over].slice(0, NEAR)
    const answers = await Promise.all(asked.map(folder => $.fs.exists(`${folder}/.git`).catch(() => false)))

    near.push(...asked.filter((_, at) => answers[at] === true))
  }

  const all: string[] = []

  for (const path of [here, ...(await recall($)), ...near]) {
    if (path !== '' && !all.some(one => isSame(one, path))) {
      all.push(path)
    }
  }

  await update($, home, () => here)
  await update($, repos, () => all)
}

// The list of folders in place of the files.
const pick = async ($: EngineInterface) => {
  await update($, repoFilter, () => '')
  await update($, repoNote, () => '')
  await update($, isPicking, () => true)
  await discover($)
}

// The pane turned to another folder, absolute, or to the session's own with
// an empty one: what was listed, typed and opened belongs to the folder left.
const settle = async ($: EngineInterface, to: string) => {
  if ((await read($, repo)) !== to) {
    // The folder is written first: a scan that starts now reads the new one, and is dropped all the same.
    await update($, repo, () => to)

    base = ''
    index = []
    marks = new Map()
    touched = new Set()
    changes = []
    compared = UNCOMPARED
    hasScanned = false

    await forget($)
  }

  await update($, repoNote, () => '')
  await update($, isPicking, () => false)
  await fresh($)
}

// Another folder to browse, by its whole path: a repository by its top, any
// other folder as it is. The session goes on working where it was; only the
// pane looks elsewhere.
const choose = async ($: EngineInterface, typed: string) => {
  const text = typed.trim()
  const person = await homeDir($)
  const asked = slashed(text.replace(/^~(?=$|[\\/])/, person))

  if (!/^(\/|[A-Za-z]:\/)/.test(asked) || (text.startsWith('~') && person === '')) {
    await update($, repoNote, () => "Paste the folder's whole path, from the drive or from the root.")

    return
  }

  const stat = await $.fs.stat(asked).catch(() => undefined)

  if (stat?.kind !== 'dir') {
    await update($, repoNote, () => `No folder at ${asked}.`)

    return
  }

  const where = (await topOf($, asked)) || asked

  if (isSame(where, await sessionTop($))) {
    await settle($, '')

    return
  }

  await remember($, where)
  await settle($, where)
}

// Enter over the list of folders: a path is opened as typed, anything else
// opens the first folder the list shows for it.
const chooseTyped = async ($: EngineInterface, typed: string) => {
  const text = typed.trim()

  if (text === '') {
    return
  }

  if (/[\\/]|^~/.test(text)) {
    await choose($, text)

    return
  }

  const top = (await read($, repos)).find(one => one.toLowerCase().includes(text.toLowerCase()))

  if (top === undefined) {
    await update($, repoNote, () => 'No folder by that name here: paste its whole path to open it.')
  } else {
    await choose($, top)
  }
}

// The session itself moves only when the person sends the command: it is put
// in an empty prompt and never sent from here.
const moveHere = async ($: EngineInterface) => {
  const where = await read($, repo)
  const { text: draft } = await $.prompt.read()

  if (draft.trim() !== '') {
    await update($, repoNote, () => 'The prompt has text in it: send or clear it, then press again.')

    return
  }

  await $.prompt.fill({ text: `/cd ${where}`, mode: 'replace' })
  await update($, repoNote, () => 'Put /cd in the prompt: press Enter there to move the session.')
}

const openPane = async ($: EngineInterface) => {
  await $.ui.open({ id: PANE, title: 'Files', focus: true })
  void fresh($).catch(() => {})
}

// A press on the hud's Files button: the pane opens, or closes when it is up.
const toggle = async ($: EngineInterface) => {
  if ((await $.ui.panes()).some(one => one.id === PANE)) {
    await $.ui.close({ id: PANE })
  } else {
    await openPane($)
  }
}

// The drawings carry their own ink, so they ask which theme the session is in;
// where nothing says, they are drawn for a dark one.
const theme = async ($: EngineInterface) => {
  try {
    const row = (await $.config.list()).find(one => one.key === 'theme')

    await update($, isLight, () => /light/i.test(String(row?.value ?? '')))
  } catch {
    // No settings menu here: the dark ink stands.
  }
}

// The pane as it is first opened, whatever it held: the way out when a drawing fails.
const reset = async ($: EngineInterface) => {
  await forget($)
  await update($, tab, () => 'explorer')
  await update($, isPicking, () => false)
  await update($, repoFilter, () => '')
  await update($, repoNote, () => '')
  await rescan($)
}

const addressee = (value: unknown) =>
  typeof value === 'object' && value !== null ? (value as { to?: unknown }).to : undefined

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'files',
      description: 'Find and read files of this repository in a pane; add a search after it to start with one',
    })
    await theme($)
    // A reload ends the wait for the marks to settle: it is kept again.
    void calm($).catch(() => {})

    return next(e)
  })

  on('command.run', { command: 'files' }, async ($, e) => {
    const asked = e.args.trim()

    await update($, seed, () => asked)
    await update($, view, () => null)
    await update($, isPicking, () => false)
    await update($, tab, () => 'explorer')
    await openPane($)
    await search($, asked)

    return { text: asked === '' ? 'Files opened.' : `Files opened: ${(await read($, total)).toString()} matching "${asked}".` }
  })

  on('state.set', { plugin: 'hud', key: 'signal' }, async ($, e, next) => {
    const written = await next(e)

    if (addressee(e.value) === PANE) {
      await toggle($)
    }

    return written
  })

  // What the main loop and every subagent read and write is seen once the
  // call has come back, so nothing is held up for it, and a call that was
  // refused, failed, or left its edit waiting to be approved leaves no mark.
  on('tool.call', async ($, e, next) => {
    const done = await next(e)

    if (done.deny === undefined && done.isError !== true && (done.result as { staged?: unknown } | null | undefined)?.staged !== true) {
      const input = e as Record<string, unknown>
      const seen = seenOf(String(e.tool), input)

      if (seen !== undefined) {
        void witness($, seen).catch(() => {})
      } else if (/^(Bash|PowerShell)$/.test(String(e.tool)) && typeof input.command === 'string' && movesHead(input.command)) {
        void relist($).catch(() => {})
      }
    }

    return done
  })

  // A turn may have edited files: with the pane up, git is asked again.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)

    if (e.agentId === undefined && (await read($, checking)) === 'done' && !(await read($, isProblemsStale))) {
      await update($, isProblemsStale, () => true)
    }

    if (e.agentId === undefined && (hasScanned || scanning !== undefined) && (await $.ui.panes().catch(() => [])).some(one => one.id === PANE)) {
      void rescan($)
        .then(() => reopen($))
        .catch(() => {})
    }

    return done
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    // A phone draws no text field: the pane is for a surface with a keyboard.
    if (e.surface === 'mobile') {
      const { Text } = $.ui.resolve(e)

      return <Text dimColor>Files needs a keyboard: open it on the desktop or in a terminal.</Text>
    }

    const { Box, Button, Code, Input, Text } = $.ui.resolve(e)
    const shown = await read($, view)
    const where = await read($, repo)
    const tone = (await read($, isLight)) ? 'light' : 'dark'
    const Svg = e.surface === 'desktop' ? $.ui.resolve(e).Svg : undefined
    const room = e.props.bodyColumns * CELL_PX

    // After a reload the list is gone while the pane is still up: read it once.
    // Not waited for: a drawing writes no state, and the scan's last write redraws the pane.
    await read($, scanned)

    if (!hasScanned) {
      void fresh($).catch(() => {})
    }

    if (shown !== null) {
      const isDiff = shown.mode === 'diff'
      const isBase = (await read($, against)) === 'base' && compared.mergeBase !== ''
      const hasDiff =
        shown.hint === undefined && (isBase ? compared.list : changes).some(one => one.path === shown.path && one.mark !== 'U')
      const trouble = shown.note === undefined && !isDiff ? shown.problem : undefined
      const hasPrev = isDiff ? shown.page > 0 : shown.startLine > 1
      const hasNext = isDiff ? shown.page < shown.pages - 1 : shown.endLine < shown.lines
      const isWhole = !hasPrev && !hasNext

      return (
        <Box flexDirection="column" gap={1}>
          <Box gap={1} flexWrap="wrap">
            <Button key="back" label="← Back" onPress={() => update($, view, () => null)} />
            {isDiff && <Button key="whole" label="Whole file" onPress={() => show($, shown.path)} />}
            {!isDiff && hasDiff && <Button key="diff" label="Changes" onPress={() => showDiff($, shown.path)} />}
            <Button key="mention" variant="primary" label="Add to prompt" onPress={() => mention($, shown.path)} />
            <Button key="copy" label="Copy path" onPress={press => copyPath($, shown.path, press.surface)} />
            {(hasPrev || hasNext) && <Button key="prev" label="‹ Prev" onPress={() => turn($, -1)} />}
            {(hasPrev || hasNext) && <Button key="next" label="Next ›" onPress={() => turn($, 1)} />}
            {trouble !== undefined && (
              <Button key="fix" label="Ask Claude to fix" onPress={() => askFix($, [{ ...trouble, path: shown.path }], 1)} />
            )}
          </Box>
          <Box gap={1} flexWrap="wrap">
            <Text bold>{shown.path}</Text>
            {isDiff && <Text color={MARKS[tone].U}>+{shown.added}</Text>}
            {isDiff && <Text color={MARKS[tone].D}>−{shown.removed}</Text>}
            {isDiff && <Text dimColor>{shown.versus === undefined ? 'since the last commit' : `against ${shown.versus}`}</Text>}
            {isDiff && shown.pages > 1 && (
              <Text dimColor>
                part {shown.page + 1} of {shown.pages}
              </Text>
            )}
            {!isDiff && shown.note === undefined && (
              <Text dimColor>
                {isWhole ? `${shown.lines} lines` : `lines ${shown.startLine}–${shown.endLine} of ${shown.lines}`}
                {' · '}
                {sizeOf(shown.bytes)}
              </Text>
            )}
            {!isDiff && shown.at !== undefined && shown.note === undefined && <Text color={MARKS[tone].M}>→ line {shown.at}</Text>}
          </Box>
          {shown.hint !== undefined && shown.note === undefined && <Text dimColor>{shown.hint}</Text>}
          {trouble !== undefined && (
            <Text color={MARKS[tone].D}>
              {trouble.code}: {trouble.message}
            </Text>
          )}
          {shown.note !== undefined ? (
            <Text dimColor>{shown.note}</Text>
          ) : isDiff ? (
            <Code source={shown.text} path={shown.path} format="diff" />
          ) : (
            <Code source={shown.text} path={shown.path} startLine={shown.startLine} />
          )}
        </Box>
      )
    }

    // One row of a list: what leads it, a name that is pressed, a dim note
    // beside the name, and what sits at the far end. A button is as wide as its
    // label, so on the desktop the label runs on in blank room and a press
    // beside the name lands too.
    // `ground` lights the whole row: it is a colour behind it, so nothing in the row moves.
    type Row = {
      lead?: JSX.Children
      leadPx: number
      label: string
      tail?: string
      end?: JSX.Children
      endPx?: number
      ground?: string
      press: () => unknown
    }

    const rowOf = (key: string, row: Row) => {
      const tail = row.tail ?? ''
      const used = row.leadPx + widthOf(row.label) + (tail === '' ? 0 : widthOf(tail) + 12) + 28 + (row.endPx ?? 0)
      const reach = Svg === undefined ? '' : tail === '' ? reachOf(used, room) : restOf(used, room)

      return (
        <Box
          key={`line-${key}`}
          alignItems="center"
          justifyContent="space-between"
          hover={{ backgroundColor: HOVER[tone] }}
          {...(row.ground === undefined ? {} : { backgroundColor: row.ground })}
        >
          <Box alignItems="center" flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
            {row.lead}
            <Button key={key} plain label={tail === '' ? `${row.label}${reach}` : row.label} onPress={row.press} />
            {tail !== '' && (
              <Text dimColor>
                {'  '}
                {tail}
              </Text>
            )}
            {tail !== '' && reach !== '' && <Button key={`${key}-rest`} plain label={reach} onPress={row.press} />}
          </Box>
          {row.end}
        </Box>
      )
    }

    if (await read($, isPicking)) {
      const here = await read($, home)
      const typed = (await read($, repoFilter)).trim().toLowerCase()
      const note = await read($, repoNote)
      const all = await read($, repos)
      const fitting = all.filter(one => typed === '' || one.toLowerCase().includes(typed))

      return (
        <Box flexDirection="column" gap={1}>
          <Box gap={1} paddingX={1} paddingTop={1} alignItems="center">
            <Button key="back" label="← Back" onPress={() => update($, isPicking, () => false)} />
            <Text bold>OPEN A FOLDER</Text>
          </Box>
          <Box paddingX={1}>
            <Input
              key="folder"
              placeholder="Type a name, or paste a folder's path"
              submitLabel="open"
              autoFocus
              onInput={(text: string) => void update($, repoFilter, () => text)}
              onSubmit={(text: string) => void chooseTyped($, text)}
            />
          </Box>
          {note !== '' && <Text color={MARKS[tone].M}>{note}</Text>}
          <Box flexDirection="column">
            {fitting.slice(0, FOLDERS).map((path, at) =>
              rowOf(`folder-${at}`, {
                leadPx: 0,
                label: `${Svg === undefined ? '' : `${FOLDER.closed} `}${lastOf(path)}`,
                tail: folderOf(path),
                press: () => choose($, path),
                end: isSame(path, here) ? (
                  <Text dimColor>this session </Text>
                ) : isSame(path, where) ? (
                  <Text dimColor>open </Text>
                ) : undefined,
                endPx: 90,
              }),
            )}
            <Text dimColor>
              {fitting.length === 0
                ? 'No folder fits: paste a whole path and press Enter.'
                : fitting.length > FOLDERS
                  ? `+ ${fitting.length - FOLDERS} more: type to narrow it`
                  : 'The session keeps working where it is: this only changes what the pane shows.'}
            </Text>
          </Box>
        </Box>
      )
    }

    const active = await read($, tab)
    // Claude's marks are read only where rows wear them, the tree and the
    // changes: an open file, the search inside the files and the problems are
    // not drawn again each time Claude touches something.
    const lights =
      active === 'explorer' || active === 'changes'
        ? lightsOf(soundActivity(await read($, activity)), base, await read($, showing))
        : lightsOf({ at: 0, touches: [] }, base, 'none')
    const troubles = (await read($, checking)) === 'done' ? await read($, problemTotal) : 0
    const asked = await read($, query)
    const name = await read($, root)
    const note = await read($, repoNote)
    type Line = { depth: number; kind: 'dir' | 'file'; isOpen: boolean; name: string; path: string }
    type Extra = { tail?: string; press?: () => unknown; change?: Change; count?: number }

    // One row of the explorer. A drawing takes no press, so all of a folder's row
    // is one button: its chevron and its folder are glyphs of the label, and a
    // press anywhere on them opens it. A file's icon is drawn, its name pressed.
    // A terminal has no drawing: the guides are text there.
    //
    // Claude's mark takes room that is there already. On a file it is a dot
    // where a folder's chevron would be, and its row is lit while the mark is
    // new. A folder wears the dot git's changes give it, in the ink of what is
    // in it: Claude at work there now, then git's change, then what Claude
    // touched before.
    const fold = foldedBy(base)
    const line = (key: string, row: Line, extra: Extra = {}) => {
      const light = tone === 'light'
      const isFolder = row.kind === 'dir'
      const own = lights.own.get(fold(row.path))
      const lit = isFolder ? strongerOf(own, lights.inside.get(fold(row.path))) : own
      const ink = lit === undefined ? undefined : DEEDS[tone][lit.deed]
      const dot = lit?.isLive === true ? ink?.live : touched.has(row.path) ? MARKS[tone].M : ink?.quiet
      const spot =
        isFolder || lit === undefined || ink === undefined ? undefined : { color: lit.isLive ? ink.live : ink.quiet, isLive: lit.isLive }
      const mark = extra.change?.mark ?? (isFolder ? (dot === undefined ? undefined : '•') : marks.get(row.path))
      const indent = indentOf(row.depth, light)
      const icon = edgeOf(row, light, spot)
      const counts = extra.change

      return rowOf(key, {
        lead: [
          Svg === undefined && <Text dimColor>{`${'│ '.repeat(row.depth)}${isFolder || spot !== undefined ? '' : '  '}`}</Text>,
          Svg === undefined && spot !== undefined && <Text color={spot.color}>{spot.isLive ? '● ' : '· '}</Text>,
          Svg !== undefined && isFolder && indent.width > 0 && (
            <Svg source={indent.source} alt="indent" width={indent.width} height={ROW} />
          ),
          Svg !== undefined && !isFolder && (
            <Svg
              source={icon.source}
              alt={lit === undefined ? icon.alt : `${icon.alt}, ${SAID[lit.deed]} ${lit.isLive ? 'just now' : 'this session'}`}
              width={icon.width}
              height={ROW}
            />
          ),
        ],
        leadPx: isFolder ? indent.width + 30 : icon.width,
        label: isFolder
          ? `${row.isOpen ? '▾' : '▸'} ${Svg === undefined ? '' : `${row.isOpen ? FOLDER.open : FOLDER.closed} `}${row.name}`
          : row.name,
        tail: extra.tail,
        press: extra.press ?? (() => (isFolder ? flip($, row.path) : show($, row.path))),
        end: [
          extra.count !== undefined && <Text dimColor>{extra.count} </Text>,
          counts?.added !== undefined && <Text color={MARKS[tone].U}>+{counts.added} </Text>,
          counts?.removed !== undefined && <Text color={MARKS[tone].D}>−{counts.removed} </Text>,
          mark !== undefined && <Text color={mark === '•' ? (dot ?? MARKS[tone].M) : MARKS[tone][mark]}>{mark} </Text>,
        ],
        endPx: counts?.added === undefined ? (extra.count === undefined ? 0 : 30) : 70,
        ...(own?.isLive === true ? { ground: DEEDS[tone][own.deed].ground } : {}),
      })
    }
    const fileLine = (key: string, path: string, extra: Extra = {}) =>
      line(key, { depth: 0, kind: 'file', isOpen: false, name: lastOf(path), path }, { tail: folderOf(path), ...extra })

    // A tab or a choice inside one. Each keeps its cells and its kind whichever
    // is in view, so a press moves none of them: the one in view is at full
    // strength over the accent's rule, the others dim over an empty one.
    const tabOf = (key: string, label: string, isOn: boolean, cells: number, rulePx: number, press: () => unknown) => (
      <Box flexDirection="column" alignItems="center" width={cells}>
        {Svg === undefined && isOn ? (
          <Text bold underline>
            {label}
          </Text>
        ) : (
          <Button key={key} plain dimColor={!isOn} label={label} onPress={press} />
        )}
        {Svg !== undefined && (
          <Svg source={ruleOf(rulePx, isOn, tone === 'light')} alt={isOn ? 'in view' : 'tab'} width={rulePx} height={2} />
        )}
      </Box>
    )

    const body = async () => {
      if (active === 'search') {
        const sought = await read($, needle)
        const started = await read($, needleSeed)
        // The state outlives a reload of the mod: a line an older one wrote in another shape is left out.
        const found: readonly Found[] = soundHits(await read($, finds))
        const matched = await read($, findTotal)
        const inFiles = await read($, findFiles)
        // A line found is cut to the row, since a button's label does not wrap.
        const letters = Math.max(20, Svg === undefined ? e.props.bodyColumns - NUMBER_CELLS - 4 : Math.floor((room - 110) / LETTER_PX))
        const edge = Svg === undefined ? EDGE.terminal : EDGE.desktop
        const perFile = new Map<string, number>()

        for (const hit of found) {
          perFile.set(hit.path, (perFile.get(hit.path) ?? 0) + 1)
        }

        // One line found: its number, then the line with the text found at full
        // strength and the rest of it dim. Only a button takes a press and a
        // button has one style, so the line is three of them side by side, each
        // opening the file at that line; a space at a joint is kept from a trim.
        const hitLine = (key: string, hit: Found) => {
          const cut = fittedTo(hit, letters)
          const before = cut.before.replace(/ $/, edge.before)
          const after = cut.after.replace(/^ /, edge.after)
          const used = NUMBER_CELLS * CELL_PX + 16 + widthOf(`${cut.before}${cut.match}${cut.after}`) + 28
          const reach = Svg === undefined ? '' : after === '' ? restOf(used, room) : reachOf(used, room)
          const press = () => show($, hit.path, hit.line)

          return (
            <Box key={`line-${key}`} alignItems="center" hover={{ backgroundColor: HOVER[tone] }}>
              <Box width={NUMBER_CELLS} flexShrink={0} justifyContent="flex-end">
                <Button key={`${key}-line`} plain dimColor label={hit.line.toString()} onPress={press} />
              </Box>
              <Box alignItems="center" flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden" paddingLeft={2}>
                {before !== '' && <Button key={`${key}-before`} plain dimColor label={before} onPress={press} />}
                <Button key={key} plain label={cut.match === '' ? '(blank)' : cut.match} onPress={press} />
                {`${after}${reach}` !== '' && <Button key={`${key}-after`} plain dimColor label={`${after}${reach}`} onPress={press} />}
              </Box>
            </Box>
          )
        }

        return (
          <Box flexDirection="column" gap={1}>
            <Box paddingX={1}>
              <Input
                key="grep"
                placeholder="Search inside files"
                submitLabel="open"
                autoFocus
                {...(started === '' ? {} : { value: started })}
                onInput={(text: string) => void grep($, text)}
                onSubmit={(text: string) => void firstFound($, text)}
              />
            </Box>
            <Box flexDirection="column">
              <Text dimColor>
                {sought.trim().length < NEEDLE
                  ? 'Type two letters or more. Capitals make the search exact.'
                  : matched < 0
                    ? 'The search did not finish in time: this folder may be too large to search from here.'
                    : matched === 0
                      ? 'Nothing found.'
                      : matched > found.length
                        ? `${matched} lines in ${inFiles} files: the first ${found.length} shown, keep typing to narrow it`
                        : `${matched} line${matched === 1 ? '' : 's'} in ${inFiles} file${inFiles === 1 ? '' : 's'} · Enter opens the first`}
              </Text>
              {found.flatMap((hit, at) => [
                found[at - 1]?.path === hit.path
                  ? undefined
                  : fileLine(`found-${at}`, hit.path, { count: perFile.get(hit.path) ?? 1 }),
                hitLine(`find-${at}`, hit),
              ])}
            </Box>
          </Box>
        )
      }

      if (active === 'changes') {
        // On the branch work is merged to, with no remote to tell it against, there is nothing to compare.
        const canCompare = compared.mergeBase !== '' && compared.baseRef !== compared.branch
        const isBase = canCompare && (await read($, against)) === 'base'
        const list = isBase ? compared.list : changes
        const told = isBase ? `differ from ${compared.baseName}, committed on this branch or not` : 'changed since the last commit'

        return (
          <Box flexDirection="column" gap={1}>
            {canCompare && (
              <Box paddingX={1} gap={1}>
                {tabOf('against-head', 'UNCOMMITTED', !isBase, CHOICE_CELLS, CHOICE_PX, () => tellAgainst($, 'head'))}
                {tabOf('against-base', `AGAINST ${compared.baseName.toUpperCase()}`, isBase, CHOICE_CELLS, CHOICE_PX, () => tellAgainst($, 'base'))}
              </Box>
            )}
            <Box flexDirection="column">
              {isGit && compared.branch !== '' && (
                <Text dimColor>{standingOf(compared.branch, compared.baseName, compared.ahead, compared.behind)}</Text>
              )}
              {list.slice(0, CHANGES).map((change, at) =>
                fileLine(`change-${at}`, change.path, {
                  change,
                  press: () => (change.mark === 'U' ? show($, change.path) : showDiff($, change.path)),
                }),
              )}
              <Text dimColor>
                {!isGit && hasScanned
                  ? 'Not a git repository: there are no changes to list.'
                  : list.length === 0
                    ? isBase
                      ? `Nothing differs from ${compared.baseName}.`
                      : 'Nothing changed since the last commit.'
                    : list.length > CHANGES
                      ? `+ ${list.length - CHANGES} more`
                      : `${list.length} file${list.length === 1 ? '' : 's'} ${told} · press one to see what changed`}
              </Text>
            </Box>
          </Box>
        )
      }

      if (active === 'problems') {
        const state = await read($, checking)
        const list = soundProblems(await read($, problems))
        const count = await read($, problemTotal)
        const inFiles = await read($, problemFiles)
        const project = (await read($, problemProject)) || 'the top folder'
        const stale = (await read($, isProblemsStale)) ? ' · read before the last turn: run it again' : ''
        const projects = projectsOf(index, PROJECTS)
        // After a reload the state may still say the checker runs when nothing does.
        const isRunning = state === 'running' && isChecking
        const letters = Math.max(20, Svg === undefined ? e.props.bodyColumns - NUMBER_CELLS - 14 : Math.floor((room - 170) / LETTER_PX))
        const perFile = new Map<string, number>()

        for (const one of list) {
          perFile.set(one.path, (perFile.get(one.path) ?? 0) + 1)
        }

        return (
          <Box flexDirection="column" gap={1}>
            <Box paddingX={1} gap={1} flexWrap="wrap" alignItems="center">
              {projects.map((folder, at) => (
                <Button
                  key={`check-${at}`}
                  {...(at === 0 ? { variant: 'primary' as const } : {})}
                  label={projects.length === 1 ? 'Run the type checker' : `Check ${folder === '' ? 'the top folder' : folder}`}
                  onPress={() => void check($, folder)}
                />
              ))}
              {state === 'done' && list.length > 0 && (
                <Button
                  key="fix-all"
                  label={count === 1 ? 'Ask Claude to fix it' : `Ask Claude to fix all ${count}`}
                  onPress={() => askFix($, list, count)}
                />
              )}
            </Box>
            <Box flexDirection="column">
              <Text dimColor>
                {projects.length === 0
                  ? 'No TypeScript project here: a tsconfig.json is what is looked for.'
                  : isRunning
                    ? `Checking ${project}: this can take a minute.`
                    : state === 'failed'
                      ? await read($, problemNote)
                      : state !== 'done'
                        ? "Runs this project's own type checker, with its output turned off, and lists what it finds."
                        : count === 0
                          ? `No type errors in ${project}${stale}`
                          : `${count} error${count === 1 ? '' : 's'} in ${inFiles} file${inFiles === 1 ? '' : 's'}${
                              count > list.length ? `: the first ${list.length} shown` : ''
                            }${stale}`}
              </Text>
              {state === 'done' &&
                list.flatMap((one, at) => {
                  const press = () => show($, one.path, one.line, { problem: one })
                  const message = one.message.length > letters ? `${one.message.slice(0, letters - 1)}…` : one.message

                  return [
                    list[at - 1]?.path === one.path
                      ? undefined
                      : fileLine(`trouble-${at}`, one.path, { count: perFile.get(one.path) ?? 1, press }),
                    rowOf(`problem-${at}`, {
                      lead: (
                        <Box width={NUMBER_CELLS} flexShrink={0} justifyContent="flex-end" paddingRight={2}>
                          <Button key={`problem-${at}-line`} plain dimColor label={one.line.toString()} onPress={press} />
                        </Box>
                      ),
                      leadPx: NUMBER_CELLS * CELL_PX + 16,
                      label: message === '' ? one.code : message,
                      tail: one.code,
                      press,
                    }),
                  ]
                })}
            </Box>
          </Box>
        )
      }

      const started = await read($, seed)
      const found = await read($, hits)
      const matched = await read($, total)
      const count = await read($, indexed)
      const opened = asked === '' ? await read($, recent) : []
      const isFollowed = (await read($, isFollowing)) !== false
      const tree = asked === '' ? treeOf(index, await read($, expanded), TREE) : { rows: [], more: 0 }

      return (
        <Box flexDirection="column" gap={1}>
          <Box paddingX={1}>
            <Input
              key="q"
              placeholder="Search files by name or path"
              submitLabel="open"
              autoFocus
              {...(started === '' ? {} : { value: started })}
              onInput={(text: string) => void search($, text)}
              onSubmit={(text: string) => void first($, text)}
            />
          </Box>
          {asked !== '' && (
            <Box flexDirection="column">
              {found.map((path, at) => fileLine(`hit-${at}`, path))}
              <Text dimColor>
                {matched === 0
                  ? 'No file matches.'
                  : matched > found.length
                    ? `+ ${matched - found.length} more: keep typing to narrow it`
                    : `${matched} match${matched === 1 ? '' : 'es'} · Enter opens the first`}
              </Text>
            </Box>
          )}
          {opened.length > 0 && (
            <Box flexDirection="column">
              <Text dimColor>RECENT</Text>
              {opened.map((path, at) => fileLine(`recent-${at}`, path))}
            </Box>
          )}
          {asked === '' && (
            <Box flexDirection="column">
              <Box alignItems="center" justifyContent="space-between">
                <Text dimColor>{count >= 0 ? `${count} files` : ' '}</Text>
                <Button
                  key="follow"
                  plain
                  dimColor={!isFollowed}
                  label={isFollowed ? '◉ follow' : '○ follow'}
                  onPress={() => update($, isFollowing, was => was === false)}
                />
              </Box>
              {tree.rows.map((row, at) => line(`row-${at}`, row))}
              {tree.more > 0 && <Text dimColor>+ {tree.more} more: search to find them</Text>}
            </Box>
          )}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        <Box paddingX={1} paddingTop={1} alignItems="flex-start" justifyContent="space-between">
          <Box gap={1}>
            {TABS.map(([id, title]) =>
              tabOf(
                `tab-${id}`,
                id === 'changes' && changes.length > 0
                  ? `${title} ${changes.length}`
                  : id === 'problems' && troubles > 0
                    ? `${title} ${troubles}`
                    : title,
                id === active,
                TAB_CELLS,
                RULE_PX,
                () => switchTab($, id),
              ),
            )}
          </Box>
          <Button key="repo" plain label={`${name === '' ? 'folder' : name} ▾`} onPress={() => pick($)} />
        </Box>
        {where !== '' && (
          <Box paddingX={1} gap={1} alignItems="center" flexWrap="wrap">
            <Text dimColor>Not the session's folder.</Text>
            <Button key="home" label="Back to the session's" onPress={() => settle($, '')} />
            <Button key="move" label="Work here" onPress={() => moveHere($)} />
          </Box>
        )}
        {where !== '' && note !== '' && <Text color={MARKS[tone].M}>{note}</Text>}
        {await body()}
      </Box>
    )
  }).catch(($, e, next) => {
    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column" gap={1} paddingX={1} paddingTop={1}>
        <Text bold>Files could not draw this view.</Text>
        <Text dimColor>{next.error.message ?? (next.error.kind === 'timeout' ? 'It took too long.' : 'No reason was given.')}</Text>
        <Box>
          <Button key="reset" variant="primary" label="Reset the pane" onPress={() => reset($)} />
        </Box>
      </Box>
    )
  })
}
