/** What the pane is drawing: the tree, a search inside the files, what git says changed, or what the type checker says is wrong. */
export type Tab = 'explorer' | 'search' | 'changes' | 'problems'

/** One error the type checker reports. */
export type Trouble = { path: string; line: number; column: number; code: string; message: string }

/** One page of an open file or of its diff, or why it is not shown. */
export type View = {
  path: string
  /** `file` is the file as it is on the disk; `diff` is what changed in it since the last commit. */
  mode: 'file' | 'diff'
  /** A file's page: the 1-based lines it starts and ends on, of `lines` in all. */
  startLine: number
  endLine: number
  lines: number
  bytes: number
  /** A diff's page, 0-based, of `pages`; the lines the whole diff adds and removes. */
  page: number
  pages: number
  added: number
  removed: number
  text: string
  /** Set where the file is not drawn: too large, binary, or unreadable. */
  note?: string
  /** The line a search hit is on, when the file was opened from one. */
  at?: number
  /** A word over the file, where it was opened in place of a diff git does not have. */
  hint?: string
  /** What a diff is told against, where that is not the last commit: the branch's name. */
  versus?: string
  /** The error the file was opened at, when it was opened from the problems. */
  problem?: Trouble
}

/** One line that holds the text searched for: the text as the line spells it, and what stands on either side. */
export type Found = { path: string; line: number; before: string; match: string; after: string }

/** What was done to a path: a tool read it or searched it, a tool wrote it, or a commit made a changed file clean. */
export type Deed = 'read' | 'write' | 'commit'

/** One path touched this session, whole: when each deed last fell on it (0 for never), and until when its mark is at full strength. */
export type Touch = { path: string; read: number; write: number; commit: number; liveUntil: number }

/** What was touched, the latest first; a mark due by `at` has settled into its quiet one. */
export type Activity = { at: number; touches: Touch[] }

/** Which of the deeds the rows are marked with. */
export type Showing = 'all' | 'writes' | 'reads' | 'none'

declare module 'claude-code' {
  interface PluginState {
    files: {
      tab: Tab
      /** The search by name as last typed. */
      query: string
      /** A search the pane was opened with, drawn in the field. */
      seed: string
      /** The best matches, in order. */
      hits: string[]
      /** How many files matched in all. */
      total: number
      /** How many files the index holds; -1 before the first scan. */
      indexed: number
      /** Files opened this session, the latest first. */
      recent: string[]
      /** The folders opened in the tree, by path. */
      expanded: string[]
      /** How many times the file list has been read: a write redraws the tree. */
      scanned: number
      view: View | null
      /** The folder's name, as the pane's heading. */
      root: string
      isLight: boolean
      /** The text searched for inside the files, as last typed, and what the field is drawn with. */
      needle: string
      needleSeed: string
      /** The first lines that hold it, how many there are (-1 when the search did not finish), and in how many files. */
      finds: Found[]
      findTotal: number
      findFiles: number
      /** The folder being browsed, absolute; empty for the session's own. */
      repo: string
      /** The session's own folder, absolute, once the folders were looked for. */
      home: string
      /** Folders that can be opened: the session's, those opened before, and the repositories beside it. */
      repos: string[]
      /** True while the pane lists the folders in place of the files. */
      isPicking: boolean
      /** What is typed over the list of folders. */
      repoFilter: string
      /** A line for the person about the folder asked for, when there is one. */
      repoNote: string
      /** What the changes are told against: the last commit, or the branch this one left. */
      against: 'head' | 'base'
      /** The first errors the type checker reported, how many there were, and in how many files. */
      problems: Trouble[]
      problemTotal: number
      problemFiles: number
      /** Where the type checker stands, the project's folder it was run for, and a line when it could not be run. */
      checking: 'idle' | 'running' | 'done' | 'failed'
      problemProject: string
      problemNote: string
      /** True once a turn has ended since the errors were read: they may be of files as they were. */
      isProblemsStale: boolean
      /** What Claude read and wrote and what was committed, by whole path: what lies outside the folder in view is kept and not drawn. */
      activity: Activity
      /** True while the tree opens a closed folder to show what Claude touches. */
      isFollowing: boolean
      /** Which activity the rows are marked with. */
      showing: Showing
    }
  }
}
