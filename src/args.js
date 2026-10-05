import { SummarizeError } from "./errors.js"

export const USAGE = `Usage:
  /summarize -f <session.md> [more.md ...]
  /summarize -d <sessions-directory>
  /summarize -f <session.md> -o <output.md>

Options:
  -f, --files    exported OpenCode session markdown file(s)
  -d, --dir      directory containing exported session markdown files
  -o, --output   explicit output markdown path (default: <name>-summary.md)
  -h, --help     show this help

Bare paths are treated as session files. Directory mode only reads *.md and
skips artifacts that were already produced by this tool.`

const FILES_FLAGS = new Set(["-f", "--file", "--files"])
const DIR_FLAGS = new Set(["-d", "--dir", "--directory"])
const OUTPUT_FLAGS = new Set(["-o", "--out", "--output"])
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
  const parsed = { files: [], dir: null, output: null, help: false, errors: [] }

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
      'Pass an exported session file with -f Sessions/<name>.md, or a directory with -d Sessions/.',
    )
  }
  if (parsed.files.length > 0 && parsed.dir) {
    throw new SummarizeError(
      "-f/--files and -d/--dir cannot be combined",
      "Pick either explicit session files or a directory of exported sessions.",
    )
  }
}