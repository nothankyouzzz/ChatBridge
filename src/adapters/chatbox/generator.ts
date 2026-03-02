import path from 'node:path'
import { ensureDir } from '../../io/fs.ts'
import { writeJsonFile } from '../../io/json.ts'
import { attachTransportExtensions, mergeWithPlatformPassthrough } from '../../core/extensions/passthrough.ts'
import type {
  CoreBundle,
  GenerateOptions,
  GeneratedArtifact,
  OutputTarget,
} from '../../core/schema/core.types.ts'
import type { TargetGenerator } from '../types.ts'
import {
  mapCoreConversationToChatboxSession,
  mapCoreProvidersToChatboxSettingsProviders,
} from './mapper.ts'

/**
 * Resolve final output path for Chatbox JSON export.
 */
function resolveOutputPath(targetPath: string): string {
  if (targetPath.toLowerCase().endsWith('.json')) {
    return targetPath
  }

  const stamp = new Date().toISOString().slice(0, 10)
  return path.join(targetPath, `chatbox-exported-data-${stamp}.json`)
}

/**
 * Generate Chatbox-compatible backup payload from CoreBundle.
 */
export class ChatboxGenerator implements TargetGenerator {
  readonly target = 'chatbox' as const

  async generate(
    bundle: CoreBundle,
    output: OutputTarget,
    options: GenerateOptions = {}
  ): Promise<GeneratedArtifact[]> {
    const now = options.now ?? new Date()
    const preservePrivateState = options.preservePrivateState !== false
    const outputPath = resolveOutputPath(output.path)
    await ensureDir(path.dirname(outputPath))

    const sessions = bundle.conversations.map((conversation) =>
      mapCoreConversationToChatboxSession(conversation, preservePrivateState)
    )
    const basePayload: Record<string, unknown> = {
      settings: {
        providers: mapCoreProvidersToChatboxSettingsProviders(
          bundle.providers,
          options.includeSecrets === true,
          preservePrivateState
        ),
      },
      'chat-sessions-list': bundle.conversations.map((conversation) => ({
        id: conversation.id,
        name: conversation.title,
        starred: conversation.pinned ?? false,
      })),
      '__exported_items': ['setting', 'conversations'],
      '__exported_at': now.toISOString(),
    }

    // KISS merge policy:
    // 1) start from deterministic Core projection
    // 2) re-apply Chatbox private payload when enabled
    const mergedPayload = mergeWithPlatformPassthrough(
        basePayload,
        bundle.extensions,
        'chatbox',
        preservePrivateState
    )
    const payload = preservePrivateState
      ? attachTransportExtensions(mergedPayload, bundle.extensions)
      : mergedPayload

    for (const session of sessions) {
      const id = typeof session.id === 'string' ? session.id : crypto.randomUUID()
      payload[`session:${id}`] = {
        ...session,
        id,
      }
    }

    await writeJsonFile(outputPath, payload)

    return [
      {
        path: outputPath,
        description: 'Chatbox backup JSON',
      },
    ]
  }
}
