#!/usr/bin/env node
import process from "node:process"
import { main } from "../../src/cli.js"

const argv = process.argv.slice(2)
const rawArguments = argv.length === 1 ? argv[0] : argv

process.exitCode = await main(rawArguments)