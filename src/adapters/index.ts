/**
 * Adapter Registry and Orchestration
 *
 * Central module for managing platform adapters (parsers and generators).
 * Provides auto-detection, explicit selection, and transformation orchestration.
 */

import type {
  CoreBundle,
  GenerateOptions,
  GeneratedArtifact,
  InputArtifact,
  OutputTarget,
  ParseOptions,
  SourcePlatform,
} from '../core/schema/core.types.ts'
import { ChatboxParser } from './chatbox/parser.ts'
import { CherryParser } from './cherry/parser.ts'
import { RikkahubParser } from './rikkahub/parser.ts'
import { ChatboxGenerator } from './chatbox/generator.ts'
import { CherryGenerator } from './cherry/generator.ts'
import { RikkahubGenerator } from './rikkahub/generator.ts'
import type { SourceParser, TargetGenerator } from './types.ts'

/** Registry of all available source parsers */
const sourceParsers: SourceParser[] = [new ChatboxParser(), new CherryParser(), new RikkahubParser()]

/** Registry of all available target generators */
const targetGenerators: TargetGenerator[] = [new ChatboxGenerator(), new CherryGenerator(), new RikkahubGenerator()]

/**
 * Get parser instance for specified platform.
 *
 * @param source - Platform identifier
 * @returns Parser instance
 * @throws Error if platform is not supported
 */
export function getSourceParser(source: SourcePlatform): SourceParser {
  const parser = sourceParsers.find((item) => item.source === source)
  if (!parser) {
    throw new Error(`Unsupported source parser: ${source}`)
  }

  return parser
}

/**
 * Get generator instance for specified platform.
 *
 * @param target - Platform identifier
 * @returns Generator instance
 * @throws Error if platform is not supported
 */
export function getTargetGenerator(target: SourcePlatform): TargetGenerator {
  const generator = targetGenerators.find((item) => item.target === target)
  if (!generator) {
    throw new Error(`Unsupported target generator: ${target}`)
  }

  return generator
}

/**
 * Auto-detect source platform from input artifact.
 *
 * Tries each parser's detect() method in deterministic order:
 * chatbox -> cherry -> rikkahub
 *
 * @param input - Input artifact descriptor
 * @returns First parser that successfully detects the format
 * @throws Error if no parser can identify the format
 */
export async function detectSourceParser(input: InputArtifact): Promise<SourceParser> {
  for (const parser of sourceParsers) {
    // Keep deterministic order: chatbox -> cherry -> rikkahub
    if (await parser.detect(input)) {
      return parser
    }
  }

  throw new Error(`Unable to detect source format for input: ${input.path}`)
}

/**
 * Parse input with explicit or auto-detected source platform.
 *
 * High-level parsing orchestrator that:
 * 1. Selects parser (explicit or auto-detect)
 * 2. Parses input to CoreBundle
 * 3. Returns both source platform and parsed bundle
 *
 * @param input - Input artifact descriptor
 * @param source - Explicit platform override (optional)
 * @param options - Parse options
 * @returns Object containing detected source and parsed CoreBundle
 */
export async function parseWithSource(
  input: InputArtifact,
  source: SourcePlatform | undefined,
  options: ParseOptions = {}
): Promise<{ source: SourcePlatform; bundle: CoreBundle }> {
  const parser = source ? getSourceParser(source) : await detectSourceParser(input)
  const bundle = await parser.parse(input, options)
  return { source: parser.source, bundle }
}

/**
 * Generate target platform artifacts from CoreBundle.
 *
 * High-level generation orchestrator that:
 * 1. Selects appropriate generator for target
 * 2. Generates platform-specific artifacts
 * 3. Returns array of generated file descriptors
 *
 * @param bundle - Universal CoreBundle data
 * @param target - Target platform identifier
 * @param output - Output target descriptor
 * @param options - Generate options
 * @returns Array of generated artifacts with paths and descriptions
 */
export async function generateForTarget(
  bundle: CoreBundle,
  target: SourcePlatform,
  output: OutputTarget,
  options: GenerateOptions = {}
): Promise<GeneratedArtifact[]> {
  const generator = getTargetGenerator(target)
  return generator.generate(bundle, output, options)
}
