/**
 * Cherry Studio ↔ Core Mapper
 *
 * Converts between Cherry Studio's backup layout (localStorage Redux slices +
 * IndexedDB tables) and the universal Core schema. Both directions are handled
 * here to keep the data model co-located.
 */
import type {
  CoreConversation,
  CoreMessage,
  CorePart,
  CoreProvider,
} from '../../core/schema/core.types.ts'
import {
  attachTransportExtensions,
  capturePlatformPassthrough,
  mergeWithPlatformPassthrough,
  readTransportExtensions,
} from '../../core/extensions/passthrough.ts'
import { normalizeProviderType } from '../../core/mapping/provider-map.ts'
import { normalizeRole } from '../../core/normalize/role.ts'
import { toIsoUtc, toEpochMillis } from '../../core/normalize/time.ts'
import { asRecord, compactObject } from '../../core/util.ts'

/**
 * Try to JSON-parse a string slice.
 *
 * Cherry's `persist:cherry-studio` Redux payload stores each top-level slice
 * as a JSON-stringified string. This helper unwraps one such slice.
 * Non-string values are returned as-is (already an object or number, etc.).
 */
function parsePersistSlice(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value
  }

  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

/**
 * Parse `persist:cherry-studio` payload where each top-level slice is stringified JSON.
 */
export function parseCherryPersistRaw(rawPersist: unknown): Record<string, unknown> {
  if (typeof rawPersist !== 'string') {
    return {}
  }

  let parsedRoot: Record<string, unknown>
  try {
    parsedRoot = JSON.parse(rawPersist) as Record<string, unknown>
  } catch {
    return {}
  }

  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(parsedRoot)) {
    output[key] = parsePersistSlice(value)
  }

  return output
}

/**
 * Build a topic metadata lookup from assistants slice.
 *
 * Cherry keeps branch-like behavior as topic cloning, not in-topic trees.
 * We preserve that model and avoid forcing synthetic branch nodes.
 */
export function buildCherryTopicMetaMap(persistState: Record<string, unknown>): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>()
  const assistantsSlice = asRecord(persistState.assistants)
  const assistants = Array.isArray(assistantsSlice?.assistants) ? assistantsSlice.assistants : []

  for (const assistantRaw of assistants) {
    const assistant = asRecord(assistantRaw)
    if (!assistant) {
      continue
    }

    const assistantId = typeof assistant.id === 'string' ? assistant.id : undefined
    const topics = Array.isArray(assistant.topics) ? assistant.topics : []

    for (const topicRaw of topics) {
      const topic = asRecord(topicRaw)
      if (!topic) {
        continue
      }

      if (typeof topic.id !== 'string') {
        continue
      }

      map.set(topic.id, {
        assistantId,
        ...topic,
      })
    }
  }

  return map
}

/**
 * Map one Cherry message block into Core part list.
 */
export function mapCherryBlockToCoreParts(rawBlock: unknown): CorePart[] {
  const block = asRecord(rawBlock)
  if (!block) {
    return [{ type: 'unknown', raw: rawBlock }]
  }

  const type = typeof block.type === 'string' ? block.type : 'unknown'

  switch (type) {
    case 'main_text':
    case 'code':
    case 'translation':
    case 'compact':
      return [{ type: 'text', text: typeof block.content === 'string' ? block.content : '' }]
    case 'thinking':
      return [{ type: 'reasoning', text: typeof block.content === 'string' ? block.content : '' }]
    case 'image': {
      const file = asRecord(block.file)
      const uri =
        typeof block.url === 'string'
          ? block.url
          : typeof file?.path === 'string'
            ? file.path
            : typeof file?.id === 'string'
              ? `file:${file.id}`
              : ''

      return [{ type: 'image', uri }]
    }
    case 'video':
      return [{ type: 'video', uri: typeof block.url === 'string' ? block.url : '' }]
    case 'file': {
      const file = asRecord(block.file)
      return [
        {
          type: 'file',
          uri:
            typeof file?.path === 'string'
              ? file.path
              : typeof file?.id === 'string'
                ? `file:${file.id}`
                : '',
          name: typeof file?.name === 'string' ? file.name : undefined,
          mime: typeof file?.type === 'string' ? file.type : undefined,
        },
      ]
    }
    case 'tool': {
      const parts: CorePart[] = []

      if (typeof block.toolName === 'string') {
        parts.push({
          type: 'tool_call',
          toolName: block.toolName,
          callId: typeof block.toolId === 'string' ? block.toolId : undefined,
          args: block.arguments,
        })
      }

      if (block.content !== undefined || block.metadata !== undefined) {
        parts.push({
          type: 'tool_result',
          toolName: typeof block.toolName === 'string' ? block.toolName : 'unknown',
          callId: typeof block.toolId === 'string' ? block.toolId : undefined,
          result: block.content ?? block.metadata,
        })
      }

      return parts.length > 0 ? parts : [{ type: 'unknown', raw: rawBlock }]
    }
    case 'citation':
      return [
        {
          type: 'citation',
          data: {
            response: block.response,
            knowledge: block.knowledge,
            memories: block.memories,
          },
        },
      ]
    case 'error':
      return [{ type: 'unknown', raw: rawBlock }]
    default:
      return [{ type: 'unknown', raw: rawBlock }]
  }
}

