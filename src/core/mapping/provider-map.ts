/**
 * Provider Type Mapping Utilities
 *
 * Normalizes various provider type representations from different platforms
 * into the universal CoreProviderType set.
 */

import type { CoreProviderType } from '../schema/core.types.ts'

/**
 * Mapping table for known provider type aliases.
 * Keys are lowercase normalized strings, values are canonical CoreProviderType.
 */
const PROVIDER_TYPE_MAP: Record<string, CoreProviderType> = {
  openai: 'openai',
  'openai-response': 'openai',
  anthropic: 'anthropic',
  claude: 'anthropic',
  gemini: 'gemini',
  google: 'gemini',
  'azure-openai': 'azure-openai',
  azure: 'azure-openai',
}

/**
 * Normalize provider type string to CoreProviderType.
 *
 * Uses multiple strategies:
 * 1. Direct lookup in mapping table
 * 2. Substring matching for composite names (e.g., "azure-openai")
 * 3. Keyword detection (e.g., "claude" -> "anthropic")
 * 4. Fallback to "compatible" for gateway-like providers
 * 5. Default to "unknown" if no match
 *
 * @param value - Raw provider type value (typically string from platform data)
 * @returns Normalized CoreProviderType
 *
 * @example
 * normalizeProviderType('OpenAI') // 'openai'
 * normalizeProviderType('claude-3') // 'anthropic'
 * normalizeProviderType('new-api-gateway') // 'compatible'
 */
export function normalizeProviderType(value: unknown): CoreProviderType {
  if (typeof value !== 'string') {
    return 'unknown'
  }

  const lowered = value.toLowerCase()

  // Try direct lookup first
  if (PROVIDER_TYPE_MAP[lowered]) {
    return PROVIDER_TYPE_MAP[lowered]
  }

  // Handle Azure OpenAI variants
  if (lowered.includes('openai') && lowered.includes('azure')) {
    return 'azure-openai'
  }

  // Handle generic OpenAI-like providers
  if (lowered.includes('openai')) {
    return 'openai'
  }

  // Handle Anthropic/Claude variants
  if (lowered.includes('anthropic') || lowered.includes('claude')) {
    return 'anthropic'
  }

  // Handle Google/Gemini variants
  if (lowered.includes('google') || lowered.includes('gemini')) {
    return 'gemini'
  }

  // Handle gateway/compatible API providers
  if (lowered.includes('compatible') || lowered.includes('gateway') || lowered.includes('new-api')) {
    return 'compatible'
  }

  // Default to unknown for unrecognized types
  return 'unknown'
}
