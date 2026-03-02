import type {
  CoreAssetRef,
  CoreBranch,
  CoreBranchPoint,
  CoreBranchVariant,
  CoreBundle,
  CoreConversation,
  CoreMessage,
  CoreModel,
  CorePart,
  CoreProvider,
} from './core.types.ts'

/**
 * Runtime validation for Universal Core Schema.
 *
 * The Core schema is the container that transports conversation intelligence
 * across different app-specific storage formats. Validation stays strict on
 * the shared contract and permissive on platform-private extensions.
 */

/**
 * Validation error surfaced when input cannot satisfy Core schema constraints.
 *
 * We keep a flat list of issues with full paths so parser/generator failures are
 * actionable during cross-client conversion debugging.
 */
class CoreValidationError extends Error {
  readonly issues: string[]

  constructor(issues: string[]) {
    super(`Core schema validation failed:\n${issues.join('\n')}`)
    this.name = 'CoreValidationError'
    this.issues = issues
  }
}

type SafeParseResult<T> =
  | {
      success: true
      data: T
    }
  | {
      success: false
      error: CoreValidationError
    }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isIsoDate(value: unknown): value is string {
  return isString(value) && !Number.isNaN(Date.parse(value))
}

/**
 * Validate asset references.
 */
function validateAsset(value: unknown, path: string, issues: string[]): value is CoreAssetRef {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object`)
    return false
  }

  if (!isString(value.id) || value.id.length === 0) {
    issues.push(`${path}.id must be a non-empty string`)
  }

  if (!isString(value.uri) || value.uri.length === 0) {
    issues.push(`${path}.uri must be a non-empty string`)
  }

  if (value.name !== undefined && !isString(value.name)) {
    issues.push(`${path}.name must be a string`)
  }

  if (value.mime !== undefined && !isString(value.mime)) {
    issues.push(`${path}.mime must be a string`)
  }

  if (value.sizeBytes !== undefined && !isNumber(value.sizeBytes)) {
    issues.push(`${path}.sizeBytes must be a number`)
  }

  if (value.extensions !== undefined && !isRecord(value.extensions)) {
    issues.push(`${path}.extensions must be an object`)
  }

  return true
}

/**
 * Validate one message part.
 *
 * KISS rule:
 * - Validate only the universal contract we actually rely on.
 * - Leave platform-unique fields in `unknown/raw` and `extensions`.
 */
function validatePart(value: unknown, path: string, issues: string[]): value is CorePart {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object`)
    return false
  }

  if (!isString(value.type)) {
    issues.push(`${path}.type must be a string`)
    return false
  }

  switch (value.type) {
    case 'text':
    case 'reasoning':
      if (!isString(value.text)) {
        issues.push(`${path}.text must be a string`)
      }
      break
    case 'image':
    case 'audio':
    case 'video':
      if (!isString(value.uri)) {
        issues.push(`${path}.uri must be a string`)
      }
      if (value.mime !== undefined && !isString(value.mime)) {
        issues.push(`${path}.mime must be a string`)
      }
      break
    case 'file':
      if (!isString(value.uri)) {
        issues.push(`${path}.uri must be a string`)
      }
      if (value.name !== undefined && !isString(value.name)) {
        issues.push(`${path}.name must be a string`)
      }
      if (value.mime !== undefined && !isString(value.mime)) {
        issues.push(`${path}.mime must be a string`)
      }
      break
    case 'tool_call':
      if (!isString(value.toolName) || value.toolName.length === 0) {
        issues.push(`${path}.toolName must be a non-empty string`)
      }
      if (value.callId !== undefined && !isString(value.callId)) {
        issues.push(`${path}.callId must be a string`)
      }
      break
    case 'tool_result':
      if (!isString(value.toolName) || value.toolName.length === 0) {
        issues.push(`${path}.toolName must be a non-empty string`)
      }
      if (value.callId !== undefined && !isString(value.callId)) {
        issues.push(`${path}.callId must be a string`)
      }
      break
    case 'citation':
      break
    case 'unknown':
      if (!Object.prototype.hasOwnProperty.call(value, 'raw')) {
        issues.push(`${path}.raw is required`)
      }
      break
    default:
      issues.push(`${path}.type has unsupported value ${(value as Record<string, unknown>).type as string}`)
  }

  return true
}

