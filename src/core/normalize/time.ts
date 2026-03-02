/**
 * Timestamp Normalization Utilities
 *
 * Converts various timestamp formats to ISO 8601 UTC strings
 * or epoch milliseconds for cross-platform compatibility.
 */

/**
 * Convert timestamp value to ISO 8601 UTC string.
 *
 * Handles multiple input formats:
 * - ISO strings (e.g., "2026-03-02T10:30:00Z")
 * - Numeric strings (parsed as epoch seconds/milliseconds)
 * - Numbers (epoch seconds or milliseconds)
 *
 * Uses heuristic: values < 1 trillion are treated as seconds,
 * larger values as milliseconds.
 *
 * @param value - Timestamp in various formats
 * @returns ISO 8601 UTC string or undefined if invalid
 *
 * @example
 * toIsoUtc(1709376000) // '2024-03-02T10:00:00.000Z'
 * toIsoUtc('2024-03-02T10:00:00Z') // '2024-03-02T10:00:00.000Z'
 * toIsoUtc('invalid') // undefined
 */
export function toIsoUtc(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined
  }

  // Handle ISO string or numeric string
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString()
    }

    // Try as numeric string (epoch)
    if (/^\d+$/.test(value.trim())) {
      return toIsoUtc(Number(value.trim()))
    }

    return undefined
  }

  // Handle numeric timestamp
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Heuristic: seconds are usually 10 digits; milliseconds are 13 digits.
    const millis = value < 1_000_000_000_000 ? value * 1000 : value
    return new Date(millis).toISOString()
  }

  return undefined
}

/**
 * Convert timestamp value to epoch milliseconds.
 *
 * Handles multiple input formats:
 * - Numbers (seconds or milliseconds)
 * - Numeric strings
 * - ISO strings
 *
 * Uses heuristic: values < 1 trillion are treated as seconds,
 * larger values as milliseconds.
 *
 * @param value - Timestamp in various formats
 * @returns Epoch milliseconds or undefined if invalid
 *
 * @example
 * toEpochMillis(1709376000) // 1709376000000
 * toEpochMillis('2024-03-02T10:00:00Z') // 1709376000000
 */
export function toEpochMillis(value: unknown): number | undefined {
  if (value === null || value === undefined) {
    return undefined
  }

  // Handle numeric value
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1_000_000_000_000 ? Math.floor(value * 1000) : Math.floor(value)
  }

  // Handle string value
  if (typeof value === 'string') {
    // Try as numeric string first
    const parsedNumber = Number(value)
    if (Number.isFinite(parsedNumber)) {
      return toEpochMillis(parsedNumber)
    }

    // Try as ISO string
    const parsedDate = Date.parse(value)
    if (!Number.isNaN(parsedDate)) {
      return parsedDate
    }
  }

  return undefined
}
