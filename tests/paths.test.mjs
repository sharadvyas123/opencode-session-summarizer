import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { deriveOutputPath, discoverSessionFiles, isSummaryArtifact, readSessionFile } from "../src/paths.js"

function tempProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oss-paths-"))
  fs.mkdirSync(path.join(root, "Sessions"))
  fs.writeFileSync(path.join(root, "Sessions", "session001.md"), "# one\n")
  fs.writeFileSync(path.join(root, "Sessions", "session002.md"), "# two\n")
  fs.writeFileSync(path.join(root, "Sessions", "notes.txt"), "not a session\n")
  return root
}

function tempProjectWithSummaries() {
  const root = tempProject()
  fs.writeFileSync(path.join(root, "Sessions", "session001-summary.md"), "old summary\n")
  fs.writeFileSync(path.join(root, "Sessions", "project-summary.md"), "old project summary\n")
  return root
}

test("isSummaryArtifact detects generated summaries", () => {
  assert.equal(isSummaryArtifact("Sessions/session001-summary.md"), true)
  assert.equal(isSummaryArtifact("Sessions/project-summary.md"), true)
  assert.equal(isSummaryArtifact("Sessions/session001.md"), false)
})

test("discoverSessionFiles only returns raw markdown exports", () => {
  const root = tempProject()
  const found = discoverSessionFiles(root, "Sessions").map((entry) => path.basename(entry))
  assert.deepEqual(found, ["session001.md", "session002.md"])
})

test("discoverSessionFiles reports a missing directory", () => {
  assert.throws(() => discoverSessionFiles(tempProject(), "Nope"), /sessions directory not found/)
})

test("discoverSessionFiles reports an empty directory", () => {
  const root = tempProject()
  fs.mkdirSync(path.join(root, "Empty"))
  assert.throws(() => discoverSessionFiles(root, "Empty"), /no exported session markdown files/)
})

test("readSessionFile reads markdown content", () => {
  const root = tempProject()
  const document = readSessionFile(root, "Sessions/session001.md")
  assert.equal(document.content, "# one\n")
  assert.equal(document.relative, "Sessions/session001.md")
  assert.ok(document.bytes > 0)
})

test("readSessionFile rejects non markdown input", () => {
  assert.throws(() => readSessionFile(tempProject(), "Sessions/notes.txt"), /not a markdown file/)
})

test("readSessionFile reports a missing file", () => {
  assert.throws(() => readSessionFile(tempProject(), "Sessions/nope.md"), /session file not found/)
})

test("readSessionFile rejects an empty file", () => {
  const root = tempProject()
  fs.writeFileSync(path.join(root, "Sessions", "empty.md"), "")
  assert.throws(() => readSessionFile(root, "Sessions/empty.md"), /session file is empty/)
})

test("deriveOutputPath names a single file summary deterministically", () => {
  const root = tempProject()
  const output = deriveOutputPath({
    cwd: root,
    inputs: [{ absolute: path.join(root, "Sessions", "session001.md") }],
    directory: null,
    output: null,
  })
  assert.equal(output.absolute, path.join(root, "Sessions", "session001-summary.md"))
  assert.equal(output.explicit, false)
})

test("deriveOutputPath uses project-summary.md for directory mode", () => {
  const root = tempProject()
  const output = deriveOutputPath({ cwd: root, inputs: [], directory: "Sessions", output: null })
  assert.equal(output.absolute, path.join(root, "Sessions", "project-summary.md"))
})

test("deriveOutputPath uses project-summary.md for multiple files", () => {
  const root = tempProject()
  const output = deriveOutputPath({
    cwd: root,
    inputs: [
      { absolute: path.join(root, "Sessions", "session001.md") },
      { absolute: path.join(root, "Sessions", "session002.md") },
    ],
    directory: null,
    output: null,
  })
  assert.equal(output.absolute, path.join(root, "Sessions", "project-summary.md"))
})

test("deriveOutputPath never overwrites an existing summary by default", () => {
  assert.throws(
    () => deriveOutputPath({ cwd: tempProjectWithSummaries(), inputs: [], directory: "Sessions", output: null }),
    /output file already exists/,
  )
})

test("deriveOutputPath allows an explicit output to replace an existing summary", () => {
  const root = tempProjectWithSummaries()
  const output = deriveOutputPath({ cwd: root, inputs: [], directory: "Sessions", output: "Sessions/project-summary.md" })
  assert.equal(output.explicit, true)
  assert.equal(output.exists, true)
})

test("deriveOutputPath refuses to overwrite a raw export", () => {
  const root = tempProject()
  assert.throws(
    () =>
      deriveOutputPath({
        cwd: root,
        inputs: [{ absolute: path.join(root, "Sessions", "session001.md") }],
        directory: null,
        output: "Sessions/session001.md",
      }),
    /refusing to write the summary over a raw session export/,
  )
})