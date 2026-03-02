import { readJsonFromStream as readJsonFromStreamParser } from './json.ts'

export async function readJsonFromStream<T = unknown>(filePath: string): Promise<T> {
  return readJsonFromStreamParser<T>(filePath)
}