function validateModel(value: unknown, path: string, issues: string[]): value is CoreModel {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object`)
    return false
  }

  if (!isString(value.id) || value.id.length === 0) {
    issues.push(`${path}.id must be a non-empty string`)
  }

  if (value.name !== undefined && !isString(value.name)) {
    issues.push(`${path}.name must be a string`)
  }

  if (value.type !== undefined && !isString(value.type)) {
    issues.push(`${path}.type must be a string`)
  }

  if (value.contextWindow !== undefined && !isNumber(value.contextWindow)) {
    issues.push(`${path}.contextWindow must be a number`)
  }

  if (value.maxOutput !== undefined && !isNumber(value.maxOutput)) {
    issues.push(`${path}.maxOutput must be a number`)
  }

  if (value.extensions !== undefined && !isRecord(value.extensions)) {
    issues.push(`${path}.extensions must be an object`)
  }

  return true
}

function validateProvider(value: unknown, path: string, issues: string[]): value is CoreProvider {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object`)
    return false
  }

  if (!isString(value.id) || value.id.length === 0) {
    issues.push(`${path}.id must be a non-empty string`)
  }

  const typeAllow = new Set(['openai', 'anthropic', 'gemini', 'azure-openai', 'compatible', 'unknown'])
  if (!isString(value.type) || !typeAllow.has(value.type)) {
    issues.push(`${path}.type must be one of ${Array.from(typeAllow).join(', ')}`)
  }

  if (value.name !== undefined && !isString(value.name)) {
    issues.push(`${path}.name must be a string`)
  }

  if (value.enabled !== undefined && !isBoolean(value.enabled)) {
    issues.push(`${path}.enabled must be a boolean`)
  }

  if (value.endpoint !== undefined && !isString(value.endpoint)) {
    issues.push(`${path}.endpoint must be a string`)
  }

  if (value.apiKey !== undefined && !isString(value.apiKey)) {
    issues.push(`${path}.apiKey must be a string`)
  }

  if (value.models !== undefined) {
    if (!Array.isArray(value.models)) {
      issues.push(`${path}.models must be an array`)
    } else {
      value.models.forEach((item, index) => {
        validateModel(item, `${path}.models[${index}]`, issues)
      })
    }
  }

  if (value.extensions !== undefined && !isRecord(value.extensions)) {
    issues.push(`${path}.extensions must be an object`)
  }

  return true
}

/**
 * Validate message-level fields.
 */
