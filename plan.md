You are working on a new open-source project called "OpenCode Session Summarizer".

IMPORTANT:
Do NOT start coding immediately.
First understand the complete requirements below, inspect the current OpenCode extension/custom-command/plugin mechanisms and the installed/current OpenCode version available in the environment, and then propose the implementation architecture. After that, implement the project incrementally.

============================================================
1. PROJECT IDEA
============================================================

I use OpenCode as my coding agent.

OpenCode is installed through npm and launched globally from the terminal:

    npm install -g opencode-ai

(or whatever the currently correct package/install mechanism is; verify rather than assuming).

I can enter any project/repository:

    cd <project>
    opencode

OpenCode then operates inside that project's working directory.

OpenCode has a built-in:

    /export

command which exports the current session transcript.

The exported session is Markdown/text-oriented and contains the conversation/session history.

The problem is:

OpenCode does not provide the exact persistent "human-readable project memory" workflow I want.

I want to build a custom OpenCode command, initially:

    /summarize

The purpose is NOT simply to summarize source code.

The purpose is to summarize PREVIOUS OPENCODE SESSION TRANSCRIPTS.

============================================================
2. CORE CONCEPT
============================================================

Think of the system like this:

OpenCode session
      |
      | /export
      v
Sessions/
    session123456asd.md
    session987654xyz.md
    ...
      |
      | /summarize
      v
compact persistent project memory

The exported session is the RAW HISTORY.

The summary is the KNOWLEDGE extracted from that history.

The project should therefore help me preserve useful context between OpenCode sessions.

The central concept is:

    /export
        =
    preserve raw session history

    /summarize
        =
    turn raw session history into useful persistent project memory

============================================================
3. VERY IMPORTANT DESIGN DECISION
============================================================

DO NOT make source code files the primary input to /summarize.

For example, I do NOT want the primary workflow to be:

    /summarize -f src/main.py

or:

    /summarize -d src/

The reason is that source code grows continuously.

A project can eventually contain thousands of lines/files and feeding the repository/source tree to an LLM is expensive, unnecessary, and does not necessarily capture the reasoning behind the work.

Instead, the primary input is EXPORTED OPENCODE SESSION MARKDOWN FILES.

For example:

    Sessions/session001.md
    Sessions/session002.md
    Sessions/session003.md

These files contain the actual development conversation/history.

That history contains useful information such as:

- What the user wanted
- What the agent investigated
- What files were changed
- What decisions were made
- What approaches were tried
- What failed
- What errors occurred
- How errors were fixed
- What commands were executed
- What implementation decisions were made
- What remains unfinished
- What the next session should know

This is the information we want to preserve.

============================================================
4. PROJECT-LOCAL SESSIONS DIRECTORY
============================================================

The system should operate relative to the CURRENT WORKING DIRECTORY.

For example:

    C:\Projects\MyProject

may contain:

    MyProject/
    ├── src/
    ├── package.json
    ├── README.md
    └── Sessions/
        ├── session001.md
        ├── session002.md
        └── session003.md

Another project might be:

    D:\College\AmazonML

with:

    AmazonML/
    ├── data/
    ├── src/
    └── Sessions/

The implementation MUST NOT hard-code a project path.

It should dynamically determine the relevant working/project directory.

The Sessions directory belongs to the user's project.

The extension/tool itself should NOT store project summaries in its own installation directory or permanently inside its own package directory.

============================================================
5. INITIAL COMMAND
============================================================

The first command we want is:

    /summarize

The initial goal is to make this work inside OpenCode.

However, do not assume the final implementation mechanism.

First inspect the current OpenCode documentation/source/package structure and determine whether this should be implemented as:

- a custom command
- a plugin
- a command + local helper
- or another supported OpenCode extension mechanism

Prefer official/current OpenCode mechanisms.

Do not invent APIs.

============================================================
6. COMMAND MODES WE WANT
============================================================

Eventually, the command should support these conceptual modes.

A) CURRENT SESSION

    /summarize

This should summarize the current OpenCode session.

The exact mechanism for obtaining the current session should be investigated.

Do NOT assume that the current session transcript is directly available to a custom command unless OpenCode actually exposes it.

If the current session cannot be directly accessed, determine the correct supported mechanism.

------------------------------------------------------------

B) ONE EXPORTED SESSION FILE

Conceptually:

    /summarize -f Sessions/session123.md

Meaning:

    Read this exported OpenCode session Markdown file
    and generate a useful structured summary.

