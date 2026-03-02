/**
 * Message Role Normalization
 *
 * Converts platform-specific role names to the universal CoreRole type.
 */

import type { CoreRole } from '../schema/core.types.ts'

/**
 * Normalize message role to CoreRole.
 *
 * Handles common role variations:
 * - Direct matches: system, user, assistant, tool
 * - Aliases: "model" -> "assistant"
 * - Unknown/invalid values -> "unknown"
 *
 * @param value - Raw role value from platform data
 * @returns Normalized CoreRole
 *
 * @example
 * normalizeRole('USER') // 'user'
 * normalizeRole('model') // 'assistant'
 * normalizeRole('invalid') // 'unknown'
 */
export function normalizeRole(value: unknown): CoreRole {
  if (typeof value !== 'string') {
    return 'unknown'
  }

  const lowered = value.toLowerCase()

  // Direct matches for standard roles
  if (lowered === 'system' || lowered === 'user' || lowered === 'assistant' || lowered === 'tool') {
    return lowered
  }

  // Handle "model" alias (common in some APIs)
  if (lowered === 'model') {
    return 'assistant'
  }

  return 'unknown'
}
