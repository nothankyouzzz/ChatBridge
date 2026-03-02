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

function normalizeEntryName(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '')
}

async function openZipDirectory(zipPath: string): Promise<ZipDirectory> {
  return (await unzipper.Open.file(zipPath)) as ZipDirectory
}

async function getZipEntry(zipPath: string, entryName: string): Promise<ZipEntry> {
  const directory = await openZipDirectory(zipPath)
  const normalizedEntryName = normalizeEntryName(entryName)
  const found = directory.files.find((entry) => normalizeEntryName(entry.path) === normalizedEntryName)
  if (!found || found.type === 'Directory') {
    throw new Error(`ZIP entry not found: ${entryName}`)
  }
  return found
}

export async function listZipEntries(zipPath: string): Promise<string[]> {
  const directory = await openZipDirectory(zipPath)
  return directory.files.map((entry) => normalizeEntryName(entry.path))
}

export async function readZipTextEntry(zipPath: string, entryName: string): Promise<string> {
  const entry = await getZipEntry(zipPath, entryName)
  const buffer = await entry.buffer()
  return buffer.toString('utf8')
}

export async function readZipBinaryEntry(zipPath: string, entryName: string): Promise<Buffer> {
  const entry = await getZipEntry(zipPath, entryName)
  return entry.buffer()
}

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
