# claude-mods

A kit for Claude Code: seven mods (plugins of function hooks) that add a status card, a goals list
and a few panes to a session, and five optional helper agents that take work off the main session.
Each mod works without the others, and the agents work without the mods.

## The mods

| Mod | What it does | Open it with |
| --- | --- | --- |
| `hud` | A card above the prompt: the context window as a coloured bar by what fills it, rate limits, session cost, whether the dev server answers, the git branch on a line of its own with how far it is from main, and buttons for the other mods. | `/hud` switches the card and a one-line form |
| `goals` | A goals list above the prompt that Claude keeps current as it works. Kept per project. | `/goals`, `/goals clear` |
| `agent-deck` | A pane showing the main loop and every subagent: a pixel crab with a hat per role, model, progress through its plan, tokens, estimated cost and time, with running and finished agents apart and a one-line strip above the prompt while agents run. | `/agent-deck` |
| `files` | A pane for finding and reading files without asking the model, in four tabs: an explorer with search by name, a search inside the files, git's changes (since the last commit, or against main) with a diff of each, and the type checker's errors. Files light up as Claude reads, edits and commits them. The folder button points the pane at another repository. | `/files` |
| `replay` | A pane stepping through the last turn's file edits as diffs. | `/replay` |
| `quick-prompts` | A row of saved prompts; a press drops one into the prompt box. Edit `quick-prompts/hooks/prompts.ts` to make them yours. | `/quick-prompts` |
| `done-chime` | A toast and a system sound when a long turn finishes or a permission answer is needed. The sound plays on Windows; on macOS it should, but that is untried; on Linux there is none. | nothing: it runs by itself |

## The helper agents

Five subagent definitions in `agents/`, each a role with its own tools and its own model:

| Agent | What it does |
| --- | --- |
| `scout` | Finds things in the code. Reads only. |
| `runner` | Runs typecheck, build, tests and other noisy commands, and reports what matters. |
| `builder` | Writes one independent, fully specified piece of a larger change. |
| `reviewer` | Checks a finished change with fresh eyes. Edits nothing. |
| `architect` | Deep analysis of a hard question. Runs only when asked for. |

You choose which model each one runs on during the install: a cheap, fast model for searching and
a strong one for review is the suggested split, and running everything on one model works too.

## Install

Clone this repository, or download it as a zip and unzip it, then open a Claude Code session and
say:

> Read INSTALL.md in `<the folder you put it in>` and install this kit for me.

Claude will first tell you what the mods do, then ask three things: which mods you want, whether
you want the agents and on which models, and whether the main session should use the agents
without being asked. `INSTALL.md` is written for Claude to follow, and can be followed by hand.

## What to know first

- Mods need Claude Code 2.1.287 or later. These were last checked on 2.1.293; a later release
  may change how mods work.
- A mod is code that runs inside your Claude Code session. `INSTALL.md` lists every command these
  run and every file they write, so you can read that before you install.
- They have been used on Windows and Linux. They have not been tried on macOS.
- The costs the agent pane shows are estimates from token counts and list prices, not a bill.
- The hud looks for a local dev server (the ports in the project's `.claude/launch.json`, or
  3000). In a project without one it says "dev server down"; that is a status note, not a fault.
- Mods, agents and instructions load on the machine a session runs on. For a session on a remote
  host over SSH, install them on that host as well.

## Licence

MIT. See [LICENSE](LICENSE).