/**
 * Map one Cherry message to Core message with passthrough capture.
 */
export function mapCherryMessageToCore(
  rawMessage: unknown,
  blockMap: Map<string, Record<string, unknown>>,
  includeSecrets: boolean = false
): CoreMessage {
  const message = asRecord(rawMessage)
  if (!message) {
    return {
      id: crypto.randomUUID(),
      role: 'unknown',
      parts: [{ type: 'unknown', raw: rawMessage }],
    }
  }

  const blockIds = Array.isArray(message.blocks)
    ? message.blocks.filter((value): value is string => typeof value === 'string')
    : []

  const parts: CorePart[] = []
  for (const blockId of blockIds) {
    const block = blockMap.get(blockId)
    parts.push(...mapCherryBlockToCoreParts(block ?? { type: 'unknown', raw: blockId }))
  }

  if (parts.length === 0) {
    parts.push({ type: 'unknown', raw: rawMessage })
  }

  const usageRecord = asRecord(message.usage)
  const usage = usageRecord
    ? compactObject({
        promptTokens:
          typeof usageRecord.prompt_tokens === 'number'
            ? usageRecord.prompt_tokens
            : typeof usageRecord.promptTokens === 'number'
              ? usageRecord.promptTokens
              : undefined,
        completionTokens:
          typeof usageRecord.completion_tokens === 'number'
            ? usageRecord.completion_tokens
            : typeof usageRecord.completionTokens === 'number'
              ? usageRecord.completionTokens
              : undefined,
        cachedTokens:
          typeof usageRecord.cached_tokens === 'number'
            ? usageRecord.cached_tokens
            : typeof usageRecord.cachedTokens === 'number'
              ? usageRecord.cachedTokens
              : undefined,
        totalTokens:
          typeof usageRecord.total_tokens === 'number'
            ? usageRecord.total_tokens
            : typeof usageRecord.totalTokens === 'number'
              ? usageRecord.totalTokens
              : undefined,
      })
    : undefined

  const modelRecord = asRecord(message.model)
  const transportExtensions = readTransportExtensions(message)

  const passthrough = compactObject({
    ...Object.fromEntries(Object.entries(message).filter(([key]) => ![
      'id',
      'role',
      'assistantId',
      'topicId',
      'createdAt',
      'updatedAt',
      'status',
      'modelId',
      'model',
      'usage',
      'blocks',
      'providerMetadata',
      'type',
      'useful',
      'askId',
      '__chatbridge_extensions',
    ].includes(key))),
    raw: {
      type: message.type,
      useful: message.useful,
      askId: message.askId,
    },
  })

  let extensions = compactObject({
    ...(transportExtensions ?? {}),
    topicId: typeof message.topicId === 'string' ? message.topicId : undefined,
    assistantId: typeof message.assistantId === 'string' ? message.assistantId : undefined,
    raw: {
      type: message.type,
      useful: message.useful,
      askId: message.askId,
    },
  })

  if (Object.keys(passthrough).length > 0) {
    extensions = capturePlatformPassthrough(extensions, 'cherry', passthrough, includeSecrets)
  }

  return {
    id: typeof message.id === 'string' ? message.id : crypto.randomUUID(),
    role: normalizeRole(message.role),
    parts,
    createdAt: toIsoUtc(message.createdAt),
    finishedAt: toIsoUtc(message.updatedAt),
    model: compactObject({
      providerId: typeof modelRecord?.provider === 'string' ? modelRecord.provider : undefined,
      modelId: typeof message.modelId === 'string' ? message.modelId : typeof modelRecord?.id === 'string' ? modelRecord.id : undefined,
      displayName:
        typeof modelRecord?.name === 'string'
          ? modelRecord.name
          : typeof message.modelId === 'string'
            ? message.modelId
            : undefined,
    }),
    usage: usage && Object.keys(usage).length > 0 ? usage : undefined,
    annotations: Array.isArray(message.providerMetadata) ? message.providerMetadata : undefined,
    status: typeof message.status === 'string' ? message.status : undefined,
    extensions,
  }
}