------------------------------------------------------------

C) MULTIPLE SESSION FILES

Conceptually:

    /summarize -f Sessions/session123.md Sessions/session124.md

This should allow multiple exported session files to be combined.

The exact CLI argument syntax can be changed if OpenCode's command parser has better conventions.

Do NOT blindly implement Python-style CLI parsing if OpenCode custom commands do not support it directly.

Determine the correct way to receive arguments from an OpenCode command.

------------------------------------------------------------

D) DIRECTORY OF SESSIONS

Conceptually:

    /summarize -d Sessions/

Meaning:

    Discover the relevant Markdown session files in that directory,
    read/process them,
    and produce a combined summary.

The directory mode is specifically intended for directories containing exported OpenCode session transcripts.

It is NOT primarily intended to scan arbitrary source-code directories.

------------------------------------------------------------

E) OUTPUT PATH

Conceptually:

    /summarize -f Sessions/session123.md -o Sessions/session123-summary.md

or:

    /summarize -d Sessions/ -o Sessions/project-summary.md

The exact syntax can change if OpenCode has a more appropriate argument mechanism.

============================================================
7. SUMMARY OUTPUT
============================================================

The summary should NOT be a generic paragraph.

It should be structured for CONTINUING DEVELOPMENT.

A potential format is:

# Session Summary

## Project / Objective

What was the session trying to accomplish?

## Work Completed

What was actually implemented or accomplished?

## Important Files

Which files were involved or discussed?

Do NOT copy entire source code into the summary.

Only preserve relevant file paths/names and what happened with them.

## Decisions Made

Important architectural or implementation decisions.

## Problems Encountered

Errors, blockers, failed approaches, unexpected behavior.

## Solutions / Fixes

How those problems were resolved.

## Current State

Where the project was left at the end of the session.

## Remaining Work

What still needs to be done.

## Important Context

Any information a future OpenCode session needs to know.

## Commands / Environment

Only preserve commands or environment information when it is actually useful for continuation.

## Next Steps

Concrete unfinished tasks identified by the session.

The exact schema is NOT final.

Design it so it can evolve.

============================================================
8. MOST IMPORTANT GOAL: CONTINUATION MEMORY
============================================================

The summary should answer:

"If I open a completely new OpenCode session tomorrow, what does the new agent need to know so that I can continue working without explaining everything again?"

That is more important than producing a pretty summary.

The system should prioritize:

- decisions
- current state
- unfinished work
- problems
- solutions
- architecture
- important context
- relevant files
- dependencies
- commands
- constraints
- next steps

It should avoid wasting tokens on:

- greetings
- repetitive conversation
- irrelevant chatter
- duplicated explanations
- raw code
- unnecessary logs
- conversational filler

============================================================
9. TOKEN EFFICIENCY
============================================================

Token efficiency is a CORE REQUIREMENT.

Do NOT simply load every file and dump everything into the LLM.

The architecture should separate:

    Input discovery
          |
          v
    Local preprocessing
          |
          v
    Context selection / reduction
          |
          v
    LLM
          |
          v
    Summary

The local program should do as much deterministic work as possible before sending information to the model.

For example:

    Sessions/
       |
       +-- session001.md
       +-- session002.md
       +-- session003.md
       |
       v
    local loader
       |
       v
    parse/clean/organize
       |
       v
    relevant context
       |
       v
    LLM

Do NOT prematurely implement complicated AI retrieval/RAG.

Start simple and measurable.

============================================================
10. ROLLING SUMMARY / PROJECT MEMORY
============================================================

One of the most important future capabilities is:

    OLD SUMMARY + NEW SESSION
             |
             v
        updated summary

For example:

    Sessions/
    ├── session001.md
    ├── session002.md
    ├── session003.md
    └── project-summary.md

Then I complete another OpenCode session:

    /export

and get:

    Sessions/session004.md

I want to eventually be able to do something conceptually like:

    /summarize \
        -f Sessions/project-summary.md Sessions/session004.md \
        -o Sessions/project-summary.md

Meaning:

    previous project memory
            +
    new raw session
            |
            v
    updated project memory

This should not blindly append text.

The model should understand the previous summary and update it with new information.

For example:

Old:

    Current State:
    Candidate blocking implemented.

New session:

    Candidate blocking was modified and recall increased from X to Y.

Updated:

    Current State:
    Candidate blocking was modified.
    Validation recall is now Y.
    Previous implementation details that are no longer relevant should
    be replaced rather than duplicated.

