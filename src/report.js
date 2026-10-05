export const SUMMARY_SECTIONS = [
  { title: "Project / Objective", guidance: "What the session was trying to accomplish, in the user's terms." },
  { title: "Work Completed", guidance: "What was actually implemented, changed, or verified." },
  { title: "Current State", guidance: "Where the project was left at the end of the session." },
  { title: "Decisions Made", guidance: "Architectural or implementation decisions and the reason for each." },
  { title: "Important Files", guidance: "File paths only, plus what happened to each. Never paste source code." },
  { title: "Problems Encountered", guidance: "Errors, blockers, and approaches that failed." },
  { title: "Solutions / Fixes", guidance: "How each problem was resolved." },
  { title: "Remaining Work", guidance: "Unfinished tasks, known gaps, and blocked items." },
  { title: "Important Context", guidance: "Constraints, dependencies, and anything a fresh session must know to continue." },
  { title: "Commands / Environment", guidance: "Only commands and environment facts that matter for continuing." },
  { title: "Next Steps", guidance: "Concrete ordered follow-ups a new session can start with." },
]

export function renderInstructions({ outputPath, documents }) {
  const sectionList = SUMMARY_SECTIONS.map((section) => `- ## ${section.title}\n  ${section.guidance}`).join("\n")
  const inputs = documents.map((document) => `- ${document.path}`).join("\n")

  return [
    "Write a continuation-focused summary using exactly this section order:",
    "",
    sectionList,
    "",
    "Rules:",
    "- Omit a section only when the session provides no information for it.",
    "- Use bullet points. Keep each bullet to one line where possible.",
    "- Preserve concrete facts: file paths, commands, error names, numbers, versions.",
    "- Drop greetings, acknowledgements, repeated explanations, tool logs, and raw code.",
    "- Never invent information that is absent from SESSION_CONTEXT.",
    "",
    "Output requirements:",
    `- Write the summary Markdown to: ${outputPath}`,
    "- Start the file with a level-1 heading: # Session Summary",
    "- Do not modify the raw session files:",
    inputs,
    "- Do not modify any file other than the output path above.",
    "- After writing, reply with one confirmation line naming the output path and its size in bytes.",
  ].join("\n")
}

export function renderReport({ status, cwd, mode, outputPath, prepared, error }) {
  const lines = [`STATUS: ${status}`, "COMMAND: summarize"]

  if (status === "ERROR") {
    lines.push(`ERROR: ${error.message}`)
    if (error.hint) lines.push(`HINT: ${error.hint}`)
    lines.push("No files were read for summarization and nothing was written.")
    return lines.join("\n")
  }

  if (status === "HELP") return lines.join("\n")

  lines.push(`MODE: ${mode}`)
  lines.push(`PROJECT_ROOT: ${cwd}`)
  lines.push(`OUTPUT_PATH: ${outputPath}`)
  lines.push("INPUT_FILES:")
  for (const document of prepared.documents) lines.push(`  - ${document.path}`)
  lines.push(
    `COVERAGE: files=${prepared.documents.length} rawChars=${prepared.rawChars} blocks=${prepared.blocks.total} kept=${prepared.blocks.kept} droppedFiller=${prepared.blocks.droppedFiller} droppedOverBudget=${prepared.blocks.droppedOverBudget} contextChars=${prepared.contextChars} budgetChars=${prepared.maxChars}`,
  )

  const { signals } = prepared
  lines.push("SIGNALS:")
  const groups = [
    ["FILES_MENTIONED", signals.filesMentioned],
    ["ERRORS", signals.errors],
    ["COMMANDS", signals.commands],
    ["OPEN_ITEMS", signals.openItems],
  ]
  let hasSignals = false
  for (const [label, values] of groups) {
    if (!values || values.length === 0) continue
    hasSignals = true
    lines.push(`  ${label}:`)
    for (const value of values) lines.push(`    - ${value}`)
  }
  if (!hasSignals) lines.push("  (none detected)")

  lines.push("", "SESSION_CONTEXT:", "<<<SESSION_CONTEXT")
  for (const block of prepared.context) lines.push(block, "")
  lines.push("SESSION_CONTEXT>>>", "")
  lines.push("INSTRUCTIONS:")
  lines.push(renderInstructions({ outputPath, documents: prepared.documents }))

  return lines.join("\n")
}