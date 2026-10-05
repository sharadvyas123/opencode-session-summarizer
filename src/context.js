import { SummarizeError } from "./errors.js"
import { prepareTranscript } from "./transcript.js"

export const DEFAULT_MAX_CHARS = 12000
const DEFAULT_MAX_BLOCK_CHARS = 1200
const DEFAULT_CODE_SAMPLE_CHARS = 280
const DEFAULT_MAX_SIGNALS = 12
const MAX_LISTED_FILES = 40

const HEADING = /^#{1,6}\s+/
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/
const USER_ROLE = /^(user|human|me)\b/i
const FILLER = /^(hi|hey|hello|thanks|thank you|ok|okay|cool|nice|got it|sounds good|good job|please continue|continue|go on)\b[\s!.]*$/i
const HIGH_SIGNAL =
  /(error|exception|traceback|stack trace|failed|failure|failing|bug|crash|root cause|fix|fixed|fixing|resolved|resolution|blocker|blocked|decision|decided|because|instead of|approach|trade-?off|constraint|caveat|warning|breaking change)/i
const OPEN_ITEM = /(todo|to-do|fixme|next step|next steps|remaining|still need|not yet|follow[- ]?up|pending|blocked on)/i
const COMMAND_PREFIX = /^\s*[$>]\s+\S|^\s*(npm|npx|pnpm|yarn|bun|node|git|python3?|pip3?|pytest|cargo|go|docker|make|dotnet)\s+/
const COMMAND_MAX_WORDS = 12

const SENTENCE_BREAK = /\.\s+[A-Z]/

