import { createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'

async function runCommand(
  command: string,
  args: string[],
  options: {
    cwd?: string
    encoding?: BufferEncoding
  } = {}
): Promise<string | Buffer> {
  const encoding = options.encoding ?? 'utf8'

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutChunks.push(chunk)
    })

    child.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk)
    })

    child.on('error', (error) => {
      reject(error)
    })

    child.on('close', (code) => {
      if (code !== 0) {
        const stderr = Buffer.concat(stderrChunks).toString('utf8').trim()
        reject(new Error(`${command} ${args.join(' ')} failed with code ${code}: ${stderr}`))
        return
      }

      const stdout = Buffer.concat(stdoutChunks)
      if (encoding === 'buffer') {
        resolve(stdout)
        return
      }

      resolve(stdout.toString(encoding))
    })
  })
}

export async function listZipEntries(zipPath: string): Promise<string[]> {
  const raw = await runCommand('unzip', ['-Z1', zipPath], { encoding: 'utf8' })
  return String(raw)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

export async function readZipTextEntry(zipPath: string, entryName: string): Promise<string> {
  const output = await runCommand('unzip', ['-p', zipPath, entryName], { encoding: 'utf8' })
  return String(output)
}

export async function readZipBinaryEntry(zipPath: string, entryName: string): Promise<Buffer> {
  const output = await runCommand('unzip', ['-p', zipPath, entryName], { encoding: 'buffer' })
  return Buffer.from(output)
}

export async function extractZipEntryToFile(zipPath: string, entryName: string, outputPath: string): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true })

  await new Promise<void>((resolve, reject) => {
    const child = spawn('unzip', ['-p', zipPath, entryName], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const out = createWriteStream(outputPath)
    const stderrChunks: Buffer[] = []

    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk))
    child.stdout.pipe(out)

    let streamFinished = false
    let childExited = false
    let childExitCode = 0

    const maybeResolve = () => {
      if (streamFinished && childExited && childExitCode === 0) {
        resolve()
      }
    }

    out.on('error', reject)
    out.on('finish', () => {
      streamFinished = true
      maybeResolve()
    })
    child.on('error', reject)

    child.on('close', (code) => {
      childExited = true
      childExitCode = code ?? 0
      if (code !== 0) {
        reject(new Error(`Failed to extract ${entryName}: ${Buffer.concat(stderrChunks).toString('utf8')}`))
        return
      }
      maybeResolve()
    })
  })
}

export async function createZipFromDirectory(sourceDir: string, zipPath: string): Promise<void> {
  await fs.mkdir(path.dirname(zipPath), { recursive: true })
  await runCommand('zip', ['-rq', zipPath, '.'], { cwd: sourceDir, encoding: 'utf8' })
}
