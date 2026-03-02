/**
 * Convert Command Implementation
 *
 * Transforms backup files from one platform format to another,
 * preserving conversations, messages, and provider configurations.
 */

import type { SourcePlatform } from '../../core/schema/core.types.ts'
import { generateForTarget, parseWithSource } from '../../adapters/index.ts'

/**
 * Execute the convert command.
 *
 * Parses source backup, transforms to Core format, then generates
 * target platform artifacts.
 *
 * @param params - Command parameters
 * @param params.inputPath - Source backup file path
 * @param params.outputPath - Target output path (file or directory)
 * @param params.source - Force specific source platform (optional)
 * @param params.target - Target platform to generate
 * @param params.includeSecrets - Include API keys/secrets in output
 * @param params.preservePrivateState - Preserve platform extensions and transport extension channel
 * @param params.streamThresholdMb - Enable threshold-based stream read path for large files
 */
export async function runConvertCommand(params: {
  inputPath: string
  outputPath: string
  source?: SourcePlatform
  target: SourcePlatform
  includeSecrets?: boolean
  preservePrivateState?: boolean
  streamThresholdMb?: number
}): Promise<void> {
  // Step 1: Parse source backup to Core format
  const { source, bundle } = await parseWithSource({ path: params.inputPath }, params.source, {
    includeSecrets: params.includeSecrets,
    preservePrivateState: params.preservePrivateState,
    streamThresholdMb: params.streamThresholdMb,
  })

  // Step 2: Generate target platform artifacts
  const artifacts = await generateForTarget(
    bundle,
    params.target,
    { path: params.outputPath },
    {
      includeSecrets: params.includeSecrets,
      preservePrivateState: params.preservePrivateState,
    },
  )

  // Step 3: Build response summary
  const response = {
    source,
    target: params.target,
    conversations: bundle.conversations.length,
    providers: bundle.providers.length,
    artifacts,
    options: {
      includeSecrets: params.includeSecrets === true,
      preservePrivateState: params.preservePrivateState !== false,
      streamThresholdMb: params.streamThresholdMb,
    },
  }

  // Output summary as formatted JSON to stdout
  process.stdout.write(`${JSON.stringify(response, null, 2)}\n`)
}
