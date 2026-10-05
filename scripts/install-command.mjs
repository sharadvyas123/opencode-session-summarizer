import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, "..")

const SOURCE_ENTRY = path.join(repoRoot, ".opencode", "scripts", "summarize-prepare.mjs")
const SOURCE_COMMAND = path.join(repoRoot, ".opencode", "commands", "summarize.md")
const SOURCE_LIB = path.join(repoRoot, "src")

const DEV_SCRIPT_REFERENCE = ".opencode/scripts/summarize-prepare.mjs"
const INSTALLED_SCRIPT_REFERENCE = ".opencode/summarizer/scripts/summarize-prepare.mjs"
const DEV_LIBRARY_IMPORT = "../../src/cli.js"
const INSTALLED_LIBRARY_IMPORT = "../src/cli.js"

function copyDirectory(from, to) {
  fs.mkdirSync(to, { recursive: true })
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name)
    const target = path.join(to, entry.name)
    if (entry.isDirectory()) copyDirectory(source, target)
    else if (entry.isFile()) fs.copyFileSync(source, target)
  }
}

export function installCommand(targetDirectory, { repoRoot: root = repoRoot } = {}) {
  const target = path.resolve(targetDirectory)
  const commandDirectory = path.join(target, ".opencode", "commands")
  const bundleDirectory = path.join(target, ".opencode", "summarizer")
  const libraryDirectory = path.join(bundleDirectory, "src")
  const scriptDirectory = path.join(bundleDirectory, "scripts")

  fs.mkdirSync(bundleDirectory, { recursive: true })
  fs.writeFileSync(path.join(bundleDirectory, "package.json"), `${JSON.stringify({ type: "module" }, null, 2)}\n`)

  copyDirectory(path.join(root, "src"), libraryDirectory)
  fs.mkdirSync(scriptDirectory, { recursive: true })
  const entryTemplate = fs.readFileSync(path.join(root, ".opencode", "scripts", "summarize-prepare.mjs"), "utf8")
  const entry = entryTemplate.replace(DEV_LIBRARY_IMPORT, INSTALLED_LIBRARY_IMPORT)
  fs.writeFileSync(path.join(scriptDirectory, "summarize-prepare.mjs"), entry)

  fs.mkdirSync(commandDirectory, { recursive: true })
  const template = fs.readFileSync(path.join(root, ".opencode", "commands", "summarize.md"), "utf8")
  const command = template.replaceAll(DEV_SCRIPT_REFERENCE, INSTALLED_SCRIPT_REFERENCE)
  const commandPath = path.join(commandDirectory, "summarize.md")
  fs.writeFileSync(commandPath, command)

  return {
    commandPath,
    bundleDirectory,
    libraryDirectory,
    scriptPath: path.join(scriptDirectory, "summarize-prepare.mjs"),
    reference: INSTALLED_SCRIPT_REFERENCE,
  }
}

function main() {
  const target = process.argv[2] ?? process.cwd()
  if (!fs.existsSync(target)) {
    process.stderr.write(`target directory does not exist: ${target}\n`)
    process.exitCode = 1
    return
  }
  const result = installCommand(target)
  process.stdout.write(
    [
      "Installed the /summarize command into:",
      `  command: ${result.commandPath}`,
      `  script:  ${result.scriptPath}`,
      `  library: ${result.libraryDirectory}`,
      "",
      "Next:",
      "  1. cd into that project",
      "  2. run opencode",
      '  3. run /summarize -f Sessions/<name>.md',
      "",
      `Verify the helper directly: node ${result.reference} "-f Sessions/<name>.md"`,
    ].join("\n") + "\n",
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()