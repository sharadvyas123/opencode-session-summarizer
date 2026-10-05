import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { execFileSync } from "node:child_process"
import { installCommand } from "../scripts/install-command.mjs"

const FIXTURE = new URL("./fixtures/session-example.md", import.meta.url)
const MEMORY = new URL("./fixtures/prior-memory.md", import.meta.url)
const FOLLOWUP = new URL("./fixtures/session-followup.md", import.meta.url)

function tempProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oss-install-"))
  fs.mkdirSync(path.join(root, "Sessions"))
  fs.copyFileSync(FIXTURE, path.join(root, "Sessions", "session001.md"))
  return root
}

test("installCommand lays out a self-contained bundle", () => {
  const root = tempProject()
  const result = installCommand(root)

  assert.equal(result.commandPath, path.join(root, ".opencode", "commands", "summarize.md"))
  assert.ok(fs.existsSync(path.join(root, ".opencode", "summarizer", "src", "cli.js")))
  assert.ok(fs.existsSync(result.scriptPath))
  assert.ok(fs.existsSync(result.commandPath))
})

test("installCommand marks the bundle as ESM so Node emits no warnings", () => {
  const root = tempProject()
  const result = installCommand(root)
  const manifest = JSON.parse(fs.readFileSync(path.join(result.bundleDirectory, "package.json"), "utf8"))
  assert.deepEqual(manifest, { type: "module" })
})

test("installCommand rewrites the library import in the entry script", () => {
  const root = tempProject()
  const result = installCommand(root)
  const entry = fs.readFileSync(result.scriptPath, "utf8")

  assert.ok(entry.includes('from "../src/cli.js"'))
  assert.ok(!entry.includes('from "../../src/cli.js"'))
})

test("installCommand rewrites the script reference in the command file", () => {
  const root = tempProject()
  const result = installCommand(root)
  const command = fs.readFileSync(result.commandPath, "utf8")

  assert.ok(command.includes(".opencode/summarizer/scripts/summarize-prepare.mjs"))
  assert.ok(!command.includes(".opencode/scripts/summarize-prepare.mjs"))
})

test("installCommand pins the command to the build agent", () => {
  const root = tempProject()
  const result = installCommand(root)
  const command = fs.readFileSync(result.commandPath, "utf8")

  assert.match(command, /\nagent: build\n/)
})

test("the installed bundle runs standalone from a fresh project", () => {
  const root = tempProject()
  const result = installCommand(root)

  const output = execFileSync(process.execPath, [result.scriptPath, "-f Sessions/session001.md"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })

  assert.doesNotMatch(output, /MODULE_TYPELESS_PACKAGE_JSON/)
  assert.match(output, /STATUS: OK/)
  assert.match(output, new RegExp(`OUTPUT_PATH: ${path.join(root, "Sessions", "session001-summary.md").replace(/\\/g, "\\\\")}`))
})

test("the installed bundle reports errors without throwing", () => {
  const root = tempProject()
  const result = installCommand(root)

  const output = execFileSync(process.execPath, [result.scriptPath, "-f Sessions/missing.md"], {
    cwd: root,
    encoding: "utf8",
  })

  assert.match(output, /STATUS: ERROR/)
  assert.match(output, /session file not found/)
})

test("the installed bundle prepares rolling memory from paths containing spaces", (t) => {
  const root = tempProject()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.copyFileSync(MEMORY, path.join(root, "Sessions", "project memory.md"))
  fs.copyFileSync(FOLLOWUP, path.join(root, "Sessions", "new session.md"))
  const result = installCommand(root)
  const output = execFileSync(process.execPath, [
    result.scriptPath,
    '--memory "Sessions/project memory.md" -f "Sessions/new session.md" -o "Sessions/project memory.md"',
  ], { cwd: root, encoding: "utf8" })

  assert.ok(fs.existsSync(path.join(result.libraryDirectory, "memory.js")))
  assert.match(output, /STATUS: OK/)
  assert.match(output, /MODE: rolling-memory/)
  assert.match(output, /MEMORY_PATH: Sessions\/project memory\.md/)
  assert.match(output, /recall@10 is now 0\.81/)
  assert.match(fs.readFileSync(result.commandPath, "utf8"), /PRIOR_MEMORY/)
  assert.equal(fs.readFileSync(path.join(root, "Sessions", "project memory.md"), "utf8"), fs.readFileSync(MEMORY, "utf8"))
})
