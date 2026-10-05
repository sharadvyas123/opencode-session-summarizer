import assert from "node:assert/strict"
import test from "node:test"
import { buildPreparedContext, extractSignals, reduceBlock, selectBlocks, splitBlocks } from "../src/context.js"

const FIXTURE_URL = new URL("./fixtures/session-example.md", import.meta.url)

async function loadFixture() {
  const fs = await import("node:fs/promises")
  const content = await fs.readFile(FIXTURE_URL, "utf8")
  return [{ relative: "tests/fixtures/session-example.md", bytes: content.length, content }]
}

test("splitBlocks splits on markdown headings", () => {
  const blocks = splitBlocks("# Title\n\nintro\n\n## user\n\nhello\n\n## assistant\n\nhi\n")
  assert.equal(blocks.length, 3)
  assert.equal(blocks[1].heading, "user")
  assert.equal(blocks[1].text, "## user\n\nhello")
})

test("splitBlocks handles files without headings", () => {
  const blocks = splitBlocks("first para\n\nsecond para\n")
  assert.equal(blocks.length, 1)
})

test("reduceBlock truncates large code blocks", () => {
  const big = `intro\n\n\`\`\`ts\n${"const x = 1\n".repeat(80)}\`\`\`\n`
  const reduced = reduceBlock(big, { maxChars: 4000 })
  assert.ok(reduced.includes("[code block truncated:"))
})

test("reduceBlock respects the block budget", () => {
  const reduced = reduceBlock("x".repeat(5000), { maxChars: 100 })
  assert.ok(reduced.startsWith("x".repeat(100)))
  assert.ok(reduced.includes("[block truncated: 5000 chars total]"))
})

test("extractSignals finds files, errors, commands and open items", async () => {
  const signals = extractSignals(await loadFixture())
  assert.ok(signals.filesMentioned.includes("src/candidate/block.py"))
  assert.ok(signals.commands.some((entry) => entry.includes("python scripts/evaluate.py")))
  assert.ok(signals.commands.some((entry) => entry.includes("$ ls src/candidate")))
  assert.ok(!signals.commands.some((entry) => entry.startsWith("make sure recall")))
  assert.ok(signals.openItems.length > 0)
  assert.ok(signals.errors.length > 0)
})

test("selectBlocks keeps the first and last block and drops filler", () => {
  const blocks = [
    { heading: "user", text: "objective block with enough content to matter because it describes the goal" },
    { heading: "assistant", text: "thanks" },
    { heading: "assistant", text: "a".repeat(400) },
    { heading: "assistant", text: "final block describing current state and the decision that was made" },
  ]
  const selection = selectBlocks(blocks, { maxChars: 100000 })
  assert.ok(selection.kept.length >= 3)
  assert.ok(selection.kept.some((entry) => entry.includes("objective block")))
  assert.ok(selection.kept.some((entry) => entry.includes("final block")))
  assert.equal(selection.droppedFiller, 1)
})

test("selectBlocks honours the context budget", () => {
  const blocks = Array.from({ length: 40 }, (_, index) => ({
    heading: "assistant",
    text: `block ${index} ${"z".repeat(500)}`,
  }))
  const selection = selectBlocks(blocks, { maxChars: 1200 })
  assert.ok(selection.usedChars <= 1200)
  assert.equal(selection.usedChars, selection.kept.join("\n\n").length)
  assert.ok(selection.droppedOverBudget > 0)
})

test("selectBlocks counts a single anchor once and respects tiny budgets", () => {
  const single = selectBlocks([{ heading: "user", text: "one objective" }])
  assert.equal(single.usedChars, "one objective".length)
  assert.deepEqual(single.kept, ["one objective"])
  const blocks = [
    { heading: "user", text: "objective ".repeat(100) },
    { heading: "assistant", text: "current state ".repeat(100) },
  ]
  for (const maxChars of [1, 2, 3, 30, 500]) {
    const selection = selectBlocks(blocks, { maxChars })
    assert.ok(selection.usedChars <= maxChars)
    assert.equal(selection.usedChars, selection.kept.join("\n\n").length)
  }
})

test("buildPreparedContext produces coverage counters and signals", async () => {
  const documents = await loadFixture()
  const prepared = buildPreparedContext({ documents, outputPath: "out.md", maxChars: 4000 })
  assert.equal(prepared.documents.length, 1)
  assert.ok(prepared.blocks.total > 0)
  assert.ok(prepared.blocks.kept > 0)
  assert.ok(prepared.rawChars > 0)
  assert.equal(prepared.maxChars, 4000)
  assert.ok(prepared.context.every((entry) => typeof entry === "string" && entry.length > 0))
})

test("buildPreparedContext drops blocks when the budget is tight", async () => {
  const documents = await loadFixture()
  const prepared = buildPreparedContext({ documents, outputPath: "out.md", maxChars: 500 })
  assert.ok(prepared.blocks.kept < prepared.blocks.total)
  assert.ok(prepared.rawChars > prepared.contextChars)
})
