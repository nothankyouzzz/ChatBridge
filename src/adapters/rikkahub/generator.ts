import type { CoreBundle, GenerateOptions, GeneratedArtifact, OutputTarget } from '../../core/schema/core.types.ts'
import path from 'node:path'
import { createTempDir, ensureDir, removeDir } from '../../io/fs.ts'
import { writeJsonFile } from '../../io/json.ts'
import { createZipFromDirectory } from '../../io/zip.ts'
import type { TargetGenerator } from '../types.ts'
import { buildRikkahubExportPayloadWithOptions } from './generator-mapper.ts'
import { writeRikkahubSqliteSnapshot } from './sqlite-writer.ts'

/**
 * Resolve final output location for Rikkahub backup zip.
 */
function resolveZipPath(targetPath: string): string {
  if (targetPath.toLowerCase().endsWith('.zip')) {
    return targetPath
  }

  return path.join(targetPath, 'rikka_hub.backup.zip')
}

/**
 * Generate a Rikkahub-compatible backup zip.
 *
 * Output layout:
 * - `rikka_hub.db`  (Room-compatible SQLite snapshot)
 * - `settings.json` (provider/settings payload)
 */
export class RikkahubGenerator implements TargetGenerator {
  readonly target = 'rikkahub' as const

  async generate(
    bundle: CoreBundle,
    output: OutputTarget,
    options: GenerateOptions = {},
  ): Promise<GeneratedArtifact[]> {
    const zipPath = resolveZipPath(output.path)
    const tempDir = await createTempDir('chatbridge-rikkahub-export-')

    try {
      const payload = buildRikkahubExportPayloadWithOptions(
        bundle,
        options.includeSecrets === true,
        options.preservePrivateState !== false,
      )
      const dbPath = path.join(tempDir, 'rikka_hub.db')
      const settingsPath = path.join(tempDir, 'settings.json')

      writeRikkahubSqliteSnapshot({
        dbPath,
        conversations: payload.conversations,
        nodes: payload.nodes,
      })

      await writeJsonFile(settingsPath, payload.settings)

      await ensureDir(path.dirname(zipPath))
      await createZipFromDirectory(tempDir, zipPath)

      return [
        {
          path: zipPath,
          description: 'Rikkahub backup zip',
        },
      ]
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to generate Rikkahub backup: ${message}`, { cause: error })
    } finally {
      await removeDir(tempDir)
    }
  }
}
