import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { createTempDir, removeDir } from '../../io/fs.ts'
import { createZipFromDirectory, listZipEntries } from '../../io/zip.ts'

test('createZipFromDirectory writes zip when output path is relative', async () => {
  const tempDir = await createTempDir('chatbridge-test-zip-relative-')

  try {
    const payloadDir = path.join(tempDir, 'payload')
    await fs.mkdir(payloadDir, { recursive: true })
    await fs.writeFile(path.join(payloadDir, 'data.json'), '{"ok":true}', 'utf8')

    const absoluteZipPath = path.join(tempDir, 'out', 'backup.zip')
    const relativeZipPath = path.relative(process.cwd(), absoluteZipPath)

    await createZipFromDirectory(payloadDir, relativeZipPath)

    const stat = await fs.stat(absoluteZipPath)
    assert.equal(stat.isFile(), true)

    const entries = await listZipEntries(absoluteZipPath)
    assert.equal(entries.includes('data.json'), true)
  } finally {
    await removeDir(tempDir)
  }
})
