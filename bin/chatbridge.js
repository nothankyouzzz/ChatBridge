#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const filename = fileURLToPath(import.meta.url)
const directory = dirname(filename)
const cliEntry = resolve(directory, '../src/cli/index.ts')

const result = spawnSync(process.execPath, ['--experimental-strip-types', cliEntry, ...process.argv.slice(2)], {
  stdio: 'inherit',
})

if (result.error) {
  throw result.error
}

if (result.signal) {
  process.kill(process.pid, result.signal)
}

process.exitCode = result.status ?? 1
