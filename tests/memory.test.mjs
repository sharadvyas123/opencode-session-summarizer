import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { run } from "../src/cli.js"

const MEMORY = new URL("./fixtures/prior-memory.md", import.meta.url)
const SESSION = new URL("./fixtures/session-followup.md", import.meta.url)

function tempProject(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oss-memory-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, "Sessions"))
  fs.copyFileSync(MEMORY, path.join(root, "Sessions", "project-summary.md"))
  fs.copyFileSync(SESSION, path.join(root, "Sessions", "new-session.md"))
  return root
}

test("rolling memory keeps prior context separate and prepares an in-place update without writing", async (t) => {
  const root = tempProject(t)
  const memoryPath = path.join(root, "Sessions", "project-summary.md")
  const sessionPath = path.join(root, "Sessions", "new-session.md")
  const beforeMemory = fs.readFileSync(memoryPath, "utf8")
  const beforeSession = fs.readFileSync(sessionPath, "utf8")
  const result = await run("--memory Sessions/project-summary.md -f Sessions/new-session.md -o Sessions/project-summary.md", { cwd: root })

  assert.equal(result.status, "OK")
  assert.equal(result.outputPath, memoryPath)
  assert.match(result.text, /MODE: rolling-memory/)
  assert.match(result.text, /MEMORY_PATH: Sessions\/project-summary\.md/)
  assert.match(result.text, /INPUT_FILES:\n  - Sessions\/new-session\.md\nCOVERAGE: files=1/)
  const priorContext = result.text.split("<<<PRIOR_MEMORY\n")[1].split("\nPRIOR_MEMORY>>>")[0]
  assert.equal(priorContext, beforeMemory.trim())
  const sessionContext = result.text.split("<<<SESSION_CONTEXT\n")[1].split("SESSION_CONTEXT>>>")[0]
  assert.match(sessionContext, /recall@10 is now 0\.81/)
  assert.doesNotMatch(sessionContext, /The threshold is hard-coded at 0\.62 and three tests pass/)
  assert.match(result.text, /Do not append a second summary/)
  assert.match(result.text, /Replace stale current-state facts/)
  assert.match(result.text, /Move explicitly completed tasks out of Remaining Work/)
  assert.match(result.text, /record the uncertainty rather than guessing/)
  assert.equal(fs.readFileSync(memoryPath, "utf8"), beforeMemory)
  assert.equal(fs.readFileSync(sessionPath, "utf8"), beforeSession)
})

test("the planned -f old-summary new-session syntax recognizes prior memory", async (t) => {
  const root = tempProject(t)
  const result = await run("-f Sessions/project-summary.md Sessions/new-session.md -o Sessions/project-summary.md", { cwd: root })
  assert.equal(result.status, "OK")
  assert.match(result.text, /MODE: rolling-memory/)
  assert.match(result.text, /COVERAGE: files=1/)
  assert.match(result.text, /<<<PRIOR_MEMORY/)
})

test("summary headings identify custom-named memory without relying on filenames", async (t) => {
  const root = tempProject(t)
  fs.renameSync(path.join(root, "Sessions", "project-summary.md"), path.join(root, "Sessions", "handoff.markdown"))
  const result = await run("-f Sessions/handoff.markdown Sessions/new-session.md", { cwd: root })
  assert.equal(result.status, "OK")
  assert.equal(result.outputPath, path.join(root, "Sessions", "project-summary.md"))
  assert.match(result.text, /MEMORY_PATH: Sessions\/handoff\.markdown/)
})

test("rolling memory requires explicit -o before replacing an existing default summary", async (t) => {
  const root = tempProject(t)
  const result = await run("--memory Sessions/project-summary.md -f Sessions/new-session.md", { cwd: root })
  assert.equal(result.status, "ERROR")
  assert.match(result.text, /output file already exists/)
})

