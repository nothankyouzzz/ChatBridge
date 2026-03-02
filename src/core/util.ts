/**
 * Shared utility functions used across all adapters.
 *
 * These primitives are intentionally free of any adapter-specific logic so
 * they can be imported by both parse and generate directions.
 */

/**
 * Return `true` when `value` is a plain (non-null, non-array) object.
 *
 * Useful as a TypeScript type-guard when a JSON field might be an object,
 * array, primitive, or null.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Return `value` cast to `Record<string, unknown>` when it is a plain object,
 * or `undefined` for every other case (null, array, primitive).
 */
export function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (isRecord(value)) {
    return value as Record<string, unknown>
  }
  return undefined
}

/**
 * Return a shallow copy of `value` with all `undefined` entries removed.
 *
 * Does **not** strip `null` — only explicitly undefined properties.
 */
export function compactObject<T extends Record<string, unknown>>(value: T): T {
  const output: Record<string, unknown> = {}
  for (const [key, current] of Object.entries(value)) {
    if (current !== undefined) {
      output[key] = current
    }
  }
  return output as T
}

/**
 * Attempt to JSON-parse a string value.
 *
 * Returns the parsed value on success, or the **original input** unchanged
 * when parsing fails or when `value` is not a string.
 */
export function safeParseJson(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value
  }

  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}
