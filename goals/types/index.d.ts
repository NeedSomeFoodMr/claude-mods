export type GoalStatus = 'todo' | 'doing' | 'done'

export type Goal = { title: string; status: GoalStatus; note?: string }

declare module 'claude-code' {
  interface PluginState {
    goals: { list: Goal[]; isOpen: boolean; isLight: boolean }
  }
}