function validateMessage(value: unknown, path: string, issues: string[]): value is CoreMessage {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object`)
    return false
  }

  if (!isString(value.id) || value.id.length === 0) {
    issues.push(`${path}.id must be a non-empty string`)
  }

  const roleAllow = new Set(['system', 'user', 'assistant', 'tool', 'unknown'])
  if (!isString(value.role) || !roleAllow.has(value.role)) {
    issues.push(`${path}.role must be one of ${Array.from(roleAllow).join(', ')}`)
  }

  if (!Array.isArray(value.parts)) {
    issues.push(`${path}.parts must be an array`)
  } else {
    value.parts.forEach((part, index) => {
      validatePart(part, `${path}.parts[${index}]`, issues)
    })
  }

  if (value.createdAt !== undefined && !isIsoDate(value.createdAt)) {
    issues.push(`${path}.createdAt must be an ISO date string`)
  }

  if (value.finishedAt !== undefined && !isIsoDate(value.finishedAt)) {
    issues.push(`${path}.finishedAt must be an ISO date string`)
  }

  if (value.model !== undefined) {
    if (!isRecord(value.model)) {
      issues.push(`${path}.model must be an object`)
    } else {
      if (value.model.providerId !== undefined && !isString(value.model.providerId)) {
        issues.push(`${path}.model.providerId must be a string`)
      }
      if (value.model.modelId !== undefined && !isString(value.model.modelId)) {
        issues.push(`${path}.model.modelId must be a string`)
      }
      if (value.model.displayName !== undefined && !isString(value.model.displayName)) {
        issues.push(`${path}.model.displayName must be a string`)
      }
    }
  }

  if (value.usage !== undefined) {
    if (!isRecord(value.usage)) {
      issues.push(`${path}.usage must be an object`)
    } else {
      if (value.usage.promptTokens !== undefined && !isNumber(value.usage.promptTokens)) {
        issues.push(`${path}.usage.promptTokens must be a number`)
      }
      if (value.usage.completionTokens !== undefined && !isNumber(value.usage.completionTokens)) {
        issues.push(`${path}.usage.completionTokens must be a number`)
      }
      if (value.usage.cachedTokens !== undefined && !isNumber(value.usage.cachedTokens)) {
        issues.push(`${path}.usage.cachedTokens must be a number`)
      }
      if (value.usage.totalTokens !== undefined && !isNumber(value.usage.totalTokens)) {
        issues.push(`${path}.usage.totalTokens must be a number`)
      }
    }
  }

  if (value.annotations !== undefined && !Array.isArray(value.annotations)) {
    issues.push(`${path}.annotations must be an array`)
  }

  if (value.status !== undefined && !isString(value.status)) {
    issues.push(`${path}.status must be a string`)
  }

  if (value.extensions !== undefined && !isRecord(value.extensions)) {
    issues.push(`${path}.extensions must be an object`)
  }

  return true
}

/**
 * Legacy branch compatibility validator.
 */
function validateBranch(value: unknown, path: string, issues: string[]): value is CoreBranch {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object`)
    return false
  }

  if (!isString(value.nodeId) || value.nodeId.length === 0) {
    issues.push(`${path}.nodeId must be a non-empty string`)
  }

  if (value.selectedIndex !== undefined && !isNumber(value.selectedIndex)) {
    issues.push(`${path}.selectedIndex must be a number`)
  }

  if (!Array.isArray(value.variants)) {
    issues.push(`${path}.variants must be an array`)
  } else {
    value.variants.forEach((message, index) => {
      validateMessage(message, `${path}.variants[${index}]`, issues)
    })
  }

  if (value.extensions !== undefined && !isRecord(value.extensions)) {
    issues.push(`${path}.extensions must be an object`)
  }

  return true
}

/**
 * Validate one branch variant.
 */
function validateBranchVariant(value: unknown, path: string, issues: string[]): value is CoreBranchVariant {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object`)
    return false
  }

  if (!isString(value.id) || value.id.length === 0) {
    issues.push(`${path}.id must be a non-empty string`)
  }

  if (!Array.isArray(value.messages)) {
    issues.push(`${path}.messages must be an array`)
  } else {
    value.messages.forEach((message, index) => {
      validateMessage(message, `${path}.messages[${index}]`, issues)
    })
  }

  if (value.extensions !== undefined && !isRecord(value.extensions)) {
    issues.push(`${path}.extensions must be an object`)
  }

  return true
}

/**
 * Validate one branch point.
 *
 * We explicitly support both native semantics:
 * - `tail`: anchor + tail variants (Chatbox style)
 * - `slot`: per-node candidate variants (Rikkahub style)
 *
 * This is intentional. We do not force incompatible native models into a fake
 * single tree representation.
 */
function validateBranchPoint(value: unknown, path: string, issues: string[]): value is CoreBranchPoint {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object`)
    return false
  }

  if (!isString(value.id) || value.id.length === 0) {
    issues.push(`${path}.id must be a non-empty string`)
  }

  if (value.anchorMessageId !== undefined && !isString(value.anchorMessageId)) {
    issues.push(`${path}.anchorMessageId must be a string`)
  }

  if (value.mode !== 'tail' && value.mode !== 'slot') {
    issues.push(`${path}.mode must be either "tail" or "slot"`)
  }

  if (!isNumber(value.selectedVariantIndex)) {
    issues.push(`${path}.selectedVariantIndex must be a number`)
  }

  if (!Array.isArray(value.variants)) {
    issues.push(`${path}.variants must be an array`)
  } else {
    value.variants.forEach((variant, index) => {
      validateBranchVariant(variant, `${path}.variants[${index}]`, issues)
    })
  }

  if (value.extensions !== undefined && !isRecord(value.extensions)) {
    issues.push(`${path}.extensions must be an object`)
  }

  return true
}

/**
 * Validate conversation-level fields, including both modern (`branchPoints`)
 * and compatibility (`branches`) branch encodings.
 */