/**
 * Map Cherry provider slice to Core provider list.
 */
export function mapCherryProvidersToCore(persistState: Record<string, unknown>, includeSecrets: boolean): CoreProvider[] {
  const llmSlice = asRecord(persistState.llm)
  const providers = Array.isArray(llmSlice?.providers) ? llmSlice.providers : []

  return providers
    .map((rawProvider) => {
      const provider = asRecord(rawProvider)
      if (!provider || typeof provider.id !== 'string') {
        return undefined
      }

      const models = Array.isArray(provider.models)
        ? provider.models
            .map((rawModel) => {
              const model = asRecord(rawModel)
              if (!model || typeof model.id !== 'string') {
                return undefined
              }

              return {
                id: model.id,
                name: typeof model.name === 'string' ? model.name : model.id,
                type: Array.isArray(model.type) ? 'chat' : undefined,
                extensions: compactObject({
                  group: typeof model.group === 'string' ? model.group : undefined,
                  ownedBy: typeof model.owned_by === 'string' ? model.owned_by : undefined,
                }),
              }
            })
            .filter((item): item is NonNullable<typeof item> => Boolean(item))
        : []

      let extensions = compactObject({
        providerType: provider.type,
        authType: provider.authType,
        notes: provider.notes,
      })
      const transportExtensions = readTransportExtensions(provider)
      if (transportExtensions) {
        extensions = compactObject({
          ...transportExtensions,
          ...extensions,
        })
      }

      const passthrough = compactObject({
        ...Object.fromEntries(
          Object.entries(provider).filter(
            ([key]) => !['id', 'type', 'name', 'enabled', 'apiHost', 'apiKey', 'models', '__chatbridge_extensions'].includes(key)
          )
        ),
      })

      if (Object.keys(passthrough).length > 0) {
        extensions = capturePlatformPassthrough(extensions, 'cherry', passthrough, includeSecrets)
      }

      return {
        id: provider.id,
        type: normalizeProviderType(provider.type ?? provider.id),
        name: typeof provider.name === 'string' ? provider.name : provider.id,
        enabled: typeof provider.enabled === 'boolean' ? provider.enabled : true,
        endpoint: typeof provider.apiHost === 'string' ? provider.apiHost : undefined,
        apiKey: includeSecrets && typeof provider.apiKey === 'string' ? provider.apiKey : undefined,
        models,
        extensions,
      } as CoreProvider
    })
    .filter((item): item is CoreProvider => Boolean(item))
}

/**
 * Map Cherry topics/message_blocks tables to Core conversations.
 *
 * Design choice:
 * - We keep Cherry conversations linear (`messages` only).
 * - Cross-topic clone relationships stay in passthrough/extensions.
 */
export function mapCherryTopicsToCoreConversations(
  topicsRaw: unknown,
  blocksRaw: unknown,
  topicMetaMap: Map<string, Record<string, unknown>>,
  includeSecrets: boolean = false
): CoreConversation[] {
  const topics = Array.isArray(topicsRaw) ? topicsRaw : []
  const blocks = Array.isArray(blocksRaw) ? blocksRaw : []

  const blockMap = new Map<string, Record<string, unknown>>()
  for (const blockRaw of blocks) {
    const block = asRecord(blockRaw)
    if (block && typeof block.id === 'string') {
      blockMap.set(block.id, block)
    }
  }

  return topics
    .map((topicRaw) => {
      const topic = asRecord(topicRaw)
      if (!topic || typeof topic.id !== 'string') {
        return undefined
      }

      const meta = topicMetaMap.get(topic.id)
      const rawMessages = Array.isArray(topic.messages) ? topic.messages : []
      const messages = rawMessages.map((message) => mapCherryMessageToCore(message, blockMap, includeSecrets))

      const createdCandidates = messages
        .map((message) => toEpochMillis(message.createdAt))
        .filter((value): value is number => value !== undefined)
      const updatedCandidates = messages
        .map((message) => toEpochMillis(message.finishedAt ?? message.createdAt))
        .filter((value): value is number => value !== undefined)

      const createdAt =
        typeof meta?.createdAt === 'string'
          ? toIsoUtc(meta.createdAt)
          : createdCandidates.length > 0
            ? new Date(Math.min(...createdCandidates)).toISOString()
            : undefined

      const updatedAt =
        typeof meta?.updatedAt === 'string'
          ? toIsoUtc(meta.updatedAt)
          : updatedCandidates.length > 0
            ? new Date(Math.max(...updatedCandidates)).toISOString()
            : undefined

      const transportExtensions = compactObject({
        ...(readTransportExtensions(topic) ?? {}),
        ...(meta && typeof meta === 'object' ? (readTransportExtensions(meta as Record<string, unknown>) ?? {}) : {}),
      })

      let extensions = compactObject({
        ...transportExtensions,
        cherryTopicMeta: meta,
      })

      const passthrough = compactObject({
        topic: topicRaw,
        meta,
      })
      if (Object.keys(passthrough).length > 0) {
        extensions = capturePlatformPassthrough(extensions, 'cherry', passthrough, includeSecrets)
      }

      return {
        id: topic.id,
        title: typeof meta?.name === 'string' ? meta.name : `Topic ${topic.id}`,
        assistantId: typeof meta?.assistantId === 'string' ? meta.assistantId : undefined,
        pinned: typeof meta?.pinned === 'boolean' ? meta.pinned : undefined,
        createdAt,
        updatedAt,
        messages,
        extensions,
      } as CoreConversation
    })
    .filter((item): item is CoreConversation => Boolean(item))
}

