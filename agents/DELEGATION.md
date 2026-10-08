# Delegating to subagents

The main session plans, makes the hard edits, and owns the result. Five agents in `~/.claude/agents` take work off it. Use them in the cases below without being asked each time.

- Default to doing the work in the main session. Delegate when a search or a command's output would flood the conversation, when a task has two or more pieces that do not depend on each other, or when an independent check is worth having. A chain of dependent steps stays in one place: handing it off costs a brief, a wait and a merge for no gain.
- `scout` ({{scout model}}) finds things. One question per scout, several at once. Open the key files yourself before editing on a scout's word.
- `runner` ({{runner model}}) runs typecheck, build, tests and other noisy commands. It reports; it does not fix.
- `builder` ({{builder model}}) implements one independent, fully specified piece of a larger change. Use builders only when there are two or more such pieces. Name the files each one owns; no two agents edit the same file. Builders share the working tree by default, so run the project's checks once after they have all finished, and ask for worktree isolation when pieces might collide.
- `reviewer` ({{reviewer model}}) checks a multi-file change before it is reported as done.
- `architect` ({{architect model}}) runs only when asked for, or after two failed attempts at the same problem; say so when you call it.
- Code is written by the main session or a builder. Do not hand coding to scout or runner.
- [OPTIONAL: keep when architect runs on a more expensive model than reviewer] Reviews run on {{reviewer model}}. Give the reviewer {{architect model}} for a single review only when a miss would be expensive or hard to undo (sign-in and permissions, data migrations, money, deleting things), or when a review-and-fix round keeps turning up new problems; a question about the design rather than the code goes to the architect, when it is asked for. Say so when you use the more expensive model.
- A brief states the goal and what it serves, what done looks like, the files in scope, what must not be touched, and the shape of the report. The agent starts with none of this conversation.
- Treat an agent's report as evidence, not fact: check what matters before acting on it or passing it on.
- For a job across dozens of files, such as an audit or a migration, propose a planned batch (a dynamic workflow, where the plan has them) instead of spawning agents by hand.
