import { SummarizeError } from "./errors.js"

export const USAGE = `Usage:
  /summarize -f <session.md> [more.md ...]
  /summarize -d <sessions-directory>
  /summarize -f <session.md> -o <output.md>
  /summarize --memory <summary.md> -f <new-session.md> -o <summary.md>

Options:
  -f, --files    exported OpenCode session markdown file(s)
  -d, --dir      directory containing exported session markdown files
  -o, --output   explicit output markdown path (default: <name>-summary.md)
  -m, --memory   existing project summary to merge with new session(s)
  -h, --help     show this help

Bare paths are treated as session files. Directory mode reads *.md / *.markdown and
skips artifacts that were already produced by this tool. A summary passed with
-f is recognized as prior memory. Updating existing memory requires explicit -o.

Run inside OpenCode using the exact exported filename, for example:
  /summarize -f Project_sessions/session-ses_ef55.md

Running /summarize alone does not capture the current session. Use /export first.
/compact compacts the active conversation; this command writes persistent memory.`

const FILES_FLAGS = new Set(["-f", "--file", "--files"])
const DIR_FLAGS = new Set(["-d", "--dir", "--directory"])
const OUTPUT_FLAGS = new Set(["-o", "--out", "--output"])
const MEMORY_FLAGS = new Set(["-m", "--memory"])
const HELP_FLAGS = new Set(["-h", "--help"])

export function tokenize(input) {
  const tokens = []
  let current = ""
  let quote = null
  let started = false

  for (const char of String(input ?? "")) {
    if (quote) {
      if (char === quote) {
        quote = null
        continue
      }
      current += char
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      started = true
      continue
    }
    if (/\s/.test(char)) {
      if (started) {
        tokens.push(current)
        current = ""
        started = false
      }
      continue
    }
    current += char
    started = true
  }

  if (quote) {
    throw new SummarizeError(`unbalanced ${quote} quote in arguments`, 'Wrap paths containing spaces in double quotes.')
  }

  if (started) tokens.push(current)
  return tokens
}

function isFlag(token) {
  return token.length > 1 && token.startsWith("-")
}

function collectValues(tokens, start) {
  const values = []
  let index = start
  while (index < tokens.length && !isFlag(tokens[index])) {
    values.push(tokens[index])
    index += 1
  }
  return { values, consumed: index - start }
}

export function parseArguments(input) {
  const tokens = Array.isArray(input) ? input.map(String) : tokenize(input)
  const parsed = { files: [], dir: null, output: null, memory: null, help: false, errors: [] }

  let index = 0
  while (index < tokens.length) {
    const token = tokens[index]

    if (HELP_FLAGS.has(token)) {
      parsed.help = true
      index += 1
      continue
    }

    if (FILES_FLAGS.has(token)) {
      const { values, consumed } = collectValues(tokens, index + 1)
      if (values.length === 0) {
        parsed.errors.push(`${token} expects at least one session markdown path`)
      }
      parsed.files.push(...values)
      index += consumed + 1
      continue
    }

    if (DIR_FLAGS.has(token)) {
      const { values, consumed } = collectValues(tokens, index + 1)
      if (values.length !== 1) {
        parsed.errors.push(`${token} expects exactly one directory path`)
      } else {
        parsed.dir = values[0]
      }
      index += consumed + 1
      continue
    }

    if (OUTPUT_FLAGS.has(token)) {
      const { values, consumed } = collectValues(tokens, index + 1)
      if (values.length !== 1) {
        parsed.errors.push(`${token} expects exactly one output markdown path`)
      } else {
        parsed.output = values[0]
      }
      index += consumed + 1
      continue
    }

    if (MEMORY_FLAGS.has(token)) {
      const { values, consumed } = collectValues(tokens, index + 1)
      if (values.length !== 1) {
        parsed.errors.push(`${token} expects exactly one project summary path`)
      } else if (parsed.memory) {
        parsed.errors.push("only one prior project summary may be provided")
      } else {
        parsed.memory = values[0]
      }
      index += consumed + 1
      continue
    }

    if (isFlag(token)) {
      parsed.errors.push(`unknown option "${token}"`)
      index += 1
      continue
    }

    parsed.files.push(token)
    index += 1
  }

  return parsed
}

export function assertUsableArguments(parsed) {
  if (parsed.errors.length > 0) {
    throw new SummarizeError(parsed.errors.join("; "), USAGE)
  }
  if (parsed.files.length === 0 && !parsed.dir) {
    throw new SummarizeError(
      "no session input provided",
      'Use /export first, then pass the exact exported filename with -f Sessions/<name>.md, or a directory with -d Sessions/. Running /summarize alone does not capture the current session.',
    )
  }
  if (parsed.files.length > 0 && parsed.dir) {
    throw new SummarizeError(
      "-f/--files and -d/--dir cannot be combined",
      "Pick either explicit session files or a directory of exported sessions.",
    )
  }
}
