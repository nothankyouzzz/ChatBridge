/**
 * Supported upstream/downstream client identifiers.
 */
export type SourcePlatform = 'chatbox' | 'cherry' | 'rikkahub'

/**
 * ChatBridge's universal transport container.
 *
 * Design intent:
 * - A conversation is not just text; it is a vessel of thought and context.
 * - This bundle is the shipping container that lets that vessel move safely
 *   across different client storage formats.
 * - Keep the common core minimal (KISS), keep platform specifics in `extensions`.
 */
export interface CoreBundle {
  /** Core schema version (kept stable in Phase 3 for compatibility). */
  specVersion: '1.0'
  /** Export timestamp in ISO-8601 UTC. */
  exportedAt: string
  /** Normalized conversations in universal format. */
  conversations: CoreConversation[]
  /** Normalized provider/model definitions. */
  providers: CoreProvider[]
  /** Optional detached asset index (reserved for large payload strategy). */
  assets?: CoreAssetRef[]
  /** Optional source metadata of the parsed artifact. */
  source?: {
    platform: SourcePlatform
    version?: string
  }
  /** Global extension bucket for platform passthrough and lineage metadata. */
  extensions?: Record<string, unknown>
}

/**
 * Reference to a binary or external artifact.
 */
export interface CoreAssetRef {
  id: string
  uri: string
  name?: string
  mime?: string
  sizeBytes?: number
  extensions?: Record<string, unknown>
}

/**
 * Universal conversation model.
 *
 * `messages` is the active linear path for broad compatibility.
 * Branch information is stored in `branchPoints` to preserve advanced behavior.
 */
export interface CoreConversation {
  id: string
  title: string
  assistantId?: string
  pinned?: boolean
  createdAt?: string
  updatedAt?: string
  /** Active path (always available and easy for simple targets). */
  messages: CoreMessage[]
  /** Phase 3 branch model (preferred). */
  branchPoints?: CoreBranchPoint[]
  /** Legacy branch model kept for backwards compatibility. */
  branches?: CoreBranch[]
  /** Non-universal state (UI flags, local metadata, etc). */
  extensions?: Record<string, unknown>
}

/**
 * A variant under one branch point.
 *
 * - `tail` mode: `messages` is a full tail sequence after anchor.
 * - `slot` mode: `messages` usually contains one candidate message.
 */
export interface CoreBranchVariant {
  id: string
  messages: CoreMessage[]
  extensions?: Record<string, unknown>
}

/**
 * Unified branch node descriptor.
 *
 * We intentionally preserve two native semantics instead of forcing a fake
 * "one-size-fits-all" tree abstraction:
 * - `tail`: Chatbox-style fork at an anchor message.
 * - `slot`: Rikkahub-style per-node candidate selection.
 */
export interface CoreBranchPoint {
  id: string
  /** Optional anchor message id (required by some formats like Chatbox). */
  anchorMessageId?: string
  mode: 'tail' | 'slot'
  selectedVariantIndex: number
  variants: CoreBranchVariant[]
  extensions?: Record<string, unknown>
}

/**
 * Deprecated branch compatibility shape.
 *
 * New code should prefer `branchPoints`.
 */
export interface CoreBranch {
  nodeId: string
  selectedIndex?: number
  variants: CoreMessage[]
  extensions?: Record<string, unknown>
}

/** Supported universal role values. */
export type CoreRole = 'system' | 'user' | 'assistant' | 'tool' | 'unknown'

/**
 * Universal message record.
 */
export interface CoreMessage {
  id: string
  role: CoreRole
  /** Multi-part payload to support text, tool use, media, and unknown blocks. */
  parts: CorePart[]
  createdAt?: string
  finishedAt?: string
  model?: {
    providerId?: string
    modelId?: string
    displayName?: string
  }
  usage?: {
    promptTokens?: number
    completionTokens?: number
    cachedTokens?: number
    totalTokens?: number
  }
  annotations?: unknown[]
  status?: string
  extensions?: Record<string, unknown>
}

/**
 * Universal message part union.
 */
export type CorePart =
  | {
      type: 'text'
      text: string
    }
  | {
      type: 'reasoning'
      text: string
    }
  | {
      type: 'image'
      uri: string
      mime?: string
    }
  | {
      type: 'file'
      uri: string
      name?: string
      mime?: string
    }
  | {
      type: 'tool_call'
      toolName: string
      args?: unknown
      callId?: string
    }
  | {
      type: 'tool_result'
      toolName: string
      result?: unknown
      callId?: string
    }
  | {
      type: 'citation'
      data: unknown
    }
  | {
      type: 'audio'
      uri: string
      mime?: string
    }
  | {
      type: 'video'
      uri: string
      mime?: string
    }
  | {
      type: 'unknown'
      raw: unknown
    }

/** Normalized provider type set. */
export type CoreProviderType = 'openai' | 'anthropic' | 'gemini' | 'azure-openai' | 'compatible' | 'unknown'

/**
 * Universal provider definition.
 */
export interface CoreProvider {
  id: string
  type: CoreProviderType
  name?: string
  enabled?: boolean
  endpoint?: string
  /** Secret fields are opt-in during parse/generate. */
  apiKey?: string
  models?: CoreModel[]
  extensions?: Record<string, unknown>
}

/**
 * Universal model definition.
 */
export interface CoreModel {
  id: string
  name?: string
  type?: string
  contextWindow?: number
  maxOutput?: number
  extensions?: Record<string, unknown>
}

/**
 * Options consumed by source parsers.
 */
export interface ParseOptions {
  includeSecrets?: boolean
  preservePrivateState?: boolean
  streamThresholdMb?: number
  assetMode?: 'inline' | 'external'
}

/**
 * Options consumed by target generators.
 */
export interface GenerateOptions {
  includeSecrets?: boolean
  now?: Date
  preservePrivateState?: boolean
  streamThresholdMb?: number
  assetMode?: 'inline' | 'external'
}

/** Parser input descriptor. */
export interface InputArtifact {
  path: string
}

/** Generator output descriptor. */
export interface OutputTarget {
  path: string
}

/** Materialized generated artifact descriptor. */
export interface GeneratedArtifact {
  path: string
  description?: string
}
