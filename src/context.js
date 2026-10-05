export const DEFAULT_MAX_CHARS = 12000
const DEFAULT_MAX_BLOCK_CHARS = 1200
const DEFAULT_CODE_SAMPLE_CHARS = 280
const DEFAULT_MAX_SIGNALS = 12
const MAX_LISTED_FILES = 40

const HEADING = /^#{1,6}\s+/
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

  for (const line of lines) {
    if (HEADING.test(line)) {
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
  return `${match.slice(0, DEFAULT_CODE_SAMPLE_CHARS)}\n[code block truncated: ${match.length} chars]`
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
  const allText = documents.map((document) => document.content).join("\n")
  const lines = allText.split(/\r?\n/)

  const files = []
  for (const match of allText.matchAll(FILE_REFERENCE)) files.push(match[0])
  const errors = lines.filter((line) => /^(error|fatal|panic|exception|fail)/i.test(line.trim()) || /\b(error|exception|traceback)\b/i.test(line))
  const commands = lines.filter((line) => looksLikeCommand(line))
  const openItems = lines.filter((line) => OPEN_ITEM.test(line))

  return {
    filesMentioned: unique(files).slice(0, MAX_LISTED_FILES),
    errors: unique(errors.map((line) => shortenLine(line))).slice(0, maxPerSignal),
    commands: unique(commands.map((line) => shortenLine(line))).slice(0, maxPerSignal),
    openItems: unique(openItems.map((line) => shortenLine(line))).slice(0, maxPerSignal),
  }
}

function scoreBlock(block, position, total) {
  let score = 0
  const text = block.text

  if (USER_ROLE.test(block.heading)) score += 3
  if (HIGH_SIGNAL.test(text)) score += 2
  if (FILE_REFERENCE_TEST.test(text)) score += 1
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
    filler: block.text.length < 90 && FILLER.test(block.text.trim()),
  }))

  const ranked = [...scored].sort((left, right) => right.score - left.score)
  const keep = new Set()
  const anchors = [scored[0]?.position, scored[scored.length - 1]?.position].filter(
    (position) => position !== undefined,
  )

  let used = 0
  for (const position of anchors) {
    const reduced = reduceBlock(scored[position].block.text)
    keep.add(position)
    used += reduced.length
  }

  for (const entry of ranked) {
    if (entry.filler) continue
    if (keep.has(entry.position)) continue
    const reduced = reduceBlock(entry.block.text)
    if (used + reduced.length > maxChars) continue
    keep.add(entry.position)
    used += reduced.length
  }

  const kept = [...keep].sort((left, right) => left - right).map((position) => scored[position])

  return {
    kept: kept.map((entry) => reduceBlock(entry.block.text)),
    droppedFiller: scored.filter((entry) => entry.filler).length,
    droppedOverBudget: scored.filter((entry) => !entry.filler && !keep.has(entry.position)).length,
    usedChars: used,
  }
}

export function buildPreparedContext({ documents, outputPath, maxChars = DEFAULT_MAX_CHARS }) {
  const blocks = documents.flatMap((document) => splitBlocks(document.content))
  const selection = selectBlocks(blocks, { maxChars })
  const signals = extractSignals(documents)

  return {
    outputPath,
    documents: documents.map((document) => ({ path: document.relative, bytes: document.bytes })),
    blocks: { total: blocks.length, kept: selection.kept.length, droppedFiller: selection.droppedFiller, droppedOverBudget: selection.droppedOverBudget },
    rawChars: documents.reduce((total, document) => total + document.content.length, 0),
    contextChars: selection.usedChars,
    maxChars,
    signals,
    context: selection.kept,
  }
}