/**
 * Coerce Core role to the three roles Cherry messages accept.
 *
 * Cherry only distinguishes `user`, `assistant`, and `system`.
 * Both `tool` and `unknown` are collapsed to `assistant` because Cherry
 * has no separate tool-role concept.
 */
function mapCoreRoleToCherryRole(role: CoreMessage['role']): 'user' | 'assistant' | 'system' {
  if (role === 'user' || role === 'assistant' || role === 'system') {
    return role
  }
  return 'assistant'
}

/**
 * Convert one Core part into Cherry message block record.
 */
function mapCorePartToCherryBlock(
  messageId: string,
  part: CorePart,
  index: number,
  fallbackTimestamp: string
): Record<string, unknown> {
  const blockId = `${messageId}-block-${index}`

  const base = {
    id: blockId,
    messageId,
    createdAt: fallbackTimestamp,
    updatedAt: fallbackTimestamp,
    status: 'success',
  }

  switch (part.type) {
    case 'text':
      return { ...base, type: 'main_text', content: part.text }
    case 'reasoning':
      return { ...base, type: 'thinking', content: part.text, thinking_millsec: 0 }
    case 'image':
      return { ...base, type: 'image', url: part.uri }
    case 'video':
      return { ...base, type: 'video', url: part.uri }
    case 'file':
      return {
        ...base,
        type: 'file',
        file: {
          id: blockId,
          name: part.name ?? part.uri,
          path: part.uri,
          type: part.mime ?? 'application/octet-stream',
          size: 0,
        },
      }
    case 'tool_call':
      return {
        ...base,
        type: 'tool',
        toolId: part.callId ?? blockId,
        toolName: part.toolName,
        arguments: part.args,
      }
    case 'tool_result':
      return {
        ...base,
        type: 'tool',
        toolId: part.callId ?? blockId,
        toolName: part.toolName,
        content: part.result,
      }
    case 'citation':
      return {
        ...base,
        type: 'citation',
        response: part.data,
      }
    case 'audio':
      return {
        ...base,
        type: 'file',
        file: {
          id: blockId,
          name: part.uri,
          path: part.uri,
          type: part.mime ?? 'audio/unknown',
          size: 0,
        },
      }
    case 'unknown':
      return {
        ...base,
        type: 'error',
        error: {
          message: 'unknown core part',
          raw: part.raw,
        },
      }
    default:
      return {
        ...base,
        type: 'error',
        error: {
          message: 'unsupported core part',
        },
      }
  }
}

/**
 * Convert Core conversation set to Cherry indexedDB tables + assistants slice.
 */
