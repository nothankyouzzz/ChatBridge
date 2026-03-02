/**
 * Platform Passthrough and Extension Management
 *
 * Provides utilities for preserving platform-specific data across conversions.
 * Uses a special extension field to carry native formats through the Core schema.
 */

import type { SourcePlatform } from '../schema/core.types.ts'
import deepmerge from 'deepmerge'
import rfdc from 'rfdc'

/**
 * One lineage hop record for observability/debug.
 * Tracks conversion history across different platforms.
 */
type ChatbridgeLineageItem = {
  from: SourcePlatform
  to?: SourcePlatform
  at: string
}

/**
 * Internal ChatBridge metadata structure.
 * Stored in extensions.__chatbridge field.
 */
type ChatbridgeMeta = {
  /** Platform-specific raw data preserved for roundtrip compatibility */
  passthrough?: Partial<Record<SourcePlatform, unknown>>
  /** Conversion history for debugging and provenance tracking */
  lineage?: ChatbridgeLineageItem[]
  /** Checksums for data integrity verification (reserved) */
  checksums?: Partial<Record<SourcePlatform, string>>
}

/**
 * Transport field injected into generated artifacts.
 *
 * Why this exists:
 * - Some targets cannot preserve all foreign/private fields natively.
 * - This side channel lets ChatBridge carry those fields across hops and
 *   restore them when converting back to the original platform.
 */
export const CHATBRIDGE_EXTENSION_FIELD = '__chatbridge_extensions'

/**
 * Internal type guard for checking if value is a plain object.
 *
 * @param value - Value to check
 * @returns True if value is a plain object (not null, not array)
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Fast recursive deep clone instance (rfdc).
 * Used instead of JSON parse/stringify to avoid losing non-JSON-safe values (e.g. Infinity, undefined).
 */
const cloneValue = rfdc()

/**
 * Array merge strategy for deepmerge: source array always wins, target is discarded.
 * Prevents unexpected array concatenation when merging passthrough into a base object.
 */
const overwriteMerge = (_target: unknown[], source: unknown[]): unknown[] => source

function deepClone<T>(value: T): T {
  if (value === undefined || value === null) {
    return value
  }

  try {
    return cloneValue(value) as T
  } catch {
    return value
  }
}

/**
 * Deep merge two objects with patch taking precedence.
 *
 * @param base - Base object
 * @param patch - Patch object to merge in
 * @returns Merged object
 */
function deepMergeRecord(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  return deepmerge(base, patch, {
    arrayMerge: overwriteMerge,
    isMergeableObject: (value: unknown): boolean => isRecord(value),
  }) as Record<string, unknown>
}

/**
 * Patterns for identifying secret keys.
 * Used to redact sensitive data when includeSecrets is false.
 */
const SECRET_KEY_PATTERNS: RegExp[] = [
  /api[-_]?key/i,
  /access[-_]?token/i,
  /refresh[-_]?token/i,
  /secret/i,
  /password/i,
  /private[-_]?key/i,
  /authorization/i,
  /bearer/i,
]

/**
 * Check if a key name suggests it contains secret data.
 *
 * @param key - Object key to check
 * @returns True if key matches secret patterns
 */
function isSecretKey(key: string): boolean {
  return SECRET_KEY_PATTERNS.some((pattern) => pattern.test(key))
}

/**
 * Recursively redact secret values from an object.
 * Replaces secret values with empty strings.
 *
 * @param value - Value to redact
 * @returns Redacted copy of value
 */
function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item))
  }

  if (!isRecord(value)) {
    return value
  }

  const output: Record<string, unknown> = {}
  for (const [key, current] of Object.entries(value)) {
    if (isSecretKey(key)) {
      output[key] = ''
      continue
    }

    output[key] = redactSecrets(current)
  }

  return output
}

/**
 * Read ChatBridge internal metadata from extensions object.
 *
 * @param extensions - Extensions object to read from
 * @returns ChatBridge metadata or empty object
 */
