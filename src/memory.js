import fs from "node:fs"
import { SummarizeError } from "./errors.js"
import { isSameFile, isSummaryArtifact, readMarkdownFile } from "./paths.js"

// Both headings are reserved for summaries; exported transcripts use their own titles.
const SUMMARY_TITLE = /^# (Session Summary|Project Summary)$/i

export function isMemoryDocument(document) {
  const firstLine = document.content.trim().split(/\r?\n/, 1)[0].trim()
  return SUMMARY_TITLE.test(firstLine)
}

export function assertProjectMemory(document) {
  if (!isMemoryDocument(document)) {
    throw new SummarizeError(
      `not a project summary: ${document.relative}`,
      "Prior memory must start with # Session Summary or # Project Summary. Pass raw exports as session inputs instead.",
    )
  }
  if (!document.content.trim().split(/\r?\n/).slice(1).join("\n").trim()) {
    throw new SummarizeError(
      `project summary has no content: ${document.relative}`,
      "Generate a summary containing project context before using it as prior memory.",
    )
  }
  return document
}

export function readProjectMemory(cwd, target) {
  return assertProjectMemory(readMarkdownFile(cwd, target, {
    label: "project memory file",
    missingHint: "Generate a summary first, or check the --memory path.",
    emptyHint: "Prior memory must contain an existing summary. Generate one from a raw session first.",
  }))
}

export function separateMemoryInputs(documents, memory = null) {
  const sessions = []
  for (const document of documents) {
    if (isMemoryDocument(document) || isSummaryArtifact(document.absolute)) {
      assertProjectMemory(document)
      if (memory) {
        throw new SummarizeError(
          "only one prior project summary may be provided",
          "Pass one summary using --memory or -f, plus the new raw session exports.",
        )
      }
      memory = document
    } else {
      sessions.push(document)
    }
  }

  if (sessions.length === 0) {
    throw new SummarizeError("no new session input provided", "Pass at least one raw session with -f, or a directory of new sessions with -d.")
  }
  if (memory && sessions.some((document) => isSameFile(document.absolute, memory.absolute))) {
    throw new SummarizeError("prior memory cannot also be a raw session input")
  }
  return { documents: sessions, memory }
}

export function validateSummaryOutput(cwd, output) {
  if (output.exists) {
    // Explicit -o authorizes replacing a summary, never an existing raw export.
    readProjectMemory(cwd, output.absolute)
  }
  if (fs.lstatSync(output.absolute, { throwIfNoEntry: false })?.isSymbolicLink()) {
    throw new SummarizeError("output path must not be a symbolic link", "Choose a regular Markdown file for the summary output.")
  }
}
