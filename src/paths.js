import fs from "node:fs"
import path from "node:path"
import { SummarizeError } from "./errors.js"

const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"])
const SUMMARY_ARTIFACT = /(^|-)summary\.(md|markdown)$/i
const PROJECT_SUMMARY_NAME = "project-summary.md"
const EMPTY_FILE_BYTES = 0

export function isMarkdownPath(target) {
  return MARKDOWN_EXTENSIONS.has(path.extname(target).toLowerCase())
}

export function isSummaryArtifact(target) {
  return SUMMARY_ARTIFACT.test(path.basename(target))
}

export function resolveAgainst(cwd, target) {
  return path.resolve(cwd, target)
}

export function toRelative(cwd, target) {
  const relative = path.relative(cwd, target)
  return relative === "" ? "." : relative.split(path.sep).join("/")
}

export function readMarkdownFile(cwd, target, { label, missingHint, emptyHint }) {
  const absolute = resolveAgainst(cwd, target)

  if (!isMarkdownPath(absolute)) {
    throw new SummarizeError(
      `${toRelative(cwd, absolute)} is not a markdown file`,
      "Use a .md or .markdown file.",
    )
  }

  let stats
  try {
    stats = fs.statSync(absolute)
  } catch {
    throw new SummarizeError(
      `${label} not found: ${toRelative(cwd, absolute)}`,
      missingHint,
    )
  }

  if (!stats.isFile()) {
    throw new SummarizeError(`${toRelative(cwd, absolute)} is not a file`, "Provide a Markdown file path.")
  }

  if (stats.size === EMPTY_FILE_BYTES) {
    throw new SummarizeError(
      `${label} is empty: ${toRelative(cwd, absolute)}`,
      emptyHint,
    )
  }

  const content = fs.readFileSync(absolute, "utf8")
  if (!content.trim()) {
    throw new SummarizeError(`${label} is empty: ${toRelative(cwd, absolute)}`, emptyHint)
  }

  return { absolute, relative: toRelative(cwd, absolute), bytes: stats.size, content }
}

export function readSessionFile(cwd, target) {
  return readMarkdownFile(cwd, target, {
    label: "session file",
    missingHint: "Check the path, or run /export first and save the session into the project's Sessions/ directory.",
    emptyHint: "Nothing to summarize. Re-export the session or pick a different file.",
  })
}

export function isSameFile(left, right) {
  if (path.resolve(left) === path.resolve(right)) return true
  if (!fs.existsSync(left) || !fs.existsSync(right)) return false
  if (fs.realpathSync(left) === fs.realpathSync(right)) return true
  const leftStats = fs.statSync(left)
  const rightStats = fs.statSync(right)
  return leftStats.ino !== 0 && leftStats.dev === rightStats.dev && leftStats.ino === rightStats.ino
}

export function discoverSessionFiles(cwd, directory) {
  const absolute = resolveAgainst(cwd, directory)

  let entries
  try {
    entries = fs.readdirSync(absolute, { withFileTypes: true })
  } catch {
    throw new SummarizeError(
      `sessions directory not found: ${toRelative(cwd, absolute)}`,
      "Create it, or pass -f with an explicit session file path.",
    )
  }

  if (!fs.statSync(absolute).isDirectory()) {
    throw new SummarizeError(
      `${toRelative(cwd, absolute)} is not a directory`,
      "Use -f to summarize a single exported session file.",
    )
  }

  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith("."))
    .filter((name) => isMarkdownPath(name))
    .filter((name) => !isSummaryArtifact(name))
    .sort((left, right) => left.localeCompare(right))

  if (files.length === 0) {
    throw new SummarizeError(
      `no exported session markdown files found in ${toRelative(cwd, absolute)}`,
      "Directory mode reads *.md / *.markdown files and skips summaries this tool already wrote.",
    )
  }

  return files.map((name) => path.join(absolute, name))
}

export function deriveOutputPath({ cwd, inputs, directory, output, memory = null }) {
  const inputPaths = inputs.map((input) => resolveAgainst(cwd, input.absolute))

  if (output) {
    const explicit = resolveAgainst(cwd, output)
    if (!isMarkdownPath(explicit)) {
      throw new SummarizeError(`output path must be a markdown file: ${toRelative(cwd, explicit)}`)
    }
    if (inputPaths.some((input) => isSameFile(input, explicit))) {
      throw new SummarizeError(
        "refusing to write the summary over a raw session export",
        "Choose a different -o path so the raw transcript is preserved.",
      )
    }
    return { absolute: explicit, explicit: true, exists: fs.existsSync(explicit) }
  }

  const directoryMode = Boolean(directory)
  const singleFile = !memory && !directoryMode && inputPaths.length === 1
  const outputDirectory = memory
    ? path.dirname(memory.absolute)
    : directoryMode ? resolveAgainst(cwd, directory) : path.dirname(inputPaths[0])
  const derived = singleFile
    ? inputPaths[0].slice(0, -path.extname(inputPaths[0]).length) + "-summary.md"
    : path.join(outputDirectory, PROJECT_SUMMARY_NAME)

  if (inputPaths.some((input) => isSameFile(input, derived))) {
    throw new SummarizeError(
      "refusing to write the summary over a raw session export",
      "Choose a different output path so the raw transcript is preserved.",
    )
  }

  if (fs.existsSync(derived)) {
    throw new SummarizeError(
      `output file already exists: ${toRelative(cwd, derived)}`,
      "Pass -o <path> to write somewhere else. Existing summaries are never overwritten by default.",
    )
  }

  return { absolute: derived, explicit: false, exists: false }
}
