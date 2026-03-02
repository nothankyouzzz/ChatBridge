/**
 * Parsed command-line arguments structure.
 *
 * @property command - The primary command name (e.g., 'inspect', 'convert')
 * @property positional - Array of positional arguments (command + its arguments)
 * @property flags - Key-value pairs of flags (e.g., --source=chatbox, --include-secrets)
 */
export type ParsedArgs = {
  command?: string
  positional: string[]
  flags: Record<string, string | boolean>
}

/**
 * Parse command-line arguments into structured format.
 *
 * Supports multiple flag formats:
 * - Boolean flags: --flag
 * - Key-value with equals: --key=value
 * - Key-value with space: --key value
 *
 * @param argv - Array of command-line arguments (typically process.argv.slice(2))
 * @returns Parsed arguments with command, positional args, and flags
 *
 * @example
 * parseArgs(['inspect', 'input.json', '--source', 'chatbox', '--include-secrets'])
 * // Returns:
 * // {
 * //   command: 'inspect',
 * //   positional: ['inspect', 'input.json'],
 * //   flags: { source: 'chatbox', 'include-secrets': true }
 * // }
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = []
  const flags: Record<string, string | boolean> = {}

  let index = 0
  while (index < argv.length) {
    const token = argv[index]

    // Process flags starting with '--'
    if (token.startsWith('--')) {
      const keyValue = token.slice(2)
      const equalIndex = keyValue.indexOf('=')

      // Handle --key=value format
      if (equalIndex >= 0) {
        const key = keyValue.slice(0, equalIndex)
        const value = keyValue.slice(equalIndex + 1)
        flags[key] = value
        index += 1
        continue
      }

      // Handle --key value or --key (boolean) format
      const key = keyValue
      const next = argv[index + 1]
      if (next !== undefined && !next.startsWith('--')) {
        // Next token is the value for this flag
        flags[key] = next
        index += 2
      } else {
        // Standalone flag without value, treat as boolean true
        flags[key] = true
        index += 1
      }
      continue
    }

    // Non-flag tokens are positional arguments
    positional.push(token)
    index += 1
  }

  return {
    command: positional[0],
    positional,
    flags,
  }
}

/**
 * Extract a string value from parsed flags.
 *
 * @param flags - Parsed flags object
 * @param key - Flag name to retrieve
 * @returns String value if present, undefined otherwise
 */
export function readStringFlag(flags: Record<string, string | boolean>, key: string): string | undefined {
  const value = flags[key]
  return typeof value === 'string' ? value : undefined
}

/**
 * Extract a boolean value from parsed flags.
 *
 * Supports multiple truthy representations:
 * - Boolean true (from standalone flags like --flag)
 * - String values: '1', 'true', 'yes' (case-insensitive)
 *
 * @param flags - Parsed flags object
 * @param key - Flag name to retrieve
 * @returns Boolean value (defaults to false if not present or falsy)
 *
 * @example
 * readBoolFlag({ 'include-secrets': true }, 'include-secrets') // true
 * readBoolFlag({ verbose: 'yes' }, 'verbose') // true
 * readBoolFlag({ quiet: 'false' }, 'quiet') // false
 */
export function readBoolFlag(flags: Record<string, string | boolean>, key: string): boolean {
  const value = flags[key]
  if (value === true) {
    return true
  }

  if (typeof value === 'string') {
    const normalized = value.toLowerCase()
    return normalized === '1' || normalized === 'true' || normalized === 'yes'
  }

  return false
}
