/**
 * File System Utilities
 *
 * Wrapper functions for common file system operations with
 * error handling and directory creation.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

/**
 * Check if a file or directory exists.
 *
 * @param filePath - Path to check
 * @returns True if exists, false otherwise
 */
export async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * Ensure directory exists, creating it if necessary.
 *
 * @param dirPath - Directory path to ensure
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true })
}

/**
 * Read file as UTF-8 text.
 *
 * @param filePath - Path to file
 * @returns File contents as string
 */
export async function readText(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf8')
}

/**
 * Write UTF-8 text to file.
 * Creates parent directories if needed.
 *
 * @param filePath - Target file path
 * @param text - Text content to write
 */
export async function writeText(filePath: string, text: string): Promise<void> {
  const parent = path.dirname(filePath)
  await ensureDir(parent)
  await fs.writeFile(filePath, text, 'utf8')
}

/**
 * Write binary data to file.
 * Creates parent directories if needed.
 *
 * @param filePath - Target file path
 * @param data - Binary data buffer
 */
export async function writeBinary(filePath: string, data: Buffer): Promise<void> {
  const parent = path.dirname(filePath)
  await ensureDir(parent)
  await fs.writeFile(filePath, data)
}

/**
 * Create a temporary directory.
 *
 * @param prefix - Directory name prefix (default: 'chatbridge-')
 * @returns Path to created temporary directory
 */
export async function createTempDir(prefix = 'chatbridge-'): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix))
}

/**
 * Remove directory recursively.
 *
 * @param dirPath - Directory path to remove
 */
export async function removeDir(dirPath: string): Promise<void> {
  await fs.rm(dirPath, { recursive: true, force: true })
}

/**
 * Safely get file stats without throwing.
 *
 * @param filePath - Path to file/directory
 * @returns File stats or undefined if error
 */
export async function statSafe(filePath: string) {
  try {
    return await fs.stat(filePath)
  } catch {
    return undefined
  }
}
