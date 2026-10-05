# OpenCode Session Summarizer

Turn **exported OpenCode session transcripts** into compact, persistent project
memory, so a brand new OpenCode session can continue your work without you
re-explaining everything.

This is not "AI summarizes my code". It is:

```
OpenCode /export  ->  Sessions/session123.md  ->  /summarize  ->  Sessions/session123-summary.md
```

## Verified environment

OpenCode integration was originally verified on Windows. The rolling-memory
helper and automated tests are also verified on Linux using:

| Component  | Version                            |
| ---------- | ---------------------------------- |
| opencode-ai| `1.18.34`                          |
| Node.js    | `22.23.3`                          |

No build step, no bundler, no runtime dependencies. Plain ESM runs on both Node
and Bun.

## Architecture

```
/summarize -f Sessions/session001.md
        |
        v
.opencode/commands/summarize.md      <- OpenCode custom command (official mechanism)
        |  !`node .opencode/scripts/summarize-prepare.mjs "$ARGUMENTS"`
        v
local helper (deterministic, no LLM)
  1. parse arguments
  2. validate paths, refuse unsafe writes
  3. discover / read session markdown and optional prior memory
  4. reduce exported tool payloads to evidence; split transcript outside code fences
  5. preserve full prior memory; score/filter new transcript context within budget
  6. extract signals (files, errors, commands, open items)
  7. choose a safe output path
        |
        v
report on stdout (STATUS / OUTPUT_PATH / SIGNALS / PRIOR_MEMORY / SESSION_CONTEXT / INSTRUCTIONS)
        |
        v
the current OpenCode model writes or updates the summary at OUTPUT_PATH
```

Why a custom command and not a plugin? OpenCode's documented slash-command
mechanism is `.opencode/commands/*.md`, and those templates officially support
`$ARGUMENTS` plus shell output injection (`` !`command` ``). Plugins can add
tools and hooks, but there is no public API for registering a slash command, so
a custom command is the supported path for `/summarize`. Everything expensive,
repetitive, and safety-critical stays in local deterministic code; the model is
only used for the part that genuinely needs a model.

The command is explicitly assigned to OpenCode's `build` agent because it must
write the generated Markdown file. This matters when the current conversation is
using the read-only `plan` agent: the helper can prepare a report there, but the
summary cannot be written until the command runs with an editing agent.

## Install

From this repository, install the command into any project:

```bash
npm run install:command -- C:/path/to/YourProject
```

That writes a self-contained bundle:

```
YourProject/.opencode/
├── commands/summarize.md
└── summarizer/
    ├── scripts/summarize-prepare.mjs
    └── src/*.js
```

Then:

```bash
cd YourProject
opencode
```

No global install and no `opencode.json` change is required.
After installing or updating the command, quit and restart OpenCode so it loads
the new command template and its `build` agent assignment.

## Usage

Inside OpenCode:

```
/summarize -f Sessions/session001.md
/summarize -f Sessions/session001.md Sessions/session002.md
/summarize -d Sessions
/summarize -f Sessions/session001.md -o Sessions/project-summary.md
/summarize --memory Sessions/project-summary.md -f Sessions/session004.md -o Sessions/project-summary.md
/summarize --help
```

For example, if your exported file is named
`Project_sessions/session-ses_123.md`, run this inside OpenCode:

```text
/summarize -f Project_sessions/session-ses_123.md -o Project_sessions/session-ses_123-summary.md
```

The input filename must match exactly. `/summarize` by itself does not capture
the current conversation; use `/export` first, then pass the exported Markdown
file with `-f` (or its containing directory with `-d`).

### `/summarize` and `/compact`

| Command | Purpose |
| --- | --- |
| `/compact` | Shorten the active conversation's context so that session can continue. |
| This project's `/summarize -f ...` | Write a structured, project-local Markdown memory file from exported sessions. |
| `/summarize --memory ... -f ... -o ...` | Merge new exports into existing persistent project memory. |

OpenCode also uses `/summarize` as a built-in alias for `/compact`. Installing
this custom command overrides that name for the project; use `/compact` for
active-session compaction.

The custom command's expanded prompt and helper report may appear in the
conversation. `STATUS: OK` means the inputs are prepared, not that a summary has
already been saved. The command then writes the file and confirms its output
path. It runs with the `build` agent even when invoked from a Plan conversation.

After generating memory, start a fresh OpenCode session and reference it:

```text
Read @Project_sessions/session-ses_123-summary.md and continue with its next steps.
```

If an older command still says it cannot write in Plan mode, quit and restart
OpenCode after updating the command. If a file is missing, check its exact name:
for the original example export, use `Project_sessions/session-ses_ef55.md`,
with `ses_`, not `sess_`.

| Flag                | Meaning                                                        |
| ------------------- | -------------------------------------------------------------- |
| `-f`, `--files`     | One or more exported session `.md` files (bare paths also work) |
| `-d`, `--dir`       | Directory of exported sessions; reads `*.md` / `*.markdown`     |
| `-o`, `--output`    | Explicit output path                                            |
| `-m`, `--memory`    | Existing summary to update using new raw session exports        |
| `-h`, `--help`      | Usage                                                           |

Default output naming:

| Input                                | Output                        |
| ------------------------------------ | ----------------------------- |
| one file                             | `<name>-summary.md` next to it |
| several files, or a directory        | `project-summary.md` in that directory |
| prior memory + new session(s)        | `project-summary.md` next to the prior memory |

You can also run the helper directly, which is handy for debugging:

```bash
node .opencode/summarizer/scripts/summarize-prepare.mjs -f Sessions/session001.md
```

