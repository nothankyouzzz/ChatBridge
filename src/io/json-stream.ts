/**
 * JSON Stream Re-export
 *
 * Thin public façade so callers can import `readJsonFromStream` from this module
 * without coupling to the internal `json.ts` implementation detail.
 */
import { readJsonFromStream as readJsonFromStreamParser } from './json.ts'

export async function readJsonFromStream<T = unknown>(filePath: string): Promise<T> {
  return readJsonFromStreamParser<T>(filePath)
}
