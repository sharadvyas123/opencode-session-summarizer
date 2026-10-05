import assert from "node:assert/strict"
import test from "node:test"
import { assertUsableArguments, parseArguments, tokenize } from "../src/args.js"

test("tokenize splits on whitespace and keeps quoted paths intact", () => {
  assert.deepEqual(tokenize('-f "Sessions/my session.md" -o out.md'), ["-f", "Sessions/my session.md", "-o", "out.md"])
})

test("tokenize supports single quotes", () => {
  assert.deepEqual(tokenize("-d 'Sessions/2026'"), ["-d", "Sessions/2026"])
})

test("tokenize keeps backslashes so Windows paths survive", () => {
  assert.deepEqual(tokenize(String.raw`-f Sessions\2026\session.md`), [String.raw`-f`, String.raw`Sessions\2026\session.md`])
})

test("tokenize rejects unbalanced quotes", () => {
  assert.throws(() => tokenize('-f "Sessions/a.md'), /unbalanced/)
})

test("parseArguments reads a single file", () => {
  const parsed = parseArguments("-f Sessions/session001.md")
  assert.deepEqual(parsed.files, ["Sessions/session001.md"])
  assert.equal(parsed.dir, null)
  assert.equal(parsed.output, null)
  assert.deepEqual(parsed.errors, [])
})

test("parseArguments reads many files after one -f", () => {
  const parsed = parseArguments("-f a.md b.md -o combined.md")
  assert.deepEqual(parsed.files, ["a.md", "b.md"])
  assert.equal(parsed.output, "combined.md")
})

test("parseArguments accepts repeated -f flags", () => {
  const parsed = parseArguments("-f a.md -f b.md")
  assert.deepEqual(parsed.files, ["a.md", "b.md"])
})

test("parseArguments reads directory and output", () => {
  const parsed = parseArguments("-d Sessions -o Sessions/project-summary.md")
  assert.equal(parsed.dir, "Sessions")
  assert.equal(parsed.output, "Sessions/project-summary.md")
  assert.deepEqual(parsed.files, [])
})

test("parseArguments treats bare paths as files", () => {
  const parsed = parseArguments("Sessions/session001.md")
  assert.deepEqual(parsed.files, ["Sessions/session001.md"])
})

test("parseArguments reports unknown options", () => {
  const parsed = parseArguments("-x foo.md")
  assert.deepEqual(parsed.errors, ['unknown option "-x"'])
})

test("parseArguments reports missing values", () => {
  assert.deepEqual(parseArguments("-f").errors, ["-f expects at least one session markdown path"])
  assert.deepEqual(parseArguments("-o").errors, ["-o expects exactly one output markdown path"])
  assert.deepEqual(parseArguments("-d a b").errors, ["-d expects exactly one directory path"])
})

test("assertUsableArguments requires an input", () => {
  assert.throws(() => assertUsableArguments(parseArguments("")), /no session input provided/)
})

test("assertUsableArguments rejects -f combined with -d", () => {
  assert.throws(() => assertUsableArguments(parseArguments("-f a.md -d Sessions")), /cannot be combined/)
})

test("parseArguments reads quoted prior-memory paths with file and directory modes", () => {
  const files = parseArguments('--memory "Sessions/my memory.md" -f "Sessions/new session.md" -o "Sessions/my memory.md"')
  assert.equal(files.memory, "Sessions/my memory.md")
  assert.deepEqual(files.files, ["Sessions/new session.md"])
  assert.equal(files.output, "Sessions/my memory.md")
  assert.deepEqual(files.errors, [])
  const directory = parseArguments(["-m", "Sessions/project-summary.md", "-d", "Sessions/new"])
  assert.equal(directory.memory, "Sessions/project-summary.md")
  assert.equal(directory.dir, "Sessions/new")
  assert.doesNotThrow(() => assertUsableArguments(directory))
})

test("parseArguments rejects missing, multiple, and repeated prior-memory values", () => {
  assert.deepEqual(parseArguments("--memory").errors, ["--memory expects exactly one project summary path"])
  assert.deepEqual(parseArguments("-m a.md b.md").errors, ["-m expects exactly one project summary path"])
  assert.deepEqual(parseArguments("-m a.md --memory b.md").errors, ["only one prior project summary may be provided"])
})
