/**
 * Inspect Command Implementation
 *
 * Parses and analyzes backup files, outputting detailed statistics
 * in JSON format.
 */

import type { SourcePlatform } from '../../core/schema/core.types.ts'
import { parseWithSource } from '../../adapters/index.ts'

/**
 * Count messages by role type.
 *
 * @param messages - Array of messages with role field
 * @returns Object mapping role names to counts
 */
function countRoles(messages: Array<{ role: string }>): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const message of messages) {
    const role = message.role
    counts[role] = (counts[role] ?? 0) + 1
  }
  return counts
}

/**
 * Execute the inspect command.
 *
 * Parses a backup file and outputs comprehensive statistics including:
 * - Detection results and source platform
 * - Count of conversations, messages, parts, branch points
 * - Provider configurations
 * - Memory usage
 * - Preview samples
 *
 * @param params - Command parameters
 * @param params.inputPath - Path to backup file
 * @param params.source - Force specific source platform (optional)
 * @param params.includeSecrets - Retain secret fields during parsing (summary output does not print raw secrets)
 * @param params.streamThresholdMb - Enable threshold-based stream read path for large files
 */
export async function runInspectCommand(params: {
  inputPath: string
  source?: SourcePlatform
  includeSecrets?: boolean
  streamThresholdMb?: number
}): Promise<void> {
  // Parse the input file with specified or auto-detected source
  const { source, bundle } = await parseWithSource(
    { path: params.inputPath },
    params.source,
    { includeSecrets: params.includeSecrets, streamThresholdMb: params.streamThresholdMb }
  )

  // Flatten and aggregate data for statistics
  const messages = bundle.conversations.flatMap((conversation) => conversation.messages)
  const parts = messages.flatMap((message) => message.parts)
  const branchPoints = bundle.conversations.flatMap((conversation) => conversation.branchPoints ?? [])

  // Count large data URIs (over 1MB) that may impact performance
  const largeDataUriCount = parts.filter((part) => {
    if ((part.type === 'image' || part.type === 'file' || part.type === 'audio' || part.type === 'video') && 'uri' in part) {
      return typeof part.uri === 'string' && part.uri.startsWith('data:') && part.uri.length > 1024 * 1024
    }
    return false
  }).length

  // Build comprehensive summary object
  const summary = {
    detectedSource: source,
    specVersion: bundle.specVersion,
    exportedAt: bundle.exportedAt,
    sourceInfo: bundle.source,
    conversations: bundle.conversations.length,
    messages: messages.length,
    parts: parts.length,
    branchPoints: branchPoints.length,
    providers: bundle.providers.length,
    assets: bundle.assets?.length ?? 0,
    roles: countRoles(messages),
    potentialLargeDataUris: largeDataUriCount,
    heapUsedMb: Number((process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(2)),
    conversationsPreview: bundle.conversations.slice(0, 5).map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      messages: conversation.messages.length,
      branchPoints: conversation.branchPoints?.length ?? 0,
      pinned: conversation.pinned ?? false,
      updatedAt: conversation.updatedAt,
    })),
    providersPreview: bundle.providers.slice(0, 10).map((provider) => ({
      id: provider.id,
      type: provider.type,
      models: provider.models?.length ?? 0,
      enabled: provider.enabled ?? true,
    })),
  }

  // Output summary as formatted JSON to stdout
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
}
