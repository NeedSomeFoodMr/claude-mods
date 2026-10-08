export type Step = {
  tool: string
  file: string
  diff: string
  added: number
  removed: number
}

declare module 'claude-code' {
  interface PluginState {
    replay: { steps: Step[]; at: number; isFresh: boolean }
  }
}
