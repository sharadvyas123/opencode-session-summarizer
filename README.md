# OpenCode Session Summarizer

Turn **exported OpenCode session transcripts** into compact, persistent project
memory, so a brand new OpenCode session can continue your work without you
re-explaining everything.

This is not "AI summarizes my code". It is:

```
OpenCode /export  ->  Sessions/session123.md  ->  /summarize  ->  Sessions/session123-summary.md
```

## Verified environment

Built and verified against the versions actually installed on this machine:

| Component  | Version                            |
| ---------- | ---------------------------------- |
| opencode-ai| `1.18.34` (npm global, Windows)    |
| Node.js    | `22.x`                             |

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
  3. discover / read session markdown
  4. split transcript into blocks
  5. score, filter, truncate -> token-efficient context
  6. extract signals (files, errors, commands, open items)
  7. choose a safe output path
        |
        v
report on stdout (STATUS / OUTPUT_PATH / SIGNALS / SESSION_CONTEXT / INSTRUCTIONS)
        |
        v
the current OpenCode model writes the summary to OUTPUT_PATH
```

Why a custom command and not a plugin? OpenCode's documented slash-command
mechanism is `.opencode/commands/*.md`, and those templates officially support
`$ARGUMENTS` plus shell output injection (`` !`command` ``). Plugins can add
tools and hooks, but there is no public API for registering a slash command, so
a custom command is the supported path for `/summarize`. Everything expensive,
repetitive, and safety-critical stays in local deterministic code; the model is
only used for the part that genuinely needs a model.

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

## Usage

Inside OpenCode:

```
/summarize -f Sessions/session001.md
/summarize -f Sessions/session001.md Sessions/session002.md
/summarize -d Sessions
/summarize -f Sessions/session001.md -o Sessions/project-summary.md
/summarize --help
```

| Flag                | Meaning                                                        |
| ------------------- | -------------------------------------------------------------- |
| `-f`, `--files`     | One or more exported session `.md` files (bare paths also work) |
| `-d`, `--dir`       | Directory of exported sessions; reads `*.md` only              |
| `-o`, `--output`    | Explicit output path                                            |
| `-h`, `--help`      | Usage                                                           |

Default output naming:

| Input                                | Output                        |
| ------------------------------------ | ----------------------------- |
| one file                             | `<name>-summary.md` next to it |
| several files, or a directory        | `project-summary.md` in that directory |

You can also run the helper directly, which is handy for debugging:

```bash
node .opencode/summarizer/scripts/summarize-prepare.mjs -f Sessions/session001.md
```

### Output safety

- Only `.md` / `.markdown` files are accepted as input.
- Directory mode skips hidden files and any `*-summary.md` / `project-summary.md`
  this tool already produced, so summaries are never re-summarized.
- Raw exports are never overwritten. Writing a summary over an input file is a
  hard error.
- An existing default output is never silently replaced; pass `-o` explicitly.
- Missing files, missing directories, empty files, and unreadable paths produce
  a `STATUS: ERROR` report and nothing is written.
- Missing output directories are created for you.

### Token efficiency

`SUMMARIZE_MAX_CHARS` controls the context budget (default `12000`):

```bash
SUMMARIZE_MAX_CHARS=20000 /summarize -d Sessions
```

The report includes a `COVERAGE:` line so you can see how much was dropped:

```
COVERAGE: files=1 rawChars=2418 blocks=11 kept=11 droppedFiller=0 droppedOverBudget=0 contextChars=2398 budgetChars=12000
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

55 tests, no LLM and no network required. They cover argument parsing,
validation, discovery, output derivation, context reduction, signal extraction,
error reporting, and a full install-and-run of the installed bundle.

## Current status

Done: V0 (command registration verified with `opencode debug config`) and V1
(single file, multi file, directory, explicit output, safety rails).

Not done yet: rolling `old summary + new session -> updated summary`, the
`/summarize` current-session mode, configurable schema, and smarter reduction.
No vector database, embeddings, RAG, database, GUI, or telemetry.

## License

MIT