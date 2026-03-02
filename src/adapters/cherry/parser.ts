import path from 'node:path'
import { createTempDir, removeDir } from '../../io/fs.ts'
import { readJsonFile } from '../../io/json.ts'
import { extractZipEntryToFile, listZipEntries } from '../../io/zip.ts'
import { CoreBundleSchema } from '../../core/schema/core.zod.ts'
import {
  appendLineage,
  capturePlatformPassthrough,
  readTransportExtensions,
} from '../../core/extensions/passthrough.ts'
import type { CoreBundle, InputArtifact, ParseOptions } from '../../core/schema/core.types.ts'
import type { SourceParser } from '../types.ts'
import {
  buildCherryTopicMetaMap,
  mapCherryProvidersToCore,
  mapCherryTopicsToCoreConversations,
  parseCherryPersistRaw,
} from './mapper.ts'

/**
 * Load Cherry backup payload (zip or json) with optional stream threshold.
 */
async function loadCherryBackup(
  inputPath: string,
  streamThresholdBytes: number | undefined,
): Promise<Record<string, unknown>> {
  const ext = path.extname(inputPath).toLowerCase()

  if (ext === '.zip') {
    const tempDir = await createTempDir('chatbridge-cherry-parse-')
    try {
      const extracted = path.join(tempDir, 'data.json')
      await extractZipEntryToFile(inputPath, 'data.json', extracted)
      return readJsonFile<Record<string, unknown>>(extracted, { streamThresholdBytes })
    } finally {
      await removeDir(tempDir)
    }
  }

  return readJsonFile<Record<string, unknown>>(inputPath, { streamThresholdBytes })
}

/**
 * Lightweight format fingerprint for Cherry backup payloads.
 */
function hasCherrySignals(payload: Record<string, unknown>): boolean {
  if (typeof payload.version !== 'number') {
    return false
  }

  if (!payload.localStorage || typeof payload.localStorage !== 'object') {
    return false
  }

  return payload.indexedDB !== undefined
}

/**
 * Parse Cherry backup artifact into CoreBundle.
 */
export class CherryParser implements SourceParser {
  readonly source = 'cherry' as const

  async detect(input: InputArtifact): Promise<boolean> {
    const ext = path.extname(input.path).toLowerCase()

    try {
      if (ext === '.zip') {
        const entries = await listZipEntries(input.path)
        return entries.includes('data.json')
      }

      const payload = await readJsonFile<Record<string, unknown>>(input.path)
      return hasCherrySignals(payload)
    } catch {
      return false
    }
  }

  async parse(input: InputArtifact, options: ParseOptions = {}): Promise<CoreBundle> {
    // OOM guard: caller can force stream path for large JSON payloads.
    const streamThresholdBytes =
      typeof options.streamThresholdMb === 'number'
        ? Math.max(0, Math.round(options.streamThresholdMb * 1024 * 1024))
        : undefined
    const payload = await loadCherryBackup(input.path, streamThresholdBytes)

    const localStorage =
      payload.localStorage && typeof payload.localStorage === 'object'
        ? (payload.localStorage as Record<string, unknown>)
        : {}

    const persistState = parseCherryPersistRaw(localStorage['persist:cherry-studio'])
    const indexedDB =
      payload.indexedDB && typeof payload.indexedDB === 'object' ? (payload.indexedDB as Record<string, unknown>) : {}

    const topicMetaMap = buildCherryTopicMetaMap(persistState)
    const conversations = mapCherryTopicsToCoreConversations(
      indexedDB.topics,
      indexedDB.message_blocks,
      topicMetaMap,
      options.includeSecrets === true,
    )

    const providers = mapCherryProvidersToCore(persistState, options.includeSecrets === true)

    // Keep non-core IndexedDB tables opaque for roundtrip preservation.
    const indexedDBPassthrough =
      payload.indexedDB && typeof payload.indexedDB === 'object'
        ? Object.fromEntries(
            Object.entries(payload.indexedDB as Record<string, unknown>).filter(
              ([key]) => key !== 'topics' && key !== 'message_blocks',
            ),
          )
        : {}

    const transportExtensions = readTransportExtensions(payload)
    let extensions = capturePlatformPassthrough(
      transportExtensions,
      'cherry',
      {
        localStorage,
        indexedDB: indexedDBPassthrough,
        version: payload.version,
      },
      options.includeSecrets === true,
    )
    extensions = appendLineage(extensions, {
      from: 'cherry',
      at: new Date().toISOString(),
    })

    const bundle: CoreBundle = {
      specVersion: '1.0',
      exportedAt: typeof payload.time === 'number' ? new Date(payload.time).toISOString() : new Date().toISOString(),
      conversations,
      providers,
      source: {
        platform: 'cherry',
        version: typeof payload.version === 'number' ? String(payload.version) : undefined,
      },
      extensions,
    }

    return CoreBundleSchema.parse(bundle)
  }
}
