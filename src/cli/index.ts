#!/usr/bin/env node

/**
 * ChatBridge CLI Entry Point
 *
 * Provides two main commands:
 * - inspect: Analyze and validate backup files
 * - convert: Transform backups between platforms
 */

import { parseArgs, readBoolFlag, readStringFlag } from './args.ts'
import { runInspectCommand } from './commands/inspect.ts'
import { runConvertCommand } from './commands/convert.ts'
import type { SourcePlatform } from '../core/schema/core.types.ts'

/** Set of valid platform identifiers */
const platforms = new Set<SourcePlatform>(['chatbox', 'cherry', 'rikkahub'])

/**
 * Print CLI usage information to stderr.
 */
function printUsage(): void {
  const usage = `ChatBridge CLI

Usage:
  inspect <input> [--source chatbox|cherry|rikkahub] [--include-secrets] [--stream-threshold-mb <n>]
  convert <input> --to chatbox|cherry|rikkahub --out <output> [--from chatbox|cherry|rikkahub] [--include-secrets] [--preserve-private-state <true|false>] [--stream-threshold-mb <n>] [--asset-mode inline|external]
`

  process.stderr.write(usage)
}

/**
 * Parse and validate a platform identifier from flag value.
 *
 * @param value - Raw flag value
 * @param flagName - Name of the flag (for error messages)
 * @returns Validated platform identifier or undefined
 * @throws Error if value is not a valid platform
 */
function readPlatform(value: string | undefined, flagName: string): SourcePlatform | undefined {
  if (!value) {
    return undefined
  }

  if (!platforms.has(value as SourcePlatform)) {
    throw new Error(`Invalid ${flagName} value: ${value}. Expected one of chatbox|cherry|rikkahub`)
  }

  return value as SourcePlatform
}

/**
 * Parse and validate a numeric flag value.
 *
 * @param flags - Parsed flags object
 * @param key - Flag name to retrieve
 * @returns Parsed number or undefined
 * @throws Error if value is not a valid non-negative number
 */
function readNumberFlag(flags: Record<string, string | boolean>, key: string): number | undefined {
  const value = readStringFlag(flags, key)
  if (!value) {
    return undefined
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid --${key} value: ${value}`)
  }

  return parsed
}

/**
 * Parse and validate the asset mode flag.
 *
 * @param flags - Parsed flags object
 * @returns Asset mode ('inline' or 'external')
 * @throws Error if value is not 'inline' or 'external'
 */
function readAssetMode(flags: Record<string, string | boolean>): 'inline' | 'external' {
  const value = readStringFlag(flags, 'asset-mode')
  if (!value) {
    return 'inline'
  }

  if (value !== 'inline' && value !== 'external') {
    throw new Error(`Invalid --asset-mode value: ${value}. Expected inline|external`)
  }

  return value
}

/**
 * Main CLI entry point.
 * Parses arguments and dispatches to appropriate command handler.
 */
async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2))
  const command = parsed.command

  if (!command) {
    printUsage()
    process.exitCode = 1
    return
  }

  // Handle 'inspect' command
  if (command === 'inspect') {
    const inputPath = parsed.positional[1]
    if (!inputPath) {
      throw new Error('inspect requires <input> path')
    }

    await runInspectCommand({
      inputPath,
      source: readPlatform(readStringFlag(parsed.flags, 'source'), '--source'),
      includeSecrets: readBoolFlag(parsed.flags, 'include-secrets'),
      streamThresholdMb: readNumberFlag(parsed.flags, 'stream-threshold-mb'),
    })
    return
  }

  // Handle 'convert' command
  if (command === 'convert') {
    const inputPath = parsed.positional[1]
    if (!inputPath) {
      throw new Error('convert requires <input> path')
    }

    const target = readPlatform(readStringFlag(parsed.flags, 'to'), '--to')
    if (!target) {
      throw new Error('convert requires --to chatbox|cherry|rikkahub')
    }

    const outputPath = readStringFlag(parsed.flags, 'out')
    if (!outputPath) {
      throw new Error('convert requires --out <output>')
    }

    // preserve-private-state defaults to true if not specified
    const preservePrivateState =
      parsed.flags['preserve-private-state'] === undefined
        ? true
        : readBoolFlag(parsed.flags, 'preserve-private-state')

    await runConvertCommand({
      inputPath,
      outputPath,
      source: readPlatform(readStringFlag(parsed.flags, 'from'), '--from'),
      target,
      includeSecrets: readBoolFlag(parsed.flags, 'include-secrets'),
      preservePrivateState,
      streamThresholdMb: readNumberFlag(parsed.flags, 'stream-threshold-mb'),
      assetMode: readAssetMode(parsed.flags),
    })
    return
  }

  throw new Error(`Unknown command: ${command}`)
}

// Run main and handle errors gracefully
main().catch((error) => {
  process.stderr.write(`${(error as Error).message}\n`)
  process.exitCode = 1
})
