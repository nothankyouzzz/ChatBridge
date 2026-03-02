import { z } from 'zod'
import type { CoreBundle } from './core.types.ts'

/**
 * Validation error surfaced when input cannot satisfy Core schema constraints.
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

const isoDateSchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: 'must be an ISO date string',
})

const extensionsSchema = z.record(z.string(), z.unknown())

const coreModelSchema = z.object({
  id: z.string().min(1, 'must be a non-empty string'),
  name: z.string().optional(),
  type: z.string().optional(),
  contextWindow: z.number().finite().optional(),
  maxOutput: z.number().finite().optional(),
  extensions: extensionsSchema.optional(),
})

const coreProviderTypeSchema = z.enum(['openai', 'anthropic', 'gemini', 'azure-openai', 'compatible', 'unknown'])

const coreProviderSchema = z.object({
  id: z.string().min(1, 'must be a non-empty string'),
  type: coreProviderTypeSchema,
  name: z.string().optional(),
  enabled: z.boolean().optional(),
  endpoint: z.string().optional(),
  apiKey: z.string().optional(),
  models: z.array(coreModelSchema).optional(),
  extensions: extensionsSchema.optional(),
})

const corePartSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    text: z.string(),
  }),
  z.object({
    type: z.literal('reasoning'),
    text: z.string(),
  }),
  z.object({
    type: z.literal('image'),
    uri: z.string(),
    mime: z.string().optional(),
  }),
  z.object({
    type: z.literal('file'),
    uri: z.string(),
    name: z.string().optional(),
    mime: z.string().optional(),
  }),
  z.object({
    type: z.literal('tool_call'),
    toolName: z.string().min(1, 'must be a non-empty string'),
    args: z.unknown().optional(),
    callId: z.string().optional(),
  }),
  z.object({
    type: z.literal('tool_result'),
    toolName: z.string().min(1, 'must be a non-empty string'),
    result: z.unknown().optional(),
    callId: z.string().optional(),
  }),
  z.object({
    type: z.literal('citation'),
    data: z.unknown(),
  }),
  z.object({
    type: z.literal('audio'),
    uri: z.string(),
    mime: z.string().optional(),
  }),
  z.object({
    type: z.literal('video'),
    uri: z.string(),
    mime: z.string().optional(),
  }),
  z.object({
    type: z.literal('unknown'),
    raw: z.unknown(),
  }),
])

const coreRoleSchema = z.enum(['system', 'user', 'assistant', 'tool', 'unknown'])

const coreMessageSchema = z.object({
  id: z.string().min(1, 'must be a non-empty string'),
  role: coreRoleSchema,
  parts: z.array(corePartSchema),
  createdAt: isoDateSchema.optional(),
  finishedAt: isoDateSchema.optional(),
  model: z
    .object({
      providerId: z.string().optional(),
      modelId: z.string().optional(),
      displayName: z.string().optional(),
    })
    .optional(),
  usage: z
    .object({
      promptTokens: z.number().finite().optional(),
      completionTokens: z.number().finite().optional(),
      cachedTokens: z.number().finite().optional(),
      totalTokens: z.number().finite().optional(),
    })
    .optional(),
  annotations: z.array(z.unknown()).optional(),
  status: z.string().optional(),
  extensions: extensionsSchema.optional(),
})

const coreBranchSchema = z.object({
  nodeId: z.string().min(1, 'must be a non-empty string'),
  selectedIndex: z.number().finite().optional(),
  variants: z.array(coreMessageSchema),
  extensions: extensionsSchema.optional(),
})

const coreBranchVariantSchema = z.object({
  id: z.string().min(1, 'must be a non-empty string'),
  messages: z.array(coreMessageSchema),
  extensions: extensionsSchema.optional(),
})

const coreBranchPointSchema = z.object({
  id: z.string().min(1, 'must be a non-empty string'),
  anchorMessageId: z.string().optional(),
  mode: z.enum(['tail', 'slot']),
  selectedVariantIndex: z.number().finite(),
  variants: z.array(coreBranchVariantSchema),
  extensions: extensionsSchema.optional(),
})

const coreConversationSchema = z.object({
  id: z.string().min(1, 'must be a non-empty string'),
  title: z.string(),
  assistantId: z.string().optional(),
  pinned: z.boolean().optional(),
  createdAt: isoDateSchema.optional(),
  updatedAt: isoDateSchema.optional(),
  messages: z.array(coreMessageSchema),
  branchPoints: z.array(coreBranchPointSchema).optional(),
  branches: z.array(coreBranchSchema).optional(),
  extensions: extensionsSchema.optional(),
})

const coreAssetSchema = z.object({
  id: z.string().min(1, 'must be a non-empty string'),
  uri: z.string().min(1, 'must be a non-empty string'),
  name: z.string().optional(),
  mime: z.string().optional(),
  sizeBytes: z.number().finite().optional(),
  extensions: extensionsSchema.optional(),
})

const sourcePlatformSchema = z.enum(['chatbox', 'cherry', 'rikkahub'])

const coreBundleZodSchema = z.object({
  specVersion: z.literal('1.0'),
  exportedAt: isoDateSchema,
  conversations: z.array(coreConversationSchema),
  providers: z.array(coreProviderSchema),
  assets: z.array(coreAssetSchema).optional(),
  extensions: extensionsSchema.optional(),
  source: z
    .object({
      platform: sourcePlatformSchema,
      version: z.string().optional(),
    })
    .optional(),
})

function formatPath(path: (string | number)[]): string {
  if (path.length === 0) {
    return 'root'
  }

  let output = 'root'
  for (const key of path) {
    if (typeof key === 'number') {
      output += `[${key}]`
      continue
    }

    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)) {
      output += `.${key}`
      continue
    }

    output += `["${key}"]`
  }

  return output
}

/**
 * Runtime validator facade for CoreBundle.
 */
export const CoreBundleSchema = {
  parse(input: unknown): CoreBundle {
    const result = this.safeParse(input)
    if (!result.success) {
      throw result.error
    }

    return result.data
  },

  safeParse(input: unknown): SafeParseResult<CoreBundle> {
    const result = coreBundleZodSchema.safeParse(input)
    if (result.success) {
      return {
        success: true,
        data: result.data as CoreBundle,
      }
    }

    const issues = result.error.issues.map((issue) => {
      const location = formatPath(issue.path)
      return `${location} ${issue.message}`.trim()
    })

    return {
      success: false,
      error: new CoreValidationError(issues),
    }
  },
}

export { CoreValidationError }
