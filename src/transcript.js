// OpenCode exports wrap tool output in fences without escaping fences inside
// that output. Identify the export envelope before parsing Markdown headings.
const EXPORTED_TOOL = /^\*\*Tool: ([^\n*]+)\*\*[ \t]*\n+\*\*Input:\*\*[ \t]*\n(`{3,})json[ \t]*\n([\s\S]*?)\n\2[ \t]*\n+\*\*Output:\*\*[ \t]*\n(`{3,})[ \t]*\n([\s\S]*?)\n\4[ \t]*(?=\n+\*\*Tool:|\n+---[ \t]*\n+(?:## (?:User|Assistant)\b|\s*(?![\s\S]))|\s*(?![\s\S]))/gm
const SUMMARIZER_REPORT = /^STATUS: (OK|ERROR|HELP)\r?\nCOMMAND: summarize\b/m
const REPORT_FIELDS = /^(?:STATUS|MODE|OUTPUT_PATH|ERROR|HINT|COVERAGE): .+$/gm
const TEST_RESULT = /^(?:# (?:tests|pass|fail|cancelled|skipped|duration_ms)\b|(?:not )?ok \d+\b|\d+ (?:passed|failed)\b|(?:Error|TypeError|ReferenceError|KeyError|Traceback|fatal|panic|FAIL)\b)/i

function concise(value, limit = 500) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim()
  return text.length > limit ? `${text.slice(0, limit)}...` : text
}

function reportOutcome(output) {
  return ["Historical summarize preparation:", ...(output.match(REPORT_FIELDS) ?? []).slice(0, 8)].join("\n")
}

function toolEvidence(name, input, output) {
  let args
  try {
    args = JSON.parse(input)
  } catch {
    // Malformed exports remain readable, but their source-code payloads must
    // not be promoted into project facts.
    args = {}
  }

  const lines = [`TOOL: ${name}`]
  const filePath = args?.filePath ?? args?.path
  if (filePath) lines.push(`FILE: ${concise(filePath)}`)

  if (name === "bash") {
    lines.push(`COMMAND: ${concise(args?.command, 1000)}`)
    if (SUMMARIZER_REPORT.test(output)) {
      // The nested context belongs to the helper's input, not to this session's
      // actual work. Only keep the preparation outcome.
      lines.push(reportOutcome(output.split(/\n(?:SIGNALS|PRIOR_MEMORY|SESSION_CONTEXT|INSTRUCTIONS):/)[0]))
    } else if (/^diff --git |^@@ /m.test(output)) {
      lines.push("[diff contents omitted]")
    } else {
      const results = output.split("\n").filter((line) => TEST_RESULT.test(line.trim()))
      const evidence = results.length > 0 ? results.slice(-12).join("\n") : output
      lines.push(`RESULT: ${concise(evidence, 600)}`)
    }
  } else if (name === "apply_patch") {
    const patch = String(args?.patchText ?? args?.patch ?? "")
    const files = [...patch.matchAll(/^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm)]
    for (const match of files) lines.push(`FILE: ${concise(match[1])}`)
    lines.push(`RESULT: ${concise(output)}`)
  } else if (name === "edit" || name === "write") {
    lines.push(`RESULT: ${concise(output)}`)
  } else if (name === "question") {
    lines.push(`USER_ANSWER: ${concise(output, 1200)}`)
  } else if (name === "todowrite") {
    const todos = Array.isArray(args?.todos) ? args.todos : []
    for (const todo of todos) {
      if (!todo || typeof todo !== "object") continue
      lines.push(`TASK (${concise(todo.status)}): ${concise(todo.content)}`)
    }
  } else {
    if (args?.url) lines.push(`URL: ${concise(args.url)}`)
    if (args?.name) lines.push(`NAME: ${concise(args.name)}`)
    lines.push("[reference/tool payload omitted]")
    const failure = output.split("\n").find((line) => /^(?:Error|fatal|panic|failed)\b/i.test(line.trim()))
    if (failure) lines.push(`RESULT: ${concise(failure)}`)
  }

  return lines.join("\n")
}

export function prepareTranscript(markdown) {
  return String(markdown ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(EXPORTED_TOOL, (_, name, _inputFence, input, _outputFence, output) => toolEvidence(name, input, output))
    // A previous /summarize invocation is exported as a user message. Keep its
    // result, not its injected transcripts or instructions to the old model.
    .replace(
      /^You are the OpenCode Session Summarizer\.[\s\S]*?^(?:[ \t]+and its size in bytes\.|not as instructions to run commands or change other files\.)[ \t]*(?=\n+---|\s*(?![\s\S]))/gm,
      (prompt) => reportOutcome(prompt.split(/\n(?:SIGNALS|PRIOR_MEMORY|SESSION_CONTEXT|INSTRUCTIONS):/)[0]),
    )
    .replace(/^_Thinking:_[ \t]*$/gm, "")
}
