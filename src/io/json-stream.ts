import { createReadStream } from 'node:fs'

export async function readJsonFromStream<T = unknown>(filePath: string): Promise<T> {
  const raw = await new Promise<string>((resolve, reject) => {
    const stream = createReadStream(filePath, { encoding: 'utf8' })
    let output = ''

    stream.on('data', (chunk: string) => {
      output += chunk
    })
    stream.on('error', reject)
    stream.on('end', () => resolve(output))
  })

  return JSON.parse(raw) as T
}