function validateConversation(value: unknown, path: string, issues: string[]): value is CoreConversation {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object`)
    return false
  }

  if (!isString(value.id) || value.id.length === 0) {
    issues.push(`${path}.id must be a non-empty string`)
  }

  if (!isString(value.title)) {
    issues.push(`${path}.title must be a string`)
  }

  if (value.assistantId !== undefined && !isString(value.assistantId)) {
    issues.push(`${path}.assistantId must be a string`)
  }

  if (value.pinned !== undefined && !isBoolean(value.pinned)) {
    issues.push(`${path}.pinned must be a boolean`)
  }

  if (value.createdAt !== undefined && !isIsoDate(value.createdAt)) {
    issues.push(`${path}.createdAt must be an ISO date string`)
  }

  if (value.updatedAt !== undefined && !isIsoDate(value.updatedAt)) {
    issues.push(`${path}.updatedAt must be an ISO date string`)
  }

  if (!Array.isArray(value.messages)) {
    issues.push(`${path}.messages must be an array`)
  } else {
    value.messages.forEach((message, index) => {
      validateMessage(message, `${path}.messages[${index}]`, issues)
    })
  }

  if (value.branches !== undefined) {
    if (!Array.isArray(value.branches)) {
      issues.push(`${path}.branches must be an array`)
    } else {
      value.branches.forEach((branch, index) => {
        validateBranch(branch, `${path}.branches[${index}]`, issues)
      })
    }
  }

  if (value.branchPoints !== undefined) {
    if (!Array.isArray(value.branchPoints)) {
      issues.push(`${path}.branchPoints must be an array`)
    } else {
      value.branchPoints.forEach((branchPoint, index) => {
        validateBranchPoint(branchPoint, `${path}.branchPoints[${index}]`, issues)
      })
    }
  }

  if (value.extensions !== undefined && !isRecord(value.extensions)) {
    issues.push(`${path}.extensions must be an object`)
  }

  return true
}

/**
 * Runtime validator facade for CoreBundle.
 */
export const CoreBundleSchema = {
  /**
   * Parse and throw on invalid input.
   */
  parse(input: unknown): CoreBundle {
    const result = this.safeParse(input)
    if (!result.success) {
      throw result.error
    }

    return result.data
  },

  /**
   * Parse without throwing.
   */
  safeParse(input: unknown): SafeParseResult<CoreBundle> {
    const issues: string[] = []

    if (!isRecord(input)) {
      return {
        success: false,
        error: new CoreValidationError(['root must be an object']),
      }
    }

    if (input.specVersion !== '1.0') {
      issues.push('specVersion must be exactly "1.0"')
    }

    if (!isIsoDate(input.exportedAt)) {
      issues.push('exportedAt must be an ISO date string')
    }

    if (!Array.isArray(input.conversations)) {
      issues.push('conversations must be an array')
    } else {
      input.conversations.forEach((conversation, index) => {
        validateConversation(conversation, `conversations[${index}]`, issues)
      })
    }

    if (!Array.isArray(input.providers)) {
      issues.push('providers must be an array')
    } else {
      input.providers.forEach((provider, index) => {
        validateProvider(provider, `providers[${index}]`, issues)
      })
    }

    if (input.assets !== undefined) {
      if (!Array.isArray(input.assets)) {
        issues.push('assets must be an array')
      } else {
        input.assets.forEach((asset, index) => {
          validateAsset(asset, `assets[${index}]`, issues)
        })
      }
    }

    if (input.extensions !== undefined && !isRecord(input.extensions)) {
      issues.push('extensions must be an object')
    }

    if (input.source !== undefined) {
      if (!isRecord(input.source)) {
        issues.push('source must be an object')
      } else {
        const platforms = new Set(['chatbox', 'cherry', 'rikkahub'])
        if (!isString(input.source.platform) || !platforms.has(input.source.platform)) {
          issues.push(`source.platform must be one of ${Array.from(platforms).join(', ')}`)
        }

        if (input.source.version !== undefined && !isString(input.source.version)) {
          issues.push('source.version must be a string')
        }
      }
    }

    if (issues.length > 0) {
      return {
        success: false,
        error: new CoreValidationError(issues),
      }
    }

    return {
      success: true,
      data: input as CoreBundle,
    }
  },
}

export { CoreValidationError }
