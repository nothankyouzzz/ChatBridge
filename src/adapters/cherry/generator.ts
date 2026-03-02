import path from 'node:path'
import fs from 'node:fs/promises'
import { createTempDir, ensureDir, removeDir } from '../../io/fs.ts'
import { writeJsonFile } from '../../io/json.ts'
import { createZipFromDirectory } from '../../io/zip.ts'
import {
  attachTransportExtensions,
  mergeWithPlatformPassthrough,
  readPlatformPassthrough,
} from '../../core/extensions/passthrough.ts'
import type {
  CoreBundle,
  GenerateOptions,
  GeneratedArtifact,
  OutputTarget,
} from '../../core/schema/core.types.ts'
import type { TargetGenerator } from '../types.ts'
import {
  mapCoreConversationsToCherryTables,
  mapCoreProvidersToCherryLlmSlice,
} from './mapper.ts'

/**
 * Resolve output json/zip paths for Cherry generation.
 */
function resolvePaths(targetPath: string): {
  jsonPath?: string
  zipPath?: string
} {
  const lowered = targetPath.toLowerCase()

  if (lowered.endsWith('.json')) {
    return { jsonPath: targetPath }
  }

  if (lowered.endsWith('.zip')) {
    return { zipPath: targetPath }
  }

  return {
    jsonPath: path.join(targetPath, 'data.json'),
    zipPath: path.join(targetPath, 'cherry-studio.backup.zip'),
  }
}

/**
 * Build persisted Redux payload string used by Cherry localStorage.
 */
function buildPersistState(assistantsSlice: Record<string, unknown>, llmSlice: Record<string, unknown>): string {
  const persistPayload = {
    assistants: JSON.stringify(assistantsSlice),
    llm: JSON.stringify(llmSlice),
    settings: JSON.stringify({}),
    _persist: JSON.stringify({
      version: 199,
      rehydrated: true,
    }),
  }

  return JSON.stringify(persistPayload)
}

/**
 * Generate Cherry-compatible backup output from CoreBundle.
 */
export class CherryGenerator implements TargetGenerator {
  readonly target = 'cherry' as const

  async generate(
    bundle: CoreBundle,
    output: OutputTarget,
    options: GenerateOptions = {}
  ): Promise<GeneratedArtifact[]> {
    const now = options.now ?? new Date()
    const preservePrivateState = options.preservePrivateState !== false
    const { jsonPath, zipPath } = resolvePaths(output.path)

    const { topics, messageBlocks, assistantsSlice } = mapCoreConversationsToCherryTables(
      bundle.conversations,
      preservePrivateState
    )
    const llmSlice = mapCoreProvidersToCherryLlmSlice(
      bundle.providers,
      options.includeSecrets === true,
      preservePrivateState
    )

    const passthrough = readPlatformPassthrough(bundle.extensions, 'cherry')
    const passthroughRecord = passthrough && typeof passthrough === 'object' ? (passthrough as Record<string, unknown>) : {}
    const passthroughLocalStorage =
      passthroughRecord.localStorage && typeof passthroughRecord.localStorage === 'object'
        ? (passthroughRecord.localStorage as Record<string, unknown>)
        : {}
    const passthroughIndexedDB =
      passthroughRecord.indexedDB && typeof passthroughRecord.indexedDB === 'object'
        ? (passthroughRecord.indexedDB as Record<string, unknown>)
        : {}

    // KISS merge policy:
    // keep deterministic Core projection, then re-apply Cherry passthrough.
    const mergedBackupData = mergeWithPlatformPassthrough(
        {
          time: now.getTime(),
          version: 5,
          localStorage: {
            ...passthroughLocalStorage,
            'persist:cherry-studio': buildPersistState(assistantsSlice, llmSlice),
          },
          indexedDB: {
            ...passthroughIndexedDB,
            files: [],
            topics,
            settings: [],
            knowledge_notes: [],
            translate_history: [],
            translate_languages: [],
            quick_phrases: [],
            message_blocks: messageBlocks,
          },
        },
        bundle.extensions,
        'cherry',
        preservePrivateState
    )
    const backupData = preservePrivateState
      ? attachTransportExtensions(mergedBackupData, bundle.extensions)
      : mergedBackupData

    const artifacts: GeneratedArtifact[] = []

    if (jsonPath) {
      await ensureDir(path.dirname(jsonPath))
      await writeJsonFile(jsonPath, backupData)
      artifacts.push({
        path: jsonPath,
        description: 'Cherry Studio data.json',
      })
    }

    if (zipPath) {
      const tempDir = await createTempDir('chatbridge-cherry-')
      try {
        await fs.mkdir(path.join(tempDir, 'Data'), { recursive: true })
        await writeJsonFile(path.join(tempDir, 'data.json'), backupData)
        await ensureDir(path.dirname(zipPath))
        await createZipFromDirectory(tempDir, zipPath)
        artifacts.push({
          path: zipPath,
          description: 'Cherry Studio backup zip',
        })
      } finally {
        await removeDir(tempDir)
      }
    }

    return artifacts
  }
}
