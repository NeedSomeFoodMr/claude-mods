export type QuickPrompt = { key: string; label: string; text: string }

// Edit this list: saving the file reloads the mod. `key` is letters, digits
// and dashes, one per prompt.
export const PROMPTS: readonly QuickPrompt[] = [
  {
    key: 'checks',
    label: 'Typecheck + build',
    text: "Run this project's typecheck and build, and report what passed and what failed.",
  },
  {
    key: 'diff',
    label: 'Explain diff',
    text: 'Walk me through the current git diff file by file: what changed and why.',
  },
  {
    key: 'verify',
    label: 'Verify in app',
    text: 'Verify the last change in the running app on localhost, and show me a screenshot with the URL.',
  },
  {
    key: 'scope',
    label: 'Scope check',
    text: "Review the final diff against this project's instructions (CLAUDE.md or AGENTS.md): confirm it stays within the task, and that no generated or unrelated file changed.",
  },
  {
    key: 'tidy',
    label: 'Tidy up',
    text: [
      'Help me tidy up. Look first, then propose, and only change things after I say go.',
      '',
      '1. Chats: list my sessions and sidebar groups. Propose which group each chat belongs in by topic (not by machine), clearer titles for vague ones, and which look finished and could be archived. Never delete a chat.',
      '2. Folders: on the machine this chat runs on, list my home folder and the project folders one level deep, with sizes, and say what each thing is. Check whether a repository has uncommitted or unpushed work before suggesting anything for it.',
      '3. Propose a layout as a short table: what stays, what moves, and why. Keep to the layout I already use where there is one; otherwise suggest one, such as live repositories in ~/repos and anything kept but unused in ~/archive.',
      '4. Rules: delete nothing, move it to the archive instead. Do not move or rename a live repository or the folder my Claude Code mods load from, since chat history and settings are tied to those paths. Do not open environment files or saved logins; name them and where they are only. Check nothing is running inside a folder before moving it.',
      '5. After I say go, make the changes, show me the result, and tell me anything you left for me to do.',
    ].join('\n'),
  },
]

/** The draft after a press: the prompt alone, or under what the person already typed. */
export const drafted = (draft: string, text: string) => (draft.trim() === '' ? text : `${draft.trimEnd()}\n\n${text}`)