This creates a rolling project memory.

============================================================
11. RAW SESSION VS SUMMARY
============================================================

Do NOT confuse these two concepts.

RAW:

    Sessions/session001.md

contains the exported transcript.

SUMMARY:

    Sessions/session001-summary.md

or:

    Sessions/project-summary.md

contains condensed knowledge.

We should preserve raw exports.

The summarizer should create/update summaries.

It should never silently overwrite raw exported session files.

============================================================
12. FILE NAMING
============================================================

Do not hard-code a naming scheme yet.

Potential examples:

    session123456asd.md

    session123456asd-summary.md

    project-summary.md

The implementation should be designed so naming can be changed later.

If /summarize automatically creates an output file, use a safe deterministic naming strategy.

Never overwrite an existing file unexpectedly.

============================================================
13. SAFETY / FILE HANDLING
============================================================

The tool must:

- validate input paths
- handle missing files gracefully
- handle missing Sessions/ directory
- handle empty files
- handle malformed Markdown
- handle very large session files
- avoid accidentally reading unrelated files
- avoid overwriting raw session exports
- create output directories when appropriate
- provide useful error messages

For directory mode, initially focus on:

    *.md

files.

Do not automatically read:

    *.py
    *.js
    *.ts
    *.json
    *.db
    etc.

unless we explicitly add such functionality later.

============================================================
14. INITIAL VERSION / MILESTONES
============================================================

Do NOT attempt to implement every future feature immediately.

Implement incrementally.

V0:
-----

Prove that a custom OpenCode command can be registered and invoked.

Example:

    /summarize

It can initially return a simple response proving the integration works.

V1:
-----

Accept ONE exported Markdown session:

    /summarize -f Sessions/session001.md

Read the Markdown locally.

Generate a structured summary.

Write the result to an output Markdown file.

V2:
-----

Support multiple session files.

V3:
-----

Support directory mode:

    /summarize -d Sessions/

V4:
-----

Support explicit output path:

    -o <path>

V5:
-----

Support rolling project summary:

    old-summary + new-session -> updated-summary

V6:
-----

Improve context reduction/token efficiency.

V7:
-----

Add additional useful commands ONLY after /summarize is stable.

============================================================
15. DO NOT ADD RANDOM FEATURES
============================================================

For now, DO NOT automatically implement:

- vector databases
- embeddings
- RAG
- complicated agent memory
- database storage
- cloud storage
- GUI
- web dashboard
- authentication
- telemetry
- analytics
- source-code indexing
- automatic Git analysis
- automatic project-wide code understanding

These may become future features.

The first objective is a clean, local, lightweight session summarization tool.

============================================================
16. OPEN-SOURCE PROJECT
============================================================

This will eventually be an open-source project.

Therefore:

- use a clean repository structure
- use TypeScript/JavaScript if appropriate for the OpenCode ecosystem
- keep modules separated
- write readable code
- avoid hard-coded machine-specific paths
- add tests
- add README documentation
- include example usage
- make installation reproducible
- keep configuration minimal

Before choosing TypeScript vs JavaScript or a specific package structure, inspect the current OpenCode plugin/command ecosystem and follow its conventions.

============================================================
17. VERY IMPORTANT: INSPECT BEFORE IMPLEMENTING
============================================================

Before writing implementation code:

1. Determine the installed OpenCode version.

2. Inspect current OpenCode documentation or source/package metadata.

3. Determine:
   - how custom commands are registered
   - how command arguments are passed
   - whether commands can execute local scripts
   - how plugins work
   - whether a plugin can access the current working directory
   - whether a plugin/command can access the current session
   - whether OpenCode exposes session transcript APIs
   - how installation/distribution works

4. Do not assume that an API exists.

5. If something is undocumented or ambiguous, inspect the actual installed package/source where possible.

6. Prefer supported public APIs over internal/private APIs.

============================================================
18. CURRENT USER ENVIRONMENT
============================================================

The user currently runs OpenCode approximately like this:

    npm install
    opencode

Then OpenCode is started from whichever project directory the user is currently working in.

The user's screenshot shows OpenCode version:

    1.18.31

Treat that as the currently observed version, but verify the actual installed version before implementation.

The user is on Windows, so paths and shell behavior need to work on Windows.

However, this project should ideally be cross-platform.

Therefore avoid assumptions such as:

    C:\Users\...

or:

    /home/user/...

Use Node.js path APIs and process.cwd() or the correct OpenCode-provided working-directory mechanism.

