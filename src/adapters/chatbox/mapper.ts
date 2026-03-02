import type {
  CoreBranch,
  CoreBranchPoint,
  CoreBranchVariant,
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

function compactObject<T extends Record<string, unknown>>(value: T): T {
  const output: Record<string, unknown> = {}
  for (const [key, current] of Object.entries(value)) {
    if (current !== undefined) {
      output[key] = current
    }
  }
  return output as T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function extractUnknownFields(record: Record<string, unknown>, keepKeys: string[]): Record<string, unknown> | undefined {
  const set = new Set(keepKeys)
  const unknownEntries = Object.entries(record).filter(([key]) => !set.has(key))
  if (unknownEntries.length === 0) {
    return undefined
  }
  return Object.fromEntries(unknownEntries)
}

function clampIndex(value: number, max: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }

  if (max <= 0) {
    return 0
  }

  return Math.max(0, Math.min(Math.trunc(value), max - 1))
}

/**
 * Convert one Chatbox fork list into Core branch variant.
 */
function mapForkListToVariant(rawList: unknown, includeSecrets: boolean, fallbackId: string): CoreBranchVariant | undefined {
  if (!isRecord(rawList)) {
    return undefined
  }

  const rawMessages = Array.isArray(rawList.messages) ? rawList.messages : []
  const messages = rawMessages.map((item) => mapChatboxMessageToCore(item, includeSecrets))

  return {
    id: typeof rawList.id === 'string' ? rawList.id : fallbackId,
    messages,
    extensions: extractUnknownFields(rawList, ['id', 'messages']),
  }
}

/**
 * Map Chatbox's native `messageForksHash` into Core `branchPoints`.
 *
 * We intentionally keep `tail` semantics:
 * - Chatbox stores branch alternatives as message tails after one anchor.
 * - We preserve this directly instead of forcing slot/tree reshaping.
 */
function buildBranchPointsFromForkHash(
  rawForks: unknown,
  includeSecrets: boolean
): { branchPoints: CoreBranchPoint[]; branches: CoreBranch[] } {
  if (!isRecord(rawForks)) {
    return { branchPoints: [], branches: [] }
  }

  const branchPoints: CoreBranchPoint[] = []
  const branches: CoreBranch[] = []

  for (const [anchorId, rawFork] of Object.entries(rawForks)) {
    if (!isRecord(rawFork)) {
      continue
    }

    const rawLists = Array.isArray(rawFork.lists) ? rawFork.lists : []
    const variants = rawLists
      .map((rawList, index) => mapForkListToVariant(rawList, includeSecrets, `${anchorId}:variant:${index}`))
      .filter((item): item is CoreBranchVariant => Boolean(item))

    if (variants.length === 0) {
      continue
    }

    const selectedVariantIndex = clampIndex(
      typeof rawFork.position === 'number' ? rawFork.position : 0,
      variants.length
    )

    const point: CoreBranchPoint = {
      id: anchorId,
      anchorMessageId: anchorId,
      mode: 'tail',
      selectedVariantIndex,
      variants,
      extensions: extractUnknownFields(rawFork, ['position', 'lists', 'createdAt']),
    }

    if (typeof rawFork.createdAt === 'number') {
      point.extensions = compactObject({
        ...(point.extensions ?? {}),
        createdAt: rawFork.createdAt,
      })
    }

    branchPoints.push(point)

    const compatVariants = variants
      .map((variant) => variant.messages[0])
      .filter((message): message is CoreMessage => Boolean(message))

    if (compatVariants.length > 1) {
      branches.push({
        nodeId: anchorId,
        selectedIndex: clampIndex(selectedVariantIndex, compatVariants.length),
        variants: compatVariants,
      })
    }
  }

  return { branchPoints, branches }
}

/**
 * Build Chatbox `messageForksHash` from Core branch data.
 *
 * Priority:
 * 1) `branchPoints` (Phase 3 canonical shape)
 * 2) fallback to legacy `branches`
 */
function buildChatboxForkHashFromBranchPoints(
  conversation: CoreConversation,
  preservePrivateState: boolean
): Record<string, unknown> | undefined {
  const output: Record<string, unknown> = {}

  const branchPoints = Array.isArray(conversation.branchPoints) ? conversation.branchPoints : []

  for (let index = 0; index < branchPoints.length; index += 1) {
    const point = branchPoints[index]
    const rawVariants = Array.isArray(point.variants) ? point.variants : []

    if (rawVariants.length === 0) {
      continue
    }

    const anchorMessageId = point.anchorMessageId ?? point.id
    if (!anchorMessageId) {
      continue
    }

    const lists = rawVariants.map((variant, variantIndex) => {
      const messages = Array.isArray(variant.messages)
        ? variant.messages.map((message) => mapCoreMessageToChatboxMessage(message, preservePrivateState))
        : []

      return mergeWithPlatformPassthrough(
        {
          id: variant.id || `${anchorMessageId}:variant:${variantIndex}`,
          messages,
        },
        variant.extensions,
        'chatbox',
        preservePrivateState
      )
    })

    const selected = clampIndex(point.selectedVariantIndex, lists.length)

    output[anchorMessageId] = mergeWithPlatformPassthrough(
      {
        position: selected,
        lists,
        createdAt: Date.now(),
      },
      point.extensions,
      'chatbox',
      preservePrivateState
    )
  }

  if (Object.keys(output).length > 0) {
    return output
  }

  if (!Array.isArray(conversation.branches)) {
    return undefined
  }

  for (const branch of conversation.branches) {
    const lists = branch.variants.map((variant, variantIndex) => ({
      id: `${branch.nodeId}:variant:${variantIndex}`,
      messages: [mapCoreMessageToChatboxMessage(variant, preservePrivateState)],
    }))

    if (lists.length <= 1) {
      continue
    }

    output[branch.nodeId] = {
      position: clampIndex(typeof branch.selectedIndex === 'number' ? branch.selectedIndex : 0, lists.length),
      lists,
      createdAt: Date.now(),
    }
  }

  return Object.keys(output).length > 0 ? output : undefined
}

/**
 * Map one Chatbox raw part into universal CorePart.
 */
export function mapChatboxPartToCore(rawPart: unknown): CorePart {
  if (!rawPart || typeof rawPart !== 'object') {
    return { type: 'unknown', raw: rawPart }
  }

  const part = rawPart as Record<string, unknown>

  switch (part.type) {
    case 'text':
      return {
        type: 'text',
        text: typeof part.text === 'string' ? part.text : '',
      }
    case 'reasoning':
      return {
        type: 'reasoning',
        text: typeof part.text === 'string' ? part.text : '',
      }
    case 'image': {
      const uri = typeof part.storageKey === 'string' ? part.storageKey : ''
      return {
        type: 'image',
        uri,
      }
    }
    case 'tool-call': {
      const state = typeof part.state === 'string' ? part.state : 'call'
      const callId = typeof part.toolCallId === 'string' ? part.toolCallId : undefined
      const toolName = typeof part.toolName === 'string' ? part.toolName : 'unknown'

      if (state === 'call') {
        return {
          type: 'tool_call',
          toolName,
          args: part.args,
          callId,
        }
      }

      return {
        type: 'tool_result',
        toolName,
        result: part.result ?? part.args,
        callId,
      }
    }
    case 'info':
      return {
        type: 'citation',
        data: {
          text: part.text,
          values: part.values,
        },
      }
    default:
      return {
        type: 'unknown',
        raw: rawPart,
      }
  }
}

/**
 * Map one Chatbox message into CoreMessage.
 */
export function mapChatboxMessageToCore(rawMessage: unknown, includeSecrets: boolean = false): CoreMessage {
  const fallback: CoreMessage = {
    id: crypto.randomUUID(),
    role: 'unknown',
    parts: [{ type: 'unknown', raw: rawMessage }],
  }

  if (!rawMessage || typeof rawMessage !== 'object') {
    return fallback
  }

  const message = rawMessage as Record<string, unknown>
  const rawParts = Array.isArray(message.contentParts) ? message.contentParts : []
  const parts = rawParts.map(mapChatboxPartToCore)

  if (parts.length === 0 && typeof message.reasoningContent === 'string') {
    parts.push({ type: 'reasoning', text: message.reasoningContent })
  }

  if (parts.length === 0) {
    parts.push({ type: 'unknown', raw: rawMessage })
  }

  const usageValue = message.usage
  let usage: CoreMessage['usage']
  if (usageValue && typeof usageValue === 'object') {
    const usageRecord = usageValue as Record<string, unknown>
    usage = compactObject({
      promptTokens: typeof usageRecord.inputTokens === 'number' ? usageRecord.inputTokens : undefined,
      completionTokens: typeof usageRecord.outputTokens === 'number' ? usageRecord.outputTokens : undefined,
      cachedTokens: typeof usageRecord.cachedInputTokens === 'number' ? usageRecord.cachedInputTokens : undefined,
      totalTokens:
        typeof usageRecord.totalTokens === 'number'
          ? usageRecord.totalTokens
          : typeof message.tokenCount === 'number'
            ? message.tokenCount
            : undefined,
    })

    if (Object.keys(usage).length === 0) {
      usage = undefined
    }
  } else {
    usage = compactObject({
      completionTokens: typeof message.tokenCount === 'number' ? message.tokenCount : undefined,
      totalTokens:
        typeof message.tokensUsed === 'number'
          ? message.tokensUsed
          : typeof message.tokenCount === 'number'
            ? message.tokenCount
            : undefined,
    })

    if (Object.keys(usage).length === 0) {
      usage = undefined
    }
  }

  const status = Array.isArray(message.status)
    ? message.status
        .map((item) =>
          item && typeof item === 'object' && typeof (item as Record<string, unknown>).type === 'string'
            ? (item as Record<string, unknown>).type
            : undefined
        )
        .filter((item): item is string => Boolean(item))
        .join(',')
    : undefined

  const transportExtensions = readTransportExtensions(message)
  const passthrough = extractUnknownFields(message, [
    'id',
    'role',
    'contentParts',
    'reasoningContent',
    'timestamp',
    'updatedAt',
    'aiProvider',
    'model',
    'usage',
    'tokenCount',
    'tokensUsed',
    'links',
    'status',
    '__chatbridge_extensions',
  ])

  let extensions = compactObject({
    ...(transportExtensions ?? {}),
    ...(passthrough ?? {}),
  })
  if (passthrough) {
    extensions = capturePlatformPassthrough(extensions, 'chatbox', passthrough, includeSecrets)
  }

  const output: CoreMessage = {
    id: typeof message.id === 'string' ? message.id : crypto.randomUUID(),
    role: normalizeRole(message.role),
    parts,
    createdAt: toIsoUtc(message.timestamp),
    finishedAt: toIsoUtc(message.updatedAt),
    model: compactObject({
      providerId: typeof message.aiProvider === 'string' ? message.aiProvider : undefined,
      modelId: typeof message.model === 'string' ? message.model : undefined,
      displayName: typeof message.model === 'string' ? message.model : undefined,
    }),
    usage,
    annotations: Array.isArray(message.links) ? message.links : undefined,
    status,
    extensions,
  }

  if (output.model && Object.keys(output.model).length === 0) {
    output.model = undefined
  }

  if (output.extensions && Object.keys(output.extensions).length === 0) {
    output.extensions = undefined
  }

  return output
}

/**
 * Map one Chatbox session into CoreConversation.
 */
export function mapChatboxSessionToCore(rawSession: unknown, includeSecrets: boolean = false): CoreConversation | undefined {
  if (!rawSession || typeof rawSession !== 'object') {
    return undefined
  }

  const session = rawSession as Record<string, unknown>
  const id = typeof session.id === 'string' ? session.id : undefined
  if (!id) {
    return undefined
  }

  const rawMessages = Array.isArray(session.messages) ? session.messages : []
  const messages = rawMessages.map((item) => mapChatboxMessageToCore(item, includeSecrets))

  const createdAtFromMessages = messages.map((m) => toEpochMillis(m.createdAt)).filter((v): v is number => v !== undefined)
  const updatedAtFromMessages = messages
    .map((m) => toEpochMillis(m.finishedAt ?? m.createdAt))
    .filter((v): v is number => v !== undefined)

  const createdAt = createdAtFromMessages.length > 0 ? new Date(Math.min(...createdAtFromMessages)).toISOString() : undefined
  const updatedAt = updatedAtFromMessages.length > 0 ? new Date(Math.max(...updatedAtFromMessages)).toISOString() : undefined

  const { branchPoints, branches } = buildBranchPointsFromForkHash(session.messageForksHash, includeSecrets)

  const transportExtensions = readTransportExtensions(session)
  const passthrough = extractUnknownFields(session, ['id', 'name', 'copilotId', 'starred', 'messages'])

  let extensions = compactObject({
    ...(transportExtensions ?? {}),
    ...(extractUnknownFields(session, [
    'id',
    'name',
    'copilotId',
    'starred',
    'messages',
    'type',
    'hidden',
    'settings',
    'threadName',
    'threads',
    'messageForksHash',
    'compactionPoints',
    'assistantAvatarKey',
    'picUrl',
    '__chatbridge_extensions',
  ]) ?? {}),
  })

  if (passthrough) {
    extensions = capturePlatformPassthrough(extensions, 'chatbox', passthrough, includeSecrets)
  }

  const output: CoreConversation = {
    id,
    title: typeof session.name === 'string' ? session.name : `Session ${id}`,
    assistantId: typeof session.copilotId === 'string' ? session.copilotId : undefined,
    pinned: typeof session.starred === 'boolean' ? session.starred : undefined,
    createdAt,
    updatedAt,
    messages,
    branchPoints: branchPoints.length > 0 ? branchPoints : undefined,
    branches: branches.length > 0 ? branches : undefined,
    extensions,
  }

  if (output.extensions && Object.keys(output.extensions).length === 0) {
    output.extensions = undefined
  }

  return output
}

/**
 * Map Chatbox provider settings map into Core providers.
 */
export function mapChatboxProvidersToCore(rawProviders: unknown, includeSecrets: boolean): CoreProvider[] {
  if (!rawProviders || typeof rawProviders !== 'object') {
    return []
  }

  return Object.entries(rawProviders as Record<string, unknown>).map(([providerId, rawProvider]) => {
    const provider = rawProvider && typeof rawProvider === 'object' ? (rawProvider as Record<string, unknown>) : {}
    const rawModels = Array.isArray(provider.models) ? provider.models : []

    const transportExtensions = readTransportExtensions(provider)
    let extensions = compactObject({
      ...(transportExtensions ?? {}),
      ...(extractUnknownFields(provider, ['apiKey', 'apiHost', 'endpoint', 'models', '__chatbridge_extensions']) ?? {}),
    })
    const passthrough = extractUnknownFields(provider, [])
    if (passthrough) {
      extensions = capturePlatformPassthrough(extensions, 'chatbox', passthrough, includeSecrets)
    }

    return {
      id: providerId,
      type: normalizeProviderType(providerId),
      name: providerId,
      enabled: true,
      endpoint:
        typeof provider.apiHost === 'string'
          ? provider.apiHost
          : typeof provider.endpoint === 'string'
            ? provider.endpoint
            : undefined,
      apiKey: includeSecrets && typeof provider.apiKey === 'string' ? provider.apiKey : undefined,
      models: rawModels
        .map((model) => {
          if (!model || typeof model !== 'object') {
            return undefined
          }

          const modelRecord = model as Record<string, unknown>
          const modelId = typeof modelRecord.modelId === 'string' ? modelRecord.modelId : undefined
          if (!modelId) {
            return undefined
          }

          return {
            id: modelId,
            name: typeof modelRecord.nickname === 'string' ? modelRecord.nickname : modelId,
            type: typeof modelRecord.type === 'string' ? modelRecord.type : undefined,
            contextWindow: typeof modelRecord.contextWindow === 'number' ? modelRecord.contextWindow : undefined,
            maxOutput: typeof modelRecord.maxOutput === 'number' ? modelRecord.maxOutput : undefined,
            extensions: extractUnknownFields(modelRecord, ['modelId', 'nickname', 'type', 'contextWindow', 'maxOutput']),
          }
        })
        .filter((model): model is NonNullable<typeof model> => Boolean(model)),
      extensions,
    }
  })
}

/**
 * Map one Core part back to Chatbox message part shape.
 */
export function mapCorePartToChatboxPart(part: CorePart): Record<string, unknown> {
  switch (part.type) {
    case 'text':
      return {
        type: 'text',
        text: part.text,
      }
    case 'reasoning':
      return {
        type: 'reasoning',
        text: part.text,
      }
    case 'image':
      return {
        type: 'image',
        storageKey: part.uri,
      }
    case 'tool_call':
      return {
        type: 'tool-call',
        state: 'call',
        toolCallId: part.callId ?? crypto.randomUUID(),
        toolName: part.toolName,
        args: part.args,
      }
    case 'tool_result':
      return {
        type: 'tool-call',
        state: 'result',
        toolCallId: part.callId ?? crypto.randomUUID(),
        toolName: part.toolName,
        args: {},
        result: part.result,
      }
    case 'citation':
      return {
        type: 'info',
        text: 'citation',
        values: part.data,
      }
    case 'audio':
    case 'video':
    case 'file':
      return {
        type: 'info',
        text: `${part.type}:${'uri' in part ? part.uri : ''}`,
      }
    case 'unknown':
      return {
        type: 'info',
        text: 'unknown_part',
        values: part.raw,
      }
    default:
      return {
        type: 'info',
        text: 'unsupported_part',
      }
  }
}

/**
 * Map one Core message to Chatbox message shape, then re-apply passthrough.
 */
export function mapCoreMessageToChatboxMessage(
  message: CoreMessage,
  preservePrivateState: boolean = true
): Record<string, unknown> {
  const usage = message.usage
    ? {
        inputTokens: message.usage.promptTokens,
        outputTokens: message.usage.completionTokens,
        totalTokens: message.usage.totalTokens,
        cachedInputTokens: message.usage.cachedTokens,
      }
    : undefined

  const base = compactObject({
    id: message.id,
    role: message.role === 'unknown' ? 'assistant' : message.role,
    contentParts: message.parts.map(mapCorePartToChatboxPart),
    timestamp: toEpochMillis(message.createdAt),
    updatedAt: toEpochMillis(message.finishedAt),
    aiProvider: message.model?.providerId,
    model: message.model?.modelId,
    usage,
    tokenCount: message.usage?.completionTokens,
    status: message.status ? [{ type: message.status }] : undefined,
  })

  const merged = mergeWithPlatformPassthrough(base, message.extensions, 'chatbox', preservePrivateState)
  return preservePrivateState ? attachTransportExtensions(merged, message.extensions) : merged
}

/**
 * Map one Core conversation to Chatbox session shape.
 */
export function mapCoreConversationToChatboxSession(
  conversation: CoreConversation,
  preservePrivateState: boolean = true
): Record<string, unknown> {
  const base = compactObject({
    id: conversation.id,
    name: conversation.title,
    starred: conversation.pinned,
    copilotId: conversation.assistantId,
    messages: conversation.messages.map((message) => mapCoreMessageToChatboxMessage(message, preservePrivateState)),
    messageForksHash: buildChatboxForkHashFromBranchPoints(conversation, preservePrivateState),
  })

  const merged = mergeWithPlatformPassthrough(base, conversation.extensions, 'chatbox', preservePrivateState)
  return preservePrivateState ? attachTransportExtensions(merged, conversation.extensions) : merged
}

/**
 * Map Core provider list to Chatbox settings.providers shape.
 */
export function mapCoreProvidersToChatboxSettingsProviders(
  providers: CoreProvider[],
  includeSecrets: boolean,
  preservePrivateState: boolean = true
): Record<string, unknown> {
  const output: Record<string, unknown> = {}

  for (const provider of providers) {
    const base = compactObject({
      apiKey: includeSecrets ? provider.apiKey : undefined,
      apiHost: provider.endpoint,
      models: provider.models?.map((model) =>
        compactObject({
          modelId: model.id,
          nickname: model.name,
          type: model.type,
          contextWindow: model.contextWindow,
          maxOutput: model.maxOutput,
        })
      ),
    })

    const merged = mergeWithPlatformPassthrough(base, provider.extensions, 'chatbox', preservePrivateState)
    output[provider.id] = preservePrivateState ? attachTransportExtensions(merged, provider.extensions) : merged
  }

  return output
}
