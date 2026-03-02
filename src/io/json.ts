/**
 * JSON File Operations
 *
 * Utilities for reading and writing JSON files with an optional
 * threshold-based stream parse path for large files.
 */

import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import streamJson from 'stream-json'
import Assembler from 'stream-json/Assembler.js'
import { readText, writeText } from './fs.ts'

const parser = (streamJson as unknown as { parser: (options?: Record<string, unknown>) => NodeJS.ReadWriteStream }).parser

/**
 * Read and parse a JSON file using a token-stream pipeline.
 *
 * Suitable for files too large to comfortably hold in a single string.
 * Uses `stream-json` tokenizer + `Assembler` to build the value incrementally.
 *
 * @param filePath - Path to the file to read
 * @returns Fully assembled parsed value
 */
export async function readJsonFromStream<T = unknown>(filePath: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const source = createReadStream(filePath, { encoding: 'utf8' })
    const tokenStream = source.pipe(parser())
    const assembler = Assembler.connectTo(tokenStream)

    let settled = false
    const settle = (error: unknown, value?: T): void => {
      if (settled) {
        return
      }
      settled = true
      if (error) {
        reject(error)
        return
      }
      resolve(value as T)
    }

    source.on('error', (error) => settle(error))
    tokenStream.on('error', (error) => settle(error))
    tokenStream.on('end', () => settle(undefined, assembler.current as T))
  })
}

/**
 * Read and parse JSON file.
 *
 * Automatically switches to token-stream parse for files
 * exceeding the threshold.
 *
 * @param filePath - Path to JSON file
 * @param options - Options object
 * @param options.streamThresholdBytes - File size threshold for stream parse path (optional)
 * @returns Parsed JSON object
 */
export async function readJsonFile<T = unknown>(
  filePath: string,
  options: {
    streamThresholdBytes?: number
  } = {}
): Promise<T> {
  const stat = await fs.stat(filePath)
  const threshold = options.streamThresholdBytes

  if (typeof threshold === 'number' && threshold > 0 && stat.size >= threshold) {
    return readJsonFromStream<T>(filePath)
  }

  const raw = await readText(filePath)
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