export function mapCoreConversationsToCherryTables(
  conversations: CoreConversation[],
  preservePrivateState: boolean = true
): {
  topics: Record<string, unknown>[]
  messageBlocks: Record<string, unknown>[]
  assistantsSlice: Record<string, unknown>
} {
  const topics: Record<string, unknown>[] = []
  const messageBlocks: Record<string, unknown>[] = []

  const assistants: Record<string, unknown>[] = [
    {
      id: 'chatbridge-assistant',
      name: 'ChatBridge',
      prompt: '',
      topics: [],
      type: 'assistant',
      settings: {},
    },
  ]

  const assistantTopics: Record<string, unknown>[] = []

  for (const conversation of conversations) {
    const messages: Record<string, unknown>[] = []

    for (const message of conversation.messages) {
      const createdAt = message.createdAt ?? new Date().toISOString()
      const blocks = message.parts.map((part, index) =>
        mapCorePartToCherryBlock(message.id, part, index, createdAt)
      )

      messageBlocks.push(...blocks)

      const messageBase = compactObject({
          id: message.id,
          role: mapCoreRoleToCherryRole(message.role),
          assistantId: conversation.assistantId ?? 'chatbridge-assistant',
          topicId: conversation.id,
          createdAt,
          updatedAt: message.finishedAt,
          status: message.status ?? 'success',
          modelId: message.model?.modelId,
          model: message.model
            ? {
                id: message.model.modelId ?? 'unknown',
                provider: message.model.providerId ?? 'unknown',
                name: message.model.displayName ?? message.model.modelId ?? 'unknown',
                group: 'chatbridge',
              }
            : undefined,
          usage: message.usage
            ? {
                prompt_tokens: message.usage.promptTokens,
                completion_tokens: message.usage.completionTokens,
                cached_tokens: message.usage.cachedTokens,
                total_tokens: message.usage.totalTokens,
              }
            : undefined,
          blocks: blocks.map((block) => block.id),
        })

      const messageMerged = mergeWithPlatformPassthrough(
        messageBase,
        message.extensions,
        'cherry',
        preservePrivateState
      )
      messages.push(preservePrivateState ? attachTransportExtensions(messageMerged, message.extensions) : messageMerged)
    }

    const topicBase = {
      id: conversation.id,
      messages,
    }

    const topicMerged = mergeWithPlatformPassthrough(topicBase, conversation.extensions, 'cherry', preservePrivateState)
    topics.push(preservePrivateState ? attachTransportExtensions(topicMerged, conversation.extensions) : topicMerged)

    const assistantTopicBase = compactObject({
        id: conversation.id,
        assistantId: conversation.assistantId ?? 'chatbridge-assistant',
        name: conversation.title,
        createdAt: conversation.createdAt ?? new Date().toISOString(),
        updatedAt: conversation.updatedAt ?? conversation.createdAt ?? new Date().toISOString(),
        pinned: conversation.pinned ?? false,
        type: 'chat',
      })

    const assistantTopicMerged = mergeWithPlatformPassthrough(
      assistantTopicBase,
      conversation.extensions,
      'cherry',
      preservePrivateState
    )
    assistantTopics.push(
      preservePrivateState
        ? attachTransportExtensions(assistantTopicMerged, conversation.extensions)
        : assistantTopicMerged
    )
  }

  assistants[0].topics = assistantTopics

  return {
    topics,
    messageBlocks,
    assistantsSlice: {
      defaultAssistant: assistants[0],
      assistants,
      tagsOrder: [],
      collapsedTags: {},
      presets: [],
      unifiedListOrder: [],
    },
  }
}

/**
 * Convert Core providers to Cherry `llm` slice.
 */
export function mapCoreProvidersToCherryLlmSlice(
  providers: CoreProvider[],
  includeSecrets: boolean,
  preservePrivateState: boolean = true
): Record<string, unknown> {
  const cherryProviders = providers.map((provider) => {
    const modelFallback = provider.models?.[0]

    const base = {
      id: provider.id,
      type: provider.type,
      name: provider.name ?? provider.id,
      apiKey: includeSecrets ? provider.apiKey ?? '' : '',
      apiHost: provider.endpoint ?? '',
      models: (provider.models ?? []).map((model) => ({
        id: model.id,
        provider: provider.id,
        name: model.name ?? model.id,
        group: model.type ?? 'chatbridge',
      })),
      enabled: provider.enabled ?? true,
      isSystem: false,
      authType: 'apiKey',
      rateLimit: 0,
      defaultModelId: modelFallback?.id,
    }

    const merged = mergeWithPlatformPassthrough(base, provider.extensions, 'cherry', preservePrivateState)
    return preservePrivateState ? attachTransportExtensions(merged, provider.extensions) : merged
  })

  const firstProvider = cherryProviders[0]
  const firstModel = firstProvider?.models?.[0]

  return {
    providers: cherryProviders,
    defaultModel: firstModel ?? null,
    topicNamingModel: firstModel ?? null,
    quickModel: firstModel ?? null,
    translateModel: firstModel ?? null,
    quickAssistantId: '',
    settings: {
      ollama: { keepAliveTime: 0 },
      lmstudio: { keepAliveTime: 0 },
      gpustack: { keepAliveTime: 0 },
      vertexai: {
        serviceAccount: { privateKey: '', clientEmail: '' },
        projectId: '',
        location: '',
      },
      awsBedrock: {
        authType: 'iam',
        accessKeyId: '',
        secretAccessKey: '',
        apiKey: '',
        region: '',
      },
      cherryIn: {
        accessToken: '',
        refreshToken: '',
      },
    },
  }
}
