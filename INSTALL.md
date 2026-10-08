# Installing this kit

This file is for Claude Code, working for the person who downloaded this folder. Follow the steps in
order. Where a step says to ask, ask and wait for the answer.

Installing needs no download, no account and no password. If a step seems to need one, stop and
say so.

## What is in the kit

**Seven mods**, each a folder: `hud`, `goals`, `agent-deck`, `files`, `replay`, `quick-prompts`,
`done-chime`. `README.md` says what each does. A mod is a folder with `.claude-plugin/plugin.json`,
`hooks/hooks.json` and a `hooks/register` file of function hooks. No mod needs another to load.

**Five helper agents** (optional), in `agents/`: `scout`, `runner`, `builder`, `reviewer`,
`architect`. Each is a Claude Code subagent definition: a role, the tools it may use, and the model
it runs on. `agents/DELEGATION.md` is a set of rules for the person's own instructions file saying
when the main session should hand work to them. The agents and the mods work without each other;
the `agent-deck` mod shows the agents at work.

A mod is code that runs inside the person's sessions, so read the code before installing it and
tell the person what you found. This is what the mods do beyond drawing their own interface:

| Mod | Commands and requests | Reads | Writes |
| --- | --- | --- | --- |
| `hud` | `git` in the session's folder (read-only: status, branch, counts), every 20 seconds and after a turn. A `HEAD` request to `http://localhost:<port>/favicon.ico` every 20 seconds, for the ports named in the project's `.claude/launch.json`, or port 3000 when there is none. | `.claude/launch.json`; the session's usage and cost figures; the list of commands, to know which of the other mods are loaded | none |
| `files` | `git` (read-only: file list, status, diff, grep, the branch and where it left the main one, counts ahead and behind, the current commit, whether one commit descends from another, a commit's time) in whichever folder the pane is pointed at. On a press only: that folder's own TypeScript checker, as `node <folder>/node_modules/typescript/bin/tsc` with its output turned off. | The files it shows. Which files each tool call of the session reads or writes, kept as marks in the session's state. The text of each shell command, only to notice one that may commit; none of it is kept. The folders beside the session's folder and one level around it, to find repositories (it checks each for `.git`). The `USERPROFILE` or `HOME` variable. | `~/.claude/files-folders.json`, the folders the pane was pointed at. On a press, a file's path to the clipboard; or into the prompt box one of: a file's path as an `@` mention, a request to fix the type errors it lists, or `/cd <folder>`. It sends none of them. |
| `goals` | none | none | Its own store, a JSON file under the Claude Code configuration folder, holding each project's goals list under that project's folder path. |
| `agent-deck` | none | Every tool call and model response in the session, of which it keeps, for each subagent: its last tool, that tool's first argument, a short brief of its task, and its token counts. The session's usage and cost figures. The agents now running and the names of the person's own agent types. | On a press, `Ask <name> to ` into the prompt box. It sends nothing. |
| `replay` | none | The file edits of the last turn, kept as diffs in the session's state. | none |
| `quick-prompts` | none | none | On a press, a saved prompt into the prompt box. It sends nothing. |
| `done-chime` | A system sound: `powershell.exe` on Windows, `afplay` elsewhere. Where there is no `afplay`, as on Linux, it is silent. | The `OS` variable | none |

Four more things to tell the person:

- `goals` and `agent-deck` each register one tool for Claude (`mcp__goals__set`,
  `mcp__agent-deck__plan`). Each mod approves its own tool, so neither tool asks for permission,
  and both are offered to the main session and to every agent that inherits its tools. The tools
  only change the mod's own list.
- `goals` and `agent-deck` each add a few lines of context to every prompt: the current goals
  list, and the names the pane gives the session's subagents. `agent-deck` opens its pane when a
  subagent starts.
- `hud`, `goals`, `agent-deck` and `files` each read the rows of the settings menu once, when a
  session starts, to learn whether the theme is light or dark.
- The costs `agent-deck` shows per agent are estimates: token counts times a table of list
  prices in the mod. They are not a bill, and a subscription is not charged by the token.

Once a mod has loaded in a session, Claude Code may write a `.claude-plugin/types` folder into
it. That is its own type declarations, made again whenever they are missing.

## Steps

1. **Say what you found, then ask the setup questions.** After reading the code, give the person
   a short summary of the table above with anything you found that it does not say. Then ask
   these, and copy or run nothing until they have answered:

   a. **Which mods?** All seven is the usual answer; `done-chime` makes a sound, so say so.

   b. **Do you want the five helper agents, and which model should each run on?** Show this
      table and let them change any row. People differ here: some want the strongest model
      for design and review and a cheap one for searching; some run everything on one model.

      | Agent | What it does | Suggested model | Why |
      | --- | --- | --- | --- |
      | `scout` | Finds things in the code; reads only | `haiku` | Fast and cheap; searching needs little judgement |
      | `runner` | Runs typecheck, build and tests; reports, fixes nothing | `haiku` | The work is reading long output |
      | `builder` | Writes one independent, fully specified piece of a larger change | `opus` | Writes code that has to be right |
      | `reviewer` | Checks a finished change with fresh eyes; edits nothing | `opus`, high effort | An independent check is only worth having from a strong model |
      | `architect` | Deep analysis of a hard question; runs only when asked for | `fable` | The most capable model, and the most expensive: about 2.5 times the price of Opus per token |

      A model is `haiku`, `sonnet`, `opus` or `fable`, a full model id, or `inherit` to use
      whatever the main session runs on. You cannot see which models the person's plan or
      organisation offers, so ask; not everyone has `fable`, and `inherit` always works. Ask too
      whether the reviewer should run at high effort.

   c. **Should the main session hand work to them without being asked?** If yes, the rules in
      `agents/DELEGATION.md` go into their `~/.claude/CLAUDE.md` (step 6). If no, the agents are
      still there to be asked for by name. Point out one rule in particular before they answer:
      where the architect runs on a dearer model than the reviewer, the rules let the main
      session run a review on that dearer model in three named cases without asking first.

2. **Find the Claude Code CLI the person's sessions use.** Mods need Claude Code 2.1.287 or
   later; these were last checked on 2.1.293.
   - For terminal sessions it is `claude` on the PATH: run `claude --version`.
   - The desktop app runs its own copy, which can be a different version; `/status` in a
     session shows it on its "Claude Code" row. On Windows the copy is
     `%APPDATA%\Claude\claude-code\<version>\<hash>\claude.exe`: take the newest version folder.
     On other systems look for a `claude-code` folder in the app's application data folder, and
     on a remote host the app drives over SSH, under `~/.claude/remote/`. These two places are
     where it has been seen, not documented ones.
   - If you cannot find one, carry on and skip step 7.
   - Where the `CLAUDE_CONFIG_DIR` variable is set, it names the folder to use wherever these
     steps say `~/.claude`.

3. **Put the mod folders somewhere permanent.** Copy the chosen mod folders to `~/claude-mods/`
   (on Windows, `%USERPROFILE%\claude-mods\`), with `README.md` and this file. Do not leave them
   in Downloads or a temporary folder: the settings will point at these paths. If `~/claude-mods`
   already exists, ask before writing into it.

4. **Point the settings at the mods.** The file is `~/.claude/settings.json`.
   - Copy it to `settings.json.before-mods.bak` first. If that backup already exists, keep it and
     use another name. If there is no settings file, create one holding only the `env` block
     below.
   - In its `env` object, set `CLAUDE_CODE_PLUGIN_DIRS` to the absolute path of every chosen mod
     folder, joined by `;` on Windows and `:` on macOS and Linux. If the key is already there,
     add to it rather than replacing it.
   - Set `CLAUDE_CODE_PLUGIN_DIR_WATCH` to `"1"`, so a saved edit to a mod reloads it.
   - Keep every other key as it is. Show the person the change and get a yes before saving.
   - After saving, check the file still parses as JSON. If it does not, restore the backup.

   On macOS or Linux, with two mods shown:

   ```json
   {
     "env": {
       "CLAUDE_CODE_PLUGIN_DIRS": "/Users/sam/claude-mods/hud:/Users/sam/claude-mods/goals",
       "CLAUDE_CODE_PLUGIN_DIR_WATCH": "1"
     }
   }
   ```

   On Windows, write each backslash twice, or the file will not parse:

   ```json
   {
     "env": {
       "CLAUDE_CODE_PLUGIN_DIRS": "C:\\Users\\sam\\claude-mods\\hud;C:\\Users\\sam\\claude-mods\\goals",
       "CLAUDE_CODE_PLUGIN_DIR_WATCH": "1"
     }
   }
   ```

5. **Install the agents, if they were chosen.** They go in `~/.claude/agents/`, one `.md` file
   each. Skip `DELEGATION.md`: it is not an agent.
   - If an agent of the same name is already there, show the person both and ask before
     replacing it. Keep the one replaced beside it as `<name>.md.bak`.
   - In each file's frontmatter, set `model:` to the person's answer. For the reviewer, keep or
     remove the `effort: high` line as they chose.
   - Each agent's `description:` is what the main session reads when deciding whom to call. It
     says nothing of the model; leave it that way.
   - Each agent ends with a paragraph telling it to post its plan with `mcp__agent-deck__plan`,
     and four of them list that tool on their `tools:` line. If the `agent-deck` mod is not
     being installed, remove that paragraph and that tool from each file.

6. **Add the delegation rules, if they said yes to 1c.** `agents/DELEGATION.md` is a template.
   - Fill in each `{{...}}` with the model chosen for that agent, as the person would say it
     ("Haiku", "Opus at high effort"; for `inherit`, "the main session's model"; for a full id,
     the id).
   - One rule is marked optional in the template, with the condition under which it applies.
     Keep or drop it accordingly, and remove the marker.
   - Copy `~/.claude/CLAUDE.md` to `CLAUDE.md.before-agents.bak` beside it; if that backup
     already exists, keep it and use another name. If the file already has a section headed
     "Delegating to subagents", show both and ask whether to replace it; never add a second.
     Otherwise add the section at the end (create the file if there is none). Show the person
     the section and get a yes before saving.

7. **Check each mod.** For every installed folder run `<cli> plugin validate <folder>`, then
   `<cli> plugin test <folder>`. The second runs the mod's own test file.
   - Validation passes with warnings that list the state each mod reads and writes; that is
     expected.
   - The tests pass on Windows and Linux. They have not been run on macOS. If a mod validates
     and a test fails, report which test and carry on: the mod may still load.
   - If `plugin` is not a command this CLI knows, or validation fails, stop and tell the person.
     This build of Claude Code may not have mods, and nothing else here will fix that.
   - If the agents were installed, run `<cli> plugin validate ~/.claude/agents` as well.

8. **Tell the person to start a new session.** Settings and instructions are read when a
   session starts, and a new session is the sure way to get the agents too, so everything
   appears in the next one, not this one. In it they should see one line above the prompt that
   becomes the hud card after the first reply; `/goals`, `/agent-deck`, `/files`, `/replay` and
   `/quick-prompts` should be commands; and asking Claude to "use the scout agent to find where
   X is defined" should start a scout. Say plainly that you have not seen them load.

9. **Report.** Say which mods and agents were installed and where, which model each agent runs
   on, what changed in the settings and instructions files, where the backups are, what the
   checks showed, and anything you skipped.

## Good to know

- **Remote hosts.** A session that runs on another machine over SSH loads that machine's mods,
  agents and instructions. Repeat these steps there if the person wants them in those sessions.
- **Changing a model later.** Edit the `model:` line in `~/.claude/agents/<name>.md`, and the
  matching words in the delegation section, then start a new session.
- **"Dev server down".** The hud looks for a local dev server on the ports in the project's
  `.claude/launch.json`, or on 3000. In a project with no dev server that line always says
  down. It is a status note, not a fault.
- **Making them yours.** `quick-prompts/hooks/prompts.ts` is the list of saved prompts, meant to
  be edited. With the watch setting on, saving a mod's file reloads it.
- **Removing them.** Take these folders out of `CLAUDE_CODE_PLUGIN_DIRS` (delete the key if
  nothing is left, and the watch entry if this install added it), then start a new session.
  Restoring the backup also works, but undoes any other settings change made since. The `~/claude-mods` folder can
  then be deleted, along with what the mods left: `~/.claude/files-folders.json` and the goals
  mod's store under the Claude Code configuration folder. For the agents, delete their five
  files from `~/.claude/agents/` and the delegation section from `~/.claude/CLAUDE.md`.
- **If nothing appears.** Check that the paths in `CLAUDE_CODE_PLUGIN_DIRS` exist and use the
  right separator for the system, and that the session was started after the change. An
  organisation's managed settings, `"disableAllHooks": true` in the settings, or an older
  Claude Code can also keep mods from loading. A WSL session in the desktop app loads no mods,
  and the VS Code panel runs their hooks but draws nothing.
