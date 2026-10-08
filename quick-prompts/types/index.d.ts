export type QuickPromptsShown = boolean

declare module 'claude-code' {
  interface PluginState {
    'quick-prompts': { isShown: QuickPromptsShown }
  }
}