### Rolling project memory

First, generate your initial memory:

```text
/summarize -f Sessions/session001.md -o Sessions/project-summary.md
```

After exporting a new session, update that memory:

```text
/summarize --memory Sessions/project-summary.md -f Sessions/session004.md -o Sessions/project-summary.md
```

The original planned syntax also works:

```text
/summarize -f Sessions/project-summary.md Sessions/session004.md -o Sessions/project-summary.md
```

You can combine multiple new exports, use a directory containing new exports,
or write the updated memory to a different file:

```text
/summarize -m Sessions/project-summary.md -f Sessions/session004.md Sessions/session005.md -o Sessions/project-summary.md
/summarize -m Sessions/project-summary.md -d Sessions/new -o Sessions/project-summary.md
/summarize -m Sessions/project-summary.md -f Sessions/session004.md -o Archive/project-summary.md
```

- Only one prior summary and at least one new raw session are allowed.
- Prior memory must start with `# Session Summary` or `# Project Summary` and
  contain summary content. Filenames alone do not authorize replacing a file.
- With `-f`, summaries are recognized by their heading or validated when their
  name matches `*-summary.md` / `*-summary.markdown`. Use `--memory` to identify
  prior memory explicitly, including custom-named summaries.
- The helper emits the complete prior summary in `PRIOR_MEMORY` and only new
  transcript material in `SESSION_CONTEXT`.
- The model is instructed to preserve relevant decisions and unresolved tasks,
  replace stale facts, move completed tasks out of remaining work, and
  deduplicate the result into one self-contained summary.
- Supply new session files in chronological order. Directory mode uses filename
  order, so use sortable filenames and a directory containing the new exports.
  Ambiguous contradictions should be recorded rather than guessed away.
- Updating an existing file requires an explicit `-o`; providing `--memory`
  alone does not authorize replacing the default output.

`tests/fixtures/prior-memory.md` and `tests/fixtures/session-followup.md` show
the inputs. `examples/session-followup-summary.md` illustrates the expected
updated memory: recall changes to 0.81, completed tasks are removed from remaining
work, and cache invalidation/profiling remain open.

### Output safety

- Only `.md` / `.markdown` files are accepted as input.
- Directory mode skips hidden files, `*-summary.md` / `*-summary.markdown`, and
  custom-named files whose first heading identifies a summary. Prior memory is
  selected explicitly with `--memory`, not automatically from a directory.
- Raw exports are never overwritten. Writing a summary over an input file is a
  hard error.
- An existing default output is never silently replaced; pass `-o` explicitly.
  Existing explicit outputs must be recognized summaries, not raw transcripts.
  Symbolic-link outputs and aliases of raw input files are rejected.
- Missing files, missing directories, empty files, and unreadable paths produce
  a `STATUS: ERROR` report and nothing is written.
- Missing output directories are created for you.

### Token efficiency

Before scoring or extracting signals, the helper replaces exported file reads,
source-code edits, documentation, and nested summarizer reports with concise
tool evidence. It retains paths, executed commands, test outcomes, task states,
and user answers. This keeps quoted test-fixture metrics and tasks from becoming
facts about the project being summarized. Markdown headings inside fenced
blocks are not treated as conversation boundaries.

`SUMMARIZE_MAX_CHARS` controls the context budget (default `12000`):

```bash
# Set the environment before launching OpenCode (Bash):
SUMMARIZE_MAX_CHARS=20000 opencode
```

```powershell
# PowerShell:
$env:SUMMARIZE_MAX_CHARS = "20000"
opencode
```

In rolling mode, the full prior memory and selected new transcript blocks share
this budget. Prior memory is never silently truncated: if it fills the budget,
the helper returns an error asking you to raise the limit or shorten the memory.
The budget measures context characters, not exact tokens or total prompt size;
report metadata, signals, and instructions add overhead.

The report includes a `COVERAGE:` line so you can see how much was dropped:

```
COVERAGE: files=1 rawChars=2418 blocks=11 kept=11 droppedFiller=0 droppedOverBudget=0 contextChars=2398 budgetChars=12000 memoryChars=0 sessionContextChars=2398
```

## Summary schema

The generated summary is structured for continuation, not for prose:

```
# Session Summary
## Project / Objective
## Work Completed
## Current State
## Decisions Made
## Important Files
## Problems Encountered
## Solutions / Fixes
## Remaining Work
## Important Context
## Commands / Environment
## Next Steps
```

The schema lives in `src/report.js` (`SUMMARY_SECTIONS`) and is rendered into
the prompt, so it can evolve without touching the pipeline. A real example
produced from `tests/fixtures/session-example.md` is in
`examples/session-example-summary.md`.

## Tests

```bash
npm test
```

Tests require no LLM and no network. They cover argument parsing, validation,
discovery, output derivation, context reduction, signal extraction, error
reporting, rolling-memory preparation, strict shared budgets, raw-file
preservation, and an install-and-run of the standalone bundle. They verify the
command's Build-agent routing, fence-aware parsing, quoted-payload exclusion,
context and merge instructions; the semantic summary/update is performed by the
current OpenCode model.

## Current status

Done: V0–V4 (command registration, single file, multiple files, directory,
explicit output) and V5 (rolling `old summary + new session -> updated summary`).
V0 command registration was verified with `opencode debug config`.

Export-aware reduction is implemented: tool-payload preprocessing, fence-aware
blocks, filler filtering, and shared budgets.
Not done yet: `/summarize` current-session mode, configurable schema, and more
advanced context selection (V6).
No vector database, embeddings, RAG, database, GUI, or telemetry.

## License

MIT
