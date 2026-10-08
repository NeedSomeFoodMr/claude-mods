export type Reading = { percent: number; tokens: number; window: number }

export type Category = { name: string; tokens: number }

export type Limit = { kind: string; percent: number; resetsAt?: string }

export type Usage = { limits: Limit[]; usd?: number; at: number }

export type Dev = { ports: number[]; up: number[] }

/**
 * Where the repository stands: the branch checked out (empty with a commit and
 * no branch), the branch work is merged to as it is called (empty where there
 * is none), how far the two are apart, and how many files are changed or new.
 */
export type Standing = { branch: string; base: string; ahead: number; behind: number; changed: number; isBase: boolean }

/** A press on one of the card's buttons, addressed to the mod that answers it. */
export type Signal = { to: string; n: number }

declare module 'claude-code' {
  interface PluginState {
    hud: {
      readings: Reading[]
      categories: Category[]
      /** The token count auto-compaction runs at; null when it is off or unknown. */
      compactAt: number | null
      usage: Usage | null
      dev: Dev | null
      isCompact: boolean
      signal: Signal | null
      /** The companion mods loaded beside this one, by their command names. */
      mods: string[]
      isLight: boolean
      /** Git's answer for the session's folder; null where it is no repository. */
      git: Standing | null
    }
  }
}
