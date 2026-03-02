/**
 * JSON File Operations
 *
 * Utilities for reading and writing JSON files with an optional
 * threshold-based stream read path for large files.
 */

import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import { readText, writeText } from './fs.ts'

/**
 * Read and parse JSON file.
 *
 * Automatically switches to stream-based file reading for files
 * exceeding the threshold.
 *
 * Note: the current implementation still builds a full JSON string
 * before calling `JSON.parse`.
 *
 * @param filePath - Path to JSON file
 * @param options - Options object
 * @param options.streamThresholdBytes - File size threshold for stream read path (optional)
 * @returns Parsed JSON object
 *
 * @example
 * // Normal read (small file)
 * const data = await readJsonFile('config.json')
 *
 * // Streaming read (large file)
 * const bigData = await readJsonFile('backup.json', { streamThresholdBytes: 10_000_000 })
 */
export async function readJsonFile<T = unknown>(
  filePath: string,
  options: {
    streamThresholdBytes?: number
  } = {}
): Promise<T> {
  const stat = await fs.stat(filePath)
  const threshold = options.streamThresholdBytes

  let raw: string
  if (typeof threshold === 'number' && threshold > 0 && stat.size >= threshold) {
    // Use stream read path for large files
    raw = await readTextStream(filePath)
  } else {
    // Use regular file read for small files
    raw = await readText(filePath)
  }

  return JSON.parse(raw) as T
}

/**
 * Write object as JSON file.
 *
 * @param filePath - Target file path
 * @param value - Object to serialize
 * @param pretty - Whether to format with indentation (default: true)
 */
export async function writeJsonFile(filePath: string, value: unknown, pretty = true): Promise<void> {
  const text = pretty ? `${JSON.stringify(value, null, 2)}\n` : JSON.stringify(value)
  await writeText(filePath, text)
}

/**
 * Read file as text using stream-based file reading.
 * Used internally by threshold path.
 *
 * @param filePath - Path to file
 * @returns File contents as string
 */
async function readTextStream(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = createReadStream(filePath, { encoding: 'utf8' })
    let output = ''

    stream.on('data', (chunk: string) => {
      output += chunk
    })
    stream.on('error', reject)
    stream.on('end', () => resolve(output))
  })
}
