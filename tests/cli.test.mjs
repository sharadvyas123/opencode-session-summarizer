import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { run } from "../src/cli.js"
import { SUMMARY_SECTIONS } from "../src/report.js"

const FIXTURE = new URL("./fixtures/session-example.md", import.meta.url)

function tempProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oss-cli-"))
  fs.mkdirSync(path.join(root, "Sessions"))
  fs.copyFileSync(FIXTURE, path.join(root, "Sessions", "session001.md"))
  return root
}

test("run reports help without reading files", async () => {
  const result = await run("--help", { cwd: tempProject() })
  assert.equal(result.status, "HELP")
  assert.match(result.text, /Usage:/)
})

test("run summarizes a single exported session", async () => {
  const root = tempProject()
  const result = await run("-f Sessions/session001.md", { cwd: root })

  assert.equal(result.status, "OK")
  assert.equal(result.outputPath, path.join(root, "Sessions", "session001-summary.md"))
  assert.match(result.text, /STATUS: OK/)
  assert.match(result.text, /MODE: single-file/)
  assert.match(result.text, /OUTPUT_PATH: /)
  assert.match(result.text, /INPUT_FILES:\n {2}- Sessions\/session001\.md/)
  assert.match(result.text, /COVERAGE: files=1/)
  assert.match(result.text, /SESSION_CONTEXT:/)
  assert.match(result.text, /src\/candidate\/block\.py/)
  assert.equal(fs.existsSync(path.join(root, "Sessions", "session001-summary.md")), false)
})

test("run creates the output directory before the model writes", async () => {
  const root = tempProject()
  const result = await run('-f Sessions/session001.md -o "Sessions/nested/deep/summary.md"', { cwd: root })
  assert.equal(result.status, "OK")
  assert.ok(fs.existsSync(path.join(root, "Sessions", "nested", "deep")))
})

test("run emits every schema section in the instructions", async () => {
  const root = tempProject()
  const result = await run("-f Sessions/session001.md", { cwd: root })
  for (const section of SUMMARY_SECTIONS) {
    assert.ok(result.text.includes(`- ## ${section.title}`), `missing section ${section.title}`)
  }
  assert.match(result.text, /Do not modify the raw session files/)
})

test("run reports a missing file and writes nothing", async () => {
  const root = tempProject()
  const result = await run("-f Sessions/nope.md", { cwd: root })
  assert.equal(result.status, "ERROR")
  assert.equal(result.outputPath, null)
  assert.match(result.text, /STATUS: ERROR/)
  assert.match(result.text, /ERROR: session file not found: Sessions\/nope\.md/)
  assert.match(result.text, /No summary was written/)
})

test("run reports an empty file", async () => {
  const root = tempProject()
  fs.writeFileSync(path.join(root, "Sessions", "empty.md"), "")
  const result = await run("-f Sessions/empty.md", { cwd: root })
  assert.equal(result.status, "ERROR")
  assert.match(result.text, /session file is empty/)
})

test("run rejects non markdown input", async () => {
  const root = tempProject()
  fs.writeFileSync(path.join(root, "Sessions", "notes.txt"), "hello")
  const result = await run("-f Sessions/notes.txt", { cwd: root })
  assert.equal(result.status, "ERROR")
  assert.match(result.text, /not a markdown file/)
})

test("run refuses to overwrite an existing summary by default", async () => {
  const root = tempProject()
  fs.writeFileSync(path.join(root, "Sessions", "session001-summary.md"), "existing\n")
  const result = await run("-f Sessions/session001.md", { cwd: root })
  assert.equal(result.status, "ERROR")
  assert.match(result.text, /output file already exists/)
})

test("run refuses to overwrite a raw session export", async () => {
  const root = tempProject()
  const result = await run("-f Sessions/session001.md -o Sessions/session001.md", { cwd: root })
  assert.equal(result.status, "ERROR")
  assert.match(result.text, /refusing to write the summary over a raw session export/)
})

test("run requires an input", async () => {
  const result = await run("", { cwd: tempProject() })
  assert.equal(result.status, "ERROR")
  assert.match(result.text, /no session input provided/)
})

test("run reports unknown options", async () => {
  const result = await run("-z", { cwd: tempProject() })
  assert.equal(result.status, "ERROR")
  assert.match(result.text, /unknown option "-z"/)
})

test("run summarizes every session in a directory", async () => {
  const root = tempProject()
  fs.copyFileSync(FIXTURE, path.join(root, "Sessions", "session002.md"))
  fs.writeFileSync(path.join(root, "Sessions", "session001-summary.md"), "ignore me\n")

  const result = await run("-d Sessions", { cwd: root })
  assert.equal(result.status, "OK")
  assert.equal(result.outputPath, path.join(root, "Sessions", "project-summary.md"))
  assert.match(result.text, /MODE: directory/)
  assert.match(result.text, /COVERAGE: files=2/)
  assert.doesNotMatch(result.text, /ignore me/)
})

test("run reports a missing sessions directory", async () => {
  const root = tempProject()
  const result = await run("-d Nope", { cwd: root })
  assert.equal(result.status, "ERROR")
  assert.match(result.text, /sessions directory not found: Nope/)
})

test("run honors the context budget", async () => {
  const root = tempProject()
  const result = await run("-f Sessions/session001.md", { cwd: root, maxChars: 500 })
  assert.equal(result.status, "OK")
  assert.match(result.text, /budgetChars=500/)
  assert.ok(result.text.includes("droppedOverBudget="))
})
