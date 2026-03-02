import path from 'node:path'
import { readJsonFile } from '../../io/json.ts'
import { CoreBundleSchema } from '../../core/schema/core.zod.ts'
import type { CoreBundle, InputArtifact, ParseOptions } from '../../core/schema/core.types.ts'
import { appendLineage, capturePlatformPassthrough, readTransportExtensions } from '../../core/extensions/passthrough.ts'
import type { SourceParser } from '../types.ts'
import {
  mapChatboxProvidersToCore,
  mapChatboxSessionToCore,
} from './mapper.ts'

/**
 * Lightweight format fingerprint for Chatbox backup payloads.
 */
function hasChatboxSignals(payload: Record<string, unknown>): boolean {
  if (Array.isArray(payload['chat-sessions-list'])) {
    return true
  }

  if (payload.settings && typeof payload.settings === 'object') {
    return true
  }

  return Object.keys(payload).some((key) => key.startsWith('session:'))
}

/**
 * Parse Chatbox backup artifacts into CoreBundle.
 */
export class ChatboxParser implements SourceParser {
  readonly source = 'chatbox' as const

  async detect(input: InputArtifact): Promise<boolean> {
    if (path.extname(input.path).toLowerCase() !== '.json') {
      return false
    }

    try {
      const data = await readJsonFile<Record<string, unknown>>(input.path)
      return hasChatboxSignals(data)
    } catch {
      return false
    }
  }

  async parse(input: InputArtifact, options: ParseOptions = {}): Promise<CoreBundle> {
    // OOM guard: switch to stream path when caller provides threshold.
    const streamThresholdBytes =
      typeof options.streamThresholdMb === 'number' ? Math.max(0, Math.round(options.streamThresholdMb * 1024 * 1024)) : undefined
    const data = await readJsonFile<Record<string, unknown>>(input.path, { streamThresholdBytes })

    const rawSessions: unknown[] = []
    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith('session:')) {
        rawSessions.push(value)
      }
    }

    if (rawSessions.length === 0 && Array.isArray(data['chat-sessions'])) {
      rawSessions.push(...(data['chat-sessions'] as unknown[]))
    }

    const conversations = rawSessions
      .map((session) => mapChatboxSessionToCore(session, options.includeSecrets === true))
      .filter((conversation): conversation is NonNullable<typeof conversation> => Boolean(conversation))

    const settings = data.settings && typeof data.settings === 'object' ? (data.settings as Record<string, unknown>) : {}
    const providers = mapChatboxProvidersToCore(settings.providers, options.includeSecrets === true)

    // Keep an opaque snapshot of Chatbox-native payload for lossless return.
    const passthroughBundle = Object.fromEntries(
      Object.entries(data).filter(([key]) => key === 'settings' || key.startsWith('session:') || key.startsWith('__'))
    )

    const transportExtensions = readTransportExtensions(data)
    let extensions = capturePlatformPassthrough(
      transportExtensions,
      'chatbox',
      passthroughBundle,
      options.includeSecrets === true
    )
    extensions = appendLineage(extensions, {
      from: 'chatbox',
      at: new Date().toISOString(),
    })

    const bundle: CoreBundle = {
      specVersion: '1.0',
      exportedAt:
        typeof data.__exported_at === 'string' && !Number.isNaN(Date.parse(data.__exported_at))
          ? new Date(data.__exported_at).toISOString()
          : new Date().toISOString(),
      conversations,
      providers,
      source: {
        platform: 'chatbox',
        version: typeof data.configVersion === 'string' ? data.configVersion : undefined,
      },
      extensions,
    }

    return CoreBundleSchema.parse(bundle)
  }
}