function looksLikeCommand(line) {
  const trimmed = line.trim()
  if (trimmed.split(/\s+/).length > COMMAND_MAX_WORDS) return false
  if (/^[$>]\s+\S/.test(trimmed)) return true
  if (!COMMAND_PREFIX.test(trimmed)) return false
  return !SENTENCE_BREAK.test(trimmed)
}
const FILE_REFERENCE_SOURCE = "[\\w.@~-]+(?:[\\\\/][\\w.@~-]+)+\\.[A-Za-z0-9]{1,8}"
const FILE_REFERENCE = new RegExp(FILE_REFERENCE_SOURCE, "g")
const FILE_REFERENCE_TEST = new RegExp(FILE_REFERENCE_SOURCE)
const ANSI = /\[[0-9;]*[A-Za-z]/g

export function splitBlocks(markdown) {
  const lines = String(markdown ?? "").replace(/\r\n?/g, "\n").split("\n")
  const blocks = []
  let current = { heading: "", lines: [] }
  let fence = null

  for (const line of lines) {
    const fenceMatch = line.match(FENCE)
    if (fenceMatch) {
      const marker = fenceMatch[1][0]
      const markerLength = fenceMatch[1].length
      if (!fence) {
        fence = { marker, length: markerLength }
      } else if (fence.marker === marker && markerLength >= fence.length && !fenceMatch[2].trim()) {
        fence = null
      }
      current.lines.push(line)
      continue
    }

    if (!fence && HEADING.test(line)) {
      if (current.lines.some((entry) => entry.trim())) blocks.push(current)
      current = { heading: line.replace(HEADING, "").trim(), lines: [line] }
      continue
    }
    current.lines.push(line)
  }
  if (current.lines.some((entry) => entry.trim())) blocks.push(current)

  return blocks
    .map((block) => ({ heading: block.heading, text: block.lines.join("\n").trim() }))
    .filter((block) => block.text.length > 0)
}

export function truncateCodeBlock(match) {
  if (match.length <= DEFAULT_CODE_SAMPLE_CHARS) return match
  const closingFence = match.trimEnd().match(/(?:^|\n)(`{3,}|~{3,})[ \t]*$/)?.[1] ?? "```"
  return `${match.slice(0, DEFAULT_CODE_SAMPLE_CHARS)}\n[code block truncated: ${match.length} chars]\n${closingFence}`
}

export function reduceBlock(text, { maxChars = DEFAULT_MAX_BLOCK_CHARS } = {}) {
  let reduced = String(text ?? "")
    .replace(ANSI, "")
    .replace(/```[\s\S]*?```/g, truncateCodeBlock)
    .replace(/~~~[\s\S]*?~~~/g, truncateCodeBlock)
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

  if (reduced.length > maxChars) {
    reduced = `${reduced.slice(0, maxChars)}\n[block truncated: ${text.length} chars total]`
  }
  return reduced
}

function unique(values) {
  const seen = new Set()
  const result = []
  for (const value of values) {
    const key = value.trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(key)
  }
  return result
}

function shortenLine(line, limit = 220) {
  const trimmed = line.trim().replace(ANSI, "")
  return trimmed.length > limit ? `${trimmed.slice(0, limit)}...` : trimmed
}

export function extractSignals(documents, { maxPerSignal = DEFAULT_MAX_SIGNALS } = {}) {
  const allText = documents.map((document) => prepareTranscript(document.content)).join("\n")
  const lines = allText.split(/\r?\n/)
  const narrative = lines.filter((line) => !/^(?:TOOL|FILE|COMMAND|RESULT|NAME|URL|COVERAGE|OUTPUT_PATH):/.test(line))

  const files = []
  for (const match of allText.matchAll(FILE_REFERENCE)) files.push(match[0])
  const errorLines = [...narrative, ...lines.filter((line) => line.startsWith("RESULT: ")).map((line) => line.slice(8))]
  const errors = errorLines.filter((line) => /^(error|fatal|panic|exception|fail)/i.test(line.trim()) || /\b(error|exception|traceback)\b/i.test(line))
  const commands = lines.map((line) => line.replace(/^COMMAND: /, "")).filter((line) => looksLikeCommand(line))
  const latestTasks = new Map()
  for (const line of narrative) {
    const task = line.match(/^TASK \(([^)]+)\): (.+)$/)
    if (task) latestTasks.set(task[2], { status: task[1], line })
  }
  const openItems = [
    ...narrative.filter((line) => !line.startsWith("TASK (") && OPEN_ITEM.test(line)),
    ...[...latestTasks.values()].filter((task) => task.status === "pending" || task.status === "in_progress").map((task) => task.line),
  ]

  return {
    filesMentioned: unique(files).slice(0, MAX_LISTED_FILES),
    errors: unique(errors.map((line) => shortenLine(line))).slice(0, maxPerSignal),
    commands: unique(commands.map((line) => shortenLine(line))).slice(0, maxPerSignal),
    openItems: unique(openItems.map((line) => shortenLine(line))).slice(0, maxPerSignal),
  }
}

function blockBody(block) {
  return block.text.replace(/^#{1,6}[^\n]*(?:\n|$)/, "").replace(/^---[ \t]*$/gm, "").trim()
}

function scoreBlock(block, position, total) {
  let score = 0
  // Large tool-only turns should not outrank the user's requirements and the
  // agent's actual decisions just because they mention many files or tasks.
  const text = blockBody(block)
    .split("\n")
    .filter((line) => !/^(?:TOOL|FILE|COMMAND|RESULT|NAME|URL):|^TASK \(|^\[.*omitted\]$/.test(line))
    .join("\n")
    .trim()

  if (USER_ROLE.test(block.heading)) score += 3
  if (HIGH_SIGNAL.test(text)) score += 2
  if (FILE_REFERENCE_TEST.test(block.text)) score += 1
  if (OPEN_ITEM.test(text)) score += 2
  if (looksLikeCommand(text)) score += 1
  if (text.length > 240) score += 1
  if (position < Math.max(1, Math.ceil(total * 0.15))) score += 1.5
  if (position >= Math.floor(total * 0.75)) score += 1

  return score
}

export function selectBlocks(blocks, { maxChars = DEFAULT_MAX_CHARS } = {}) {
  const scored = blocks.map((block, position) => ({
    block,
    position,
    score: scoreBlock(block, position, blocks.length),
    filler: !blockBody(block) || (blockBody(block).length < 90 && FILLER.test(blockBody(block))),
  }))

  const ranked = [...scored].sort((left, right) => right.score - left.score)
  const keep = new Map()
  const relevant = scored.filter((entry) => !entry.filler)
  const anchors = [...new Set([relevant[0]?.position, relevant[relevant.length - 1]?.position])].filter(
    (position) => position !== undefined,
  )

  let used = 0
  for (const [index, position] of anchors.entries()) {
    const reduced = reduceContextBlock(scored[position].block)
    const separatorChars = keep.size > 0 ? 2 : 0
    const remainingAnchors = anchors.length - index
    const available = maxChars - used - separatorChars - (remainingAnchors - 1) * 2
    const allowance = Math.max(0, Math.floor(available / remainingAnchors))
    const fitted = fitBlock(reduced, allowance)
    if (!fitted) continue
    keep.set(position, fitted)
    used += fitted.length + separatorChars
  }

  for (const entry of ranked) {
    if (entry.filler) continue
    if (keep.has(entry.position)) continue
    const reduced = reduceContextBlock(entry.block)
    const separatorChars = keep.size > 0 ? 2 : 0
    if (used + reduced.length + separatorChars > maxChars) continue
    keep.set(entry.position, reduced)
    used += reduced.length + separatorChars
  }

  const positions = [...keep.keys()].sort((left, right) => left - right)

  return {
    kept: positions.map((position) => keep.get(position)),
    droppedFiller: scored.filter((entry) => entry.filler && !keep.has(entry.position)).length,
    droppedOverBudget: scored.filter((entry) => !entry.filler && !keep.has(entry.position)).length,
    usedChars: used,
  }
}

function fitBlock(text, allowance) {
  if (text.length <= allowance) return text
  const marker = "\n[truncated]"
  if (allowance <= marker.length) return text.slice(0, allowance)
  return text.slice(0, allowance - marker.length) + marker
}

function reduceContextBlock(block) {
  const reduced = reduceBlock(block.text)
  return block.source ? `SOURCE_FILE: ${block.source}\n${reduced}` : reduced
}

export function buildPreparedContext({ documents, outputPath, maxChars = DEFAULT_MAX_CHARS, memory = null }) {
  if (!Number.isInteger(maxChars) || maxChars <= 0) {
    throw new SummarizeError("context budget must be a positive integer")
  }

  const memoryContent = memory ? memory.content.trim() : ""
  const memoryChars = memoryContent.length
  if (memoryChars >= maxChars) {
    throw new SummarizeError(
      `prior memory uses ${memoryChars} characters and leaves no room for new sessions within the ${maxChars}-character budget`,
      "Increase SUMMARIZE_MAX_CHARS or shorten the prior summary. Prior memory is never silently truncated.",
    )
  }

  const blocks = documents.flatMap((document) => splitBlocks(prepareTranscript(document.content)).map((block) => ({
    ...block,
    source: document.relative,
  })))
  const selection = selectBlocks(blocks, { maxChars: maxChars - memoryChars })
  const signals = extractSignals(documents)

  return {
    outputPath,
    documents: documents.map((document) => ({ path: document.relative, bytes: document.bytes })),
    blocks: { total: blocks.length, kept: selection.kept.length, droppedFiller: selection.droppedFiller, droppedOverBudget: selection.droppedOverBudget },
    rawChars: documents.reduce((total, document) => total + document.content.length, 0),
    memory: memory ? { path: memory.relative, bytes: memory.bytes, content: memoryContent } : null,
    memoryChars,
    sessionContextChars: selection.usedChars,
    contextChars: memoryChars + selection.usedChars,
    maxChars,
    signals,
    context: selection.kept,
  }
}
