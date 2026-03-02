import path from 'node:path'
import { createTempDir, removeDir, statSafe } from '../../io/fs.ts'
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
import { mapRikkahubProvidersToCore, mapRikkahubRowsToCoreConversations } from './mapper.ts'
import { readRikkahubConversations, readRikkahubMessageNodes, readSchemaVersion } from './sqlite.ts'

/**
 * Read `settings.json` from backup zip.
 *
 * We parse settings as an opaque record first, then map only the stable
 * provider intersection into Core and keep the rest in passthrough.
 */
async function loadSettingsFromZip(
  zipPath: string,
  tempDir: string,
  streamThresholdBytes: number | undefined,
): Promise<Record<string, unknown>> {
  const settingsPath = path.join(tempDir, 'settings.json')
  await extractZipEntryToFile(zipPath, 'settings.json', settingsPath)
  return readJsonFile<Record<string, unknown>>(settingsPath, { streamThresholdBytes })
}

/**
 * Parse Rikkahub backup zip into ChatBridge Core bundle.
 *
 * KISS mapping policy:
 * - Keep Room database as source of truth for conversations/messages.
 * - Keep `settings.json` as provider/settings source.
 * - Preserve unmapped state through passthrough for lossless return hops.
 */
export class RikkahubParser implements SourceParser {
  readonly source = 'rikkahub' as const

  async detect(input: InputArtifact): Promise<boolean> {
    if (path.extname(input.path).toLowerCase() !== '.zip') {
      return false
    }

    try {
      const entries = await listZipEntries(input.path)
      return entries.includes('settings.json') && entries.includes('rikka_hub.db')
    } catch {
      return false
    }
  }

  async parse(input: InputArtifact, options: ParseOptions = {}): Promise<CoreBundle> {
    const tempDir = await createTempDir('chatbridge-rikkahub-')
    // OOM guard: large JSON settings can switch to stream-based read path.
    const streamThresholdBytes =
      typeof options.streamThresholdMb === 'number'
        ? Math.max(0, Math.round(options.streamThresholdMb * 1024 * 1024))
        : undefined

    try {
      const entries = await listZipEntries(input.path)
      const settings = await loadSettingsFromZip(input.path, tempDir, streamThresholdBytes)

      const dbPath = path.join(tempDir, 'rikka_hub.db')
      await extractZipEntryToFile(input.path, 'rikka_hub.db', dbPath)

      // WAL/SHM are optional but may hold latest pages.
      if (entries.includes('rikka_hub-wal')) {
        await extractZipEntryToFile(input.path, 'rikka_hub-wal', path.join(tempDir, 'rikka_hub-wal'))
      }

      if (entries.includes('rikka_hub-shm')) {
        await extractZipEntryToFile(input.path, 'rikka_hub-shm', path.join(tempDir, 'rikka_hub-shm'))
      }

      const conversationRows = readRikkahubConversations(dbPath)
      const nodeRows = readRikkahubMessageNodes(dbPath)
      const conversations = mapRikkahubRowsToCoreConversations(
        conversationRows,
        nodeRows,
        options.includeSecrets === true,
      )
      const providers = mapRikkahubProvidersToCore(settings, options.includeSecrets === true)

      const sourceVersion = readSchemaVersion(dbPath)
      const stats = await statSafe(input.path)

      const transportExtensions = readTransportExtensions(settings)
      let extensions = capturePlatformPassthrough(
        transportExtensions,
        'rikkahub',
        settings,
        options.includeSecrets === true,
      )
      extensions = appendLineage(extensions, {
        from: 'rikkahub',
        at: new Date().toISOString(),
      })

      const bundle: CoreBundle = {
        specVersion: '1.0',
        exportedAt: stats?.mtime ? stats.mtime.toISOString() : new Date().toISOString(),
        conversations,
        providers,
        source: {
          platform: 'rikkahub',
          version: sourceVersion === undefined ? undefined : String(sourceVersion),
        },
        extensions,
      }

      return CoreBundleSchema.parse(bundle)
    } finally {
      await removeDir(tempDir)
    }
  }
}