test("rolling memory can write a new nested output while preserving the original memory", async (t) => {
  const root = tempProject(t)
  const result = await run("-m Sessions/project-summary.md -f Sessions/new-session.md -o Memory/nested/project-summary.md", { cwd: root })
  assert.equal(result.status, "OK")
  assert.equal(result.outputPath, path.join(root, "Memory", "nested", "project-summary.md"))
  assert.ok(fs.existsSync(path.join(root, "Memory", "nested")))
  assert.ok(fs.existsSync(path.join(root, "Sessions", "project-summary.md")))
  assert.equal(fs.existsSync(result.outputPath), false)
})

test("directory rolling mode loads only raw sessions and excludes custom-named summaries", async (t) => {
  const root = tempProject(t)
  fs.copyFileSync(MEMORY, path.join(root, "Sessions", "handoff.md"))
  fs.copyFileSync(MEMORY, path.join(root, "Sessions", "older-summary.markdown"))
  const result = await run("--memory Sessions/project-summary.md -d Sessions -o Sessions/project-summary.md", { cwd: root })
  assert.equal(result.status, "OK")
  assert.match(result.text, /COVERAGE: files=1/)
  assert.doesNotMatch(result.text, /SOURCE_FILE: Sessions\/(handoff|older-summary)/)
})

test("new sessions retain their source labels and supplied order", async (t) => {
  const root = tempProject(t)
  fs.writeFileSync(path.join(root, "Sessions", "last.md"), "# Session: last\n\n## assistant\n\nCurrent state: recall@10 is now 0.83.\n")
  const result = await run("-m Sessions/project-summary.md -f Sessions/new-session.md Sessions/last.md -o Sessions/project-summary.md", { cwd: root })
  assert.equal(result.status, "OK")
  assert.match(result.text, /COVERAGE: files=2/)
  assert.ok(result.text.indexOf("SOURCE_FILE: Sessions/new-session.md") < result.text.indexOf("SOURCE_FILE: Sessions/last.md"))
  assert.match(result.text, /recall@10 is now 0\.83/)
})

test("rolling mode refuses to overwrite a raw session, even one not selected as input", async (t) => {
  const root = tempProject(t)
  fs.copyFileSync(SESSION, path.join(root, "Sessions", "unselected.md"))
  const selected = await run("-m Sessions/project-summary.md -f Sessions/new-session.md -o Sessions/new-session.md", { cwd: root })
  assert.equal(selected.status, "ERROR")
  assert.match(selected.text, /refusing to write the summary over a raw session export/)
  const unselected = await run("-m Sessions/project-summary.md -f Sessions/new-session.md -o Sessions/unselected.md", { cwd: root })
  assert.equal(unselected.status, "ERROR")
  assert.match(unselected.text, /not a project summary/)
  assert.equal(fs.readFileSync(path.join(root, "Sessions", "unselected.md"), "utf8"), fs.readFileSync(SESSION, "utf8"))
  const freshSummary = await run("-f Sessions/new-session.md -o Sessions/unselected.md", { cwd: root })
  assert.equal(freshSummary.status, "ERROR")
  assert.match(freshSummary.text, /not a project summary/)
})

test("rolling mode rejects an output hard link to a raw session", async (t) => {
  const root = tempProject(t)
  fs.linkSync(path.join(root, "Sessions", "new-session.md"), path.join(root, "Sessions", "alias-summary.md"))
  const result = await run("-m Sessions/project-summary.md -f Sessions/new-session.md -o Sessions/alias-summary.md", { cwd: root })
  assert.equal(result.status, "ERROR")
  assert.match(result.text, /refusing to write the summary over a raw session export/)
})

test("rolling mode rejects symbolic-link outputs", { skip: process.platform === "win32" }, async (t) => {
  const root = tempProject(t)
  fs.symlinkSync(path.join(root, "Sessions", "project-summary.md"), path.join(root, "Sessions", "alias-summary.md"))
  const result = await run("-m Sessions/project-summary.md -f Sessions/new-session.md -o Sessions/alias-summary.md", { cwd: root })
  assert.equal(result.status, "ERROR")
  assert.match(result.text, /symbolic link/)
})

