import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { assertUsableArguments, parseArguments, USAGE } from "./args.js"
import { buildPreparedContext, DEFAULT_MAX_CHARS } from "./context.js"
import { SummarizeError } from "./errors.js"
import { isMemoryDocument, readProjectMemory, separateMemoryInputs, validateSummaryOutput } from "./memory.js"
import { deriveOutputPath, discoverSessionFiles, readSessionFile, resolveAgainst, toRelative } from "./paths.js"
import { renderReport } from "./report.js"

function resolveBudget() {
  const raw = process.env.SUMMARIZE_MAX_CHARS
  if (!raw) return DEFAULT_MAX_CHARS
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_CHARS
}

function resolveInput(cwd, args) {
  const memory = args.memory ? readProjectMemory(cwd, args.memory) : null
  const targets = args.dir ? discoverSessionFiles(cwd, args.dir) : args.files
  const documents = targets.map((target) => readSessionFile(cwd, target))
  // Directory discovery is for raw exports, not implicit memory selection.
  const sessions = args.dir ? documents.filter((document) => !isMemoryDocument(document)) : documents
  return {
    mode: args.dir ? "directory" : "file",
    ...separateMemoryInputs(sessions, memory),
  }
}

export async function run(rawArguments, { cwd = process.cwd(), maxChars = resolveBudget() } = {}) {
  try {
    const args = parseArguments(rawArguments)
    if (args.help) return { status: "HELP", exitCode: 0, text: renderReport({ status: "HELP", error: null }) + `\n${USAGE}` }
    assertUsableArguments(args)

    const input = resolveInput(cwd, args)
    const output = deriveOutputPath({
      cwd,
      inputs: input.documents.map((document) => ({ absolute: document.absolute })),
      directory: args.dir,
      output: args.output,
      memory: input.memory,
    })

    validateSummaryOutput(cwd, output)

    const prepared = buildPreparedContext({
      documents: input.documents,
      outputPath: output.absolute,
      maxChars,
      memory: input.memory,
    })

    fs.mkdirSync(path.dirname(output.absolute), { recursive: true })

    const text = renderReport({
      status: "OK",
      cwd,
      mode: input.memory ? "rolling-memory" : input.mode === "directory" ? "directory" : input.documents.length > 1 ? "multi-file" : "single-file",
      outputPath: output.absolute,
      prepared,
      error: null,
    })

    return { status: "OK", exitCode: 0, text, outputPath: output.absolute, projectRoot: cwd, relativeOutput: toRelative(cwd, output.absolute) }
  } catch (error) {
    const wrapped = error instanceof SummarizeError ? error : new SummarizeError(error.message)
    const text = renderReport({ status: "ERROR", cwd, error: wrapped })
    return { status: "ERROR", exitCode: process.stdout.isTTY ? 1 : 0, text, outputPath: null, projectRoot: cwd, relativeOutput: null }
  }
}

export async function main(rawArguments) {
  const result = await run(rawArguments)
  process.stdout.write(`${result.text}\n`)
  return result.exitCode
}

export function resolveProjectRoot(cwd = process.cwd()) {
  return resolveAgainst(cwd, ".")
}
