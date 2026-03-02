/**
 * Core Adapter Interfaces
 *
 * Defines the contracts that platform adapters must implement to support
 * parsing (reading) and generating (writing) backup files.
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

/**
 * Interface for platform-specific backup parsers.
 *
 * Each supported platform must implement this interface to enable
 * reading their backup format and converting it to CoreBundle.
 */
export interface SourceParser {
  /** Platform identifier (e.g., 'chatbox', 'cherry', 'rikkahub') */
  readonly source: SourcePlatform

  /**
   * Detect if an input artifact matches this parser's format.
   *
   * @param input - Input artifact descriptor
   * @returns True if format matches, false otherwise
   */
  detect(input: InputArtifact): Promise<boolean>

  /**
   * Parse platform backup into universal CoreBundle format.
   *
   * @param input - Input artifact descriptor
   * @param options - Parse options (secrets, streaming, etc.)
   * @returns Normalized CoreBundle
   */
  parse(input: InputArtifact, options?: ParseOptions): Promise<CoreBundle>
}

/**
 * Interface for platform-specific backup generators.
 *
 * Each supported platform must implement this interface to enable
 * writing CoreBundle data back to their native format.
 */
export interface TargetGenerator {
  /** Platform identifier (e.g., 'chatbox', 'cherry', 'rikkahub') */
  readonly target: SourcePlatform

  /**
   * Generate platform-specific artifacts from CoreBundle.
   *
   * @param bundle - Universal CoreBundle data
   * @param output - Output target descriptor
   * @param options - Generate options (secrets, timestamps, etc.)
   * @returns Array of generated artifacts with paths
   */
  generate(bundle: CoreBundle, output: OutputTarget, options?: GenerateOptions): Promise<GeneratedArtifact[]>
}
