/**
 * ZIP Archive Utilities
 *
 * Wrappers around `unzipper` (read) and `archiver` (write) for reading
 * entries from ZIP archives and packing directories into new ZIPs.
 * Cherry Studio and Rikkahub both ship backups as `.zip` files.
 */

import { createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import archiver from 'archiver'
import unzipper from 'unzipper'

type ZipEntry = {
  path: string
  type?: string
  buffer(): Promise<Buffer>
  stream(): NodeJS.ReadableStream
}

type ZipDirectory = {
  files: ZipEntry[]
}

/**
 * Normalize a ZIP entry path to a forward-slash, no-leading-dot form.
 * Needed because some ZIP tools write entries with backslashes or `./` prefixes.
 */
function normalizeEntryName(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '')
}

/** Open a ZIP archive and return its directory listing. */
async function openZipDirectory(zipPath: string): Promise<ZipDirectory> {
  return (await unzipper.Open.file(zipPath)) as ZipDirectory
}

/**
 * Look up a single file entry inside a ZIP archive.
 * Throws if the entry does not exist or is a directory.
 */
async function getZipEntry(zipPath: string, entryName: string): Promise<ZipEntry> {
  const directory = await openZipDirectory(zipPath)
  const normalizedEntryName = normalizeEntryName(entryName)
  const found = directory.files.find((entry) => normalizeEntryName(entry.path) === normalizedEntryName)
  if (!found || found.type === 'Directory') {
    throw new Error(`ZIP entry not found: ${entryName}`)
  }
  return found
}

/**
 * List all entry paths inside a ZIP archive.
 *
 * @param zipPath - Path to the ZIP file
 * @returns Normalized entry paths (forward slashes, no leading `./`)
 */
export async function listZipEntries(zipPath: string): Promise<string[]> {
  const directory = await openZipDirectory(zipPath)
  return directory.files.map((entry) => normalizeEntryName(entry.path))
}

/**
 * Read a ZIP entry as a UTF-8 string.
 *
 * @param zipPath - Path to the ZIP file
 * @param entryName - Entry path inside the ZIP
 */
export async function readZipTextEntry(zipPath: string, entryName: string): Promise<string> {
  const entry = await getZipEntry(zipPath, entryName)
  const buffer = await entry.buffer()
  return buffer.toString('utf8')
}

/**
 * Read a ZIP entry as a raw binary Buffer.
 *
 * @param zipPath - Path to the ZIP file
 * @param entryName - Entry path inside the ZIP
 */
export async function readZipBinaryEntry(zipPath: string, entryName: string): Promise<Buffer> {
  const entry = await getZipEntry(zipPath, entryName)
  return entry.buffer()
}

/**
 * Extract a single ZIP entry to a file on disk.
 * Creates parent directories as needed.
 *
 * @param zipPath - Path to the ZIP file
 * @param entryName - Entry path inside the ZIP
 * @param outputPath - Destination file path
 */
export async function extractZipEntryToFile(zipPath: string, entryName: string, outputPath: string): Promise<void> {
  const entry = await getZipEntry(zipPath, entryName)
  await fs.mkdir(path.dirname(outputPath), { recursive: true })

  await new Promise<void>((resolve, reject) => {
    const readStream = entry.stream()
    const writeStream = createWriteStream(outputPath)

    readStream.on('error', reject)
    writeStream.on('error', reject)
    writeStream.on('finish', () => resolve())

    readStream.pipe(writeStream)
  })
}

/**
 * Create a ZIP archive from all files in a directory.
 * The archive entries are relative to `sourceDir` (no leading directory component).
 *
 * @param sourceDir - Directory whose contents are packed
 * @param zipPath - Destination ZIP file path
 */
export async function createZipFromDirectory(sourceDir: string, zipPath: string): Promise<void> {
  const resolvedZipPath = path.resolve(zipPath)
  await fs.mkdir(path.dirname(resolvedZipPath), { recursive: true })

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(resolvedZipPath)
    const archive = archiver('zip', {
      zlib: { level: 9 },
    })

    output.on('close', () => resolve())
    output.on('error', reject)

    archive.on('warning', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return
      }
      reject(error)
    })
    archive.on('error', reject)

    archive.pipe(output)
    archive.directory(sourceDir, false)
    void archive.finalize()
  })
}
