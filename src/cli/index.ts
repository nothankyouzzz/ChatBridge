#!/usr/bin/env node

/**
 * ChatBridge CLI Entry Point
 *
 * Provides two main commands:
 * - inspect: Analyze and validate backup files
 * - convert: Transform backups between platforms
 */

import { Command, Option } from 'commander'
import type { SourcePlatform } from '../core/schema/core.types.ts'
import { runConvertCommand } from './commands/convert.ts'
import { runInspectCommand } from './commands/inspect.ts'

const platforms: SourcePlatform[] = ['chatbox', 'cherry', 'rikkahub']

/**
 * Validate and coerce a CLI string value to a `SourcePlatform` literal.
 * Throws a descriptive `Error` when the value is not recognized.
 */
function parsePlatform(value: string, flagName: string): SourcePlatform {
  if (platforms.includes(value as SourcePlatform)) {
    return value as SourcePlatform
  }

  throw new Error(`Invalid ${flagName} value: ${value}. Expected one of chatbox|cherry|rikkahub`)
}

/**
 * Parse a CLI string as a non-negative finite number.
 * Throws when the value is not a valid number or is negative.
 */
function parseNonNegativeNumber(value: string, flagName: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid ${flagName} value: ${value}`)
  }
  return parsed
}

/**
 * Parse a CLI flag that is optionally boolean-ish.
 *
 * When `value` is `undefined` (flag present without argument), returns `true`.
 * Accepts `1/true/yes` and `0/false/no` as case-insensitive strings.
 * Throws when the value is an unrecognized string.
 */
function parseBooleanish(value: string | undefined, flagName: string): boolean {
  if (value === undefined) {
    return true
  }

  const normalized = value.toLowerCase()
  if (normalized === '1' || normalized === 'true' || normalized === 'yes') {
    return true
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no') {
    return false
  }

  throw new Error(`Invalid ${flagName} value: ${value}`)
}

const cli = new Command()
cli
  .name('chatbridge')
  .description('Universal converter for Chatbox, Cherry Studio, and Rikkahub backups.')
  .showHelpAfterError()

cli
  .command('inspect')
  .argument('<input>', 'Input backup path (.json or .zip)')
  .addOption(
    new Option('--source <platform>', 'Force parser source: chatbox|cherry|rikkahub')
      .argParser((value) => parsePlatform(value, '--source'))
  )
  .option('--include-secrets', 'Include secret provider fields in parse result', false)
  .addOption(
    new Option('--stream-threshold-mb <n>', 'Switch large JSON reads to stream parse path').argParser((value) =>
      parseNonNegativeNumber(value, '--stream-threshold-mb')
    )
  )
  .action(async (inputPath: string, options: {
    source?: SourcePlatform
    includeSecrets?: boolean
    streamThresholdMb?: number
  }) => {
    await runInspectCommand({
      inputPath,
      source: options.source,
      includeSecrets: options.includeSecrets === true,
      streamThresholdMb: options.streamThresholdMb,
    })
  })

cli
  .command('convert')
  .argument('<input>', 'Input backup path (.json or .zip)')
  .addOption(
    new Option('--to <platform>', 'Target platform: chatbox|cherry|rikkahub')
      .makeOptionMandatory(true)
      .argParser((value) => parsePlatform(value, '--to'))
  )
  .requiredOption('--out <output>', 'Output file or directory path')
  .addOption(
    new Option('--from <platform>', 'Force parser source: chatbox|cherry|rikkahub')
      .argParser((value) => parsePlatform(value, '--from'))
  )
  .option('--include-secrets', 'Include secret provider fields in generated output', false)
  .addOption(
    new Option(
      '--preserve-private-state [value]',
      'Preserve passthrough/transport private state (true|false)'
    ).argParser((value) => parseBooleanish(value, '--preserve-private-state'))
  )
  .addOption(
    new Option('--stream-threshold-mb <n>', 'Switch large JSON reads to stream parse path').argParser((value) =>
      parseNonNegativeNumber(value, '--stream-threshold-mb')
    )
  )
  .action(async (inputPath: string, options: {
    to: SourcePlatform
    out: string
    from?: SourcePlatform
    includeSecrets?: boolean
    preservePrivateState?: boolean
    streamThresholdMb?: number
  }) => {
    await runConvertCommand({
      inputPath,
      outputPath: options.out,
      source: options.from,
      target: options.to,
      includeSecrets: options.includeSecrets === true,
      preservePrivateState: options.preservePrivateState ?? true,
      streamThresholdMb: options.streamThresholdMb,
    })
  })

async function main(): Promise<void> {
  await cli.parseAsync(process.argv)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