function readChatbridgeMeta(extensions: Record<string, unknown> | undefined): ChatbridgeMeta {
  if (!isRecord(extensions)) {
    return {}
  }

  const raw = extensions.__chatbridge
  if (!isRecord(raw)) {
    return {}
  }

  return raw as ChatbridgeMeta
}

/**
 * Write ChatBridge metadata back to extensions object.
 *
 * @param extensions - Base extensions object
 * @param meta - ChatBridge metadata to write
 * @returns Updated extensions object
 */
function writeChatbridgeMeta(
  extensions: Record<string, unknown> | undefined,
  meta: ChatbridgeMeta,
): Record<string, unknown> {
  const next = isRecord(extensions) ? { ...extensions } : {}
  next.__chatbridge = meta
  return next
}

/**
 * Read passthrough payload for a target/source platform.
 */
export function readPlatformPassthrough(
  extensions: Record<string, unknown> | undefined,
  platform: SourcePlatform,
): unknown {
  const meta = readChatbridgeMeta(extensions)
  return meta.passthrough?.[platform]
}

/**
 * Capture raw platform-specific payload into extensions.
 *
 * KISS principle:
 * - Keep platform payload opaque.
 * - Do not reinterpret or remodel private data unless required.
 */
export function capturePlatformPassthrough(
  extensions: Record<string, unknown> | undefined,
  platform: SourcePlatform,
  value: unknown,
  includeSecrets: boolean,
): Record<string, unknown> {
  const meta = readChatbridgeMeta(extensions)
  const passthrough = isRecord(meta.passthrough) ? { ...meta.passthrough } : {}
  passthrough[platform] = deepClone(includeSecrets ? value : redactSecrets(value))

  return writeChatbridgeMeta(extensions, {
    ...meta,
    passthrough,
  })
}

/**
 * Append one lineage hop to extension metadata.
 */
export function appendLineage(
  extensions: Record<string, unknown> | undefined,
  item: ChatbridgeLineageItem,
): Record<string, unknown> {
  const meta = readChatbridgeMeta(extensions)
  const lineage = Array.isArray(meta.lineage) ? [...meta.lineage] : []
  lineage.push(item)

  return writeChatbridgeMeta(extensions, {
    ...meta,
    lineage,
  })
}

/**
 * Merge generated base object with platform passthrough payload.
 *
 * Merge precedence:
 * - Core-generated fields override passthrough duplicates.
 * - Unmapped passthrough fields are retained.
 */
export function mergeWithPlatformPassthrough(
  baseValue: Record<string, unknown>,
  extensions: Record<string, unknown> | undefined,
  platform: SourcePlatform,
  enabled: boolean,
): Record<string, unknown> {
  if (!enabled) {
    return baseValue
  }

  const passthrough = readPlatformPassthrough(extensions, platform)
  if (!isRecord(passthrough)) {
    return baseValue
  }

  return deepMergeRecord(deepClone(passthrough), baseValue)
}

/**
 * Remove internal ChatBridge metadata while keeping non-ChatBridge extensions.
 */
export function stripChatbridgeMeta(
  extensions: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!isRecord(extensions)) {
    return undefined
  }

  const output = { ...extensions }
  delete output.__chatbridge
  return Object.keys(output).length > 0 ? output : undefined
}

/**
 * Attach full extension object into transport field for cross-hop persistence.
 */
export function attachTransportExtensions(
  baseValue: Record<string, unknown>,
  extensions: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!isRecord(extensions)) {
    return baseValue
  }

  return {
    ...baseValue,
    [CHATBRIDGE_EXTENSION_FIELD]: deepClone(extensions),
  }
}

/**
 * Read transport-level extension payload from a parsed record.
 */
export function readTransportExtensions(record: Record<string, unknown>): Record<string, unknown> | undefined {
  const value = record[CHATBRIDGE_EXTENSION_FIELD]
  if (!isRecord(value)) {
    return undefined
  }
  return deepClone(value)
}

/**
 * Coerce to non-negative integer.
 */
export function toNonNegativeInt(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined
  }

  return Math.max(0, Math.round(value))
}