============================================================
19. EXPECTED USER WORKFLOW
============================================================

The final workflow should feel like this:

STEP 1:

    cd MyProject

STEP 2:

    opencode

STEP 3:

    Work normally.

STEP 4:

    /export

Save/export the session into:

    MyProject/Sessions/session123.md

STEP 5:

Later, perhaps in another OpenCode session:

    /summarize -f Sessions/session123.md

STEP 6:

The system reads the exported session Markdown.

STEP 7:

It generates:

    Sessions/session123-summary.md

STEP 8:

Later sessions can be summarized or merged into:

    Sessions/project-summary.md

The ultimate goal is that the user can preserve development context across OpenCode sessions without repeatedly feeding huge amounts of source code or old conversation history to the LLM.

============================================================
20. INITIAL DIRECTORY STRUCTURE
============================================================

Start with a clean repository.

A possible initial structure is:

    opencode-session-summarizer/
    ├── README.md
    ├── package.json
    ├── tsconfig.json
    ├── src/
    │   ├── ...
    ├── tests/
    │   ├── ...
    ├── examples/
    │   └── ...
    └── .gitignore

If the correct OpenCode architecture requires a different structure, use that instead.

Do NOT create a fake structure just because it looks nice.

============================================================
21. TESTING STRATEGY
============================================================

Create a small example exported-session Markdown fixture.

For example:

    tests/fixtures/session-example.md

It should contain a realistic fake OpenCode session:

- user objective
- agent reasoning/analysis
- files discussed
- implementation
- error
- fix
- final state
- TODO

Then test that the summarizer produces a structured summary.

Tests should eventually cover:

- one file
- multiple files
- directory
- missing file
- empty file
- invalid path
- output path
- existing output
- rolling summary

Do not require an actual LLM API for unit tests if avoidable.

Separate deterministic file/context processing from the actual model invocation.

============================================================
22. ARCHITECTURE PRINCIPLE
============================================================

Keep these concerns separate:

    COMMAND INTERFACE
          |
          v
    ARGUMENT PARSING
          |
          v
    SESSION DISCOVERY
          |
          v
    MARKDOWN LOADING
          |
          v
    CONTEXT PROCESSING
          |
          v
    SUMMARIZATION ENGINE
          |
          v
    OUTPUT WRITER

This is important because later we may want:

    /summarize
    /summarize -f ...
    /summarize -d ...
    /memory
    /sessions
    /update-summary

without rewriting the underlying session-processing engine.

============================================================
23. IMPORTANT PRODUCT PHILOSOPHY
============================================================

This is NOT intended to be:

"AI summarizes my code."

It is:

"AI preserves the useful knowledge generated during my coding sessions."

The core problem is:

    Long-running coding projects
             +
    many OpenCode sessions
             +
    context loss between sessions
             =
    repeated explanations / lost reasoning

The proposed solution is:

    OpenCode /export
             +
    project-local Sessions/
             +
    /summarize
             =
    persistent, compact project memory

============================================================
24. WHAT I WANT FROM YOU RIGHT NOW
============================================================

Do the following in order:

PHASE A:
Investigate the current OpenCode extension/custom-command/plugin mechanism.

PHASE B:
Explain which mechanism is most appropriate for this project and WHY.

PHASE C:
Create the smallest working V0 implementation.

PHASE D:
Verify that /summarize can actually be invoked inside OpenCode.

PHASE E:
Implement V1 for:

    /summarize -f <session.md>

using a local Markdown fixture first.

PHASE F:
Add tests.

PHASE G:
Document how to install/run the development version.

DO NOT jump directly to directory mode, rolling summaries, RAG, embeddings, or advanced memory.

Build the foundation first.

============================================================
25. FINAL REQUIREMENT
============================================================

Before making architectural decisions, inspect the real OpenCode environment.

Do not tell me:

    "OpenCode probably supports..."

Actually verify it.

If the OpenCode API has changed from what you expect, adapt the implementation to the currently installed version.

If the desired behavior is impossible using a custom command alone, explain the limitation and use the appropriate supported plugin/extension mechanism.

The implementation must be real and runnable, not pseudo-code.

At the end of V0/V1, give me:

1. What architecture was chosen
2. Why it was chosen
3. Files created
4. How the command works
5. How to install/use it locally
6. Example commands
7. Tests created
8. Known limitations
9. What should be implemented next

Again: DO NOT implement everything at once.

Start with investigation → architecture → V0 → V1.