test("missing, empty, malformed, and heading-only memory are rejected before output directories are created", async (t) => {
  const root = tempProject(t)
  for (const [name, content, error] of [
    ["missing.md", null, /project memory file not found/],
    ["empty.md", " \n\t", /project memory file is empty/],
    ["invalid.md", "## Current State\nNo summary title.\n", /not a project summary/],
    ["title-only.md", "# Session Summary\n\n", /project summary has no content/],
  ]) {
    if (content !== null) fs.writeFileSync(path.join(root, name), content)
    const result = await run(`--memory ${name} -f Sessions/new-session.md -o NewMemory/project-summary.md`, { cwd: root })
    assert.equal(result.status, "ERROR")
    assert.match(result.text, error)
    assert.equal(fs.existsSync(path.join(root, "NewMemory")), false)
  }
})

test("a raw transcript with a summary filename is never authorized as prior memory", async (t) => {
  const root = tempProject(t)
  fs.copyFileSync(SESSION, path.join(root, "Sessions", "raw-summary.md"))
  const result = await run("-f Sessions/raw-summary.md Sessions/new-session.md -o Sessions/raw-summary.md", { cwd: root })
  assert.equal(result.status, "ERROR")
  assert.match(result.text, /not a project summary/)
})

test("multiple prior summaries, including duplicate roles, are rejected", async (t) => {
  const root = tempProject(t)
  fs.copyFileSync(MEMORY, path.join(root, "Sessions", "other-summary.md"))
  for (const args of [
    "-m Sessions/project-summary.md -f Sessions/project-summary.md Sessions/new-session.md",
    "-f Sessions/project-summary.md Sessions/other-summary.md Sessions/new-session.md",
  ]) {
    const result = await run(`${args} -o Sessions/project-summary.md`, { cwd: root })
    assert.equal(result.status, "ERROR")
    assert.match(result.text, /only one prior project summary/)
  }
})

test("rolling mode requires a new raw session, not just prior memory", async (t) => {
  const root = tempProject(t)
  const result = await run("-f Sessions/project-summary.md -o Sessions/project-summary.md", { cwd: root })
  assert.equal(result.status, "ERROR")
  assert.match(result.text, /no new session input provided/)
})

test("full prior memory and selected session context share one strict character budget", async (t) => {
  const root = tempProject(t)
  const memory = fs.readFileSync(MEMORY, "utf8").trim()
  const budget = memory.length + 500
  const result = await run("-m Sessions/project-summary.md -f Sessions/new-session.md -o Sessions/project-summary.md", { cwd: root, maxChars: budget })
  assert.equal(result.status, "OK")
  assert.ok(result.text.includes(memory))
  const contextChars = Number(result.text.match(/\bcontextChars=(\d+)/)[1])
  const memoryChars = Number(result.text.match(/\bmemoryChars=(\d+)/)[1])
  const sessionChars = Number(result.text.match(/\bsessionContextChars=(\d+)/)[1])
  assert.equal(memoryChars, memory.length)
  assert.equal(contextChars, memoryChars + sessionChars)
  assert.ok(sessionChars > 0 && sessionChars <= 500)
  assert.ok(contextChars <= budget)
})

test("over-budget memory fails instead of silently truncating prior decisions", async (t) => {
  const root = tempProject(t)
  const budget = fs.readFileSync(MEMORY, "utf8").trim().length
  const result = await run("-m Sessions/project-summary.md -f Sessions/new-session.md -o NewMemory/project-summary.md", { cwd: root, maxChars: budget })
  assert.equal(result.status, "ERROR")
  assert.match(result.text, /leaves no room for new sessions/)
  assert.match(result.text, /Increase SUMMARIZE_MAX_CHARS/)
  assert.equal(fs.existsSync(path.join(root, "NewMemory")), false)
})
