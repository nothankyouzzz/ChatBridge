/**
 * Rikkahub ↔ Core Mapper
 *
 * Converts between Rikkahub's Room database rows / settings JSON and the
 * universal Core schema. Both parse and generate directions are handled here.
 */
import type {
  CoreBranch,
  CoreBranchPoint,
  CoreBranchVariant,
  CoreConversation,
  CoreMessage,
  CorePart,
  CoreProvider,
} from '../../core/schema/core.types.ts'
import { capturePlatformPassthrough, readTransportExtensions } from '../../core/extensions/passthrough.ts'
import { normalizeProviderType } from '../../core/mapping/provider-map.ts'
import { normalizeRole } from '../../core/normalize/role.ts'
import { toIsoUtc } from '../../core/normalize/time.ts'

/** Return `value` as a plain object, or `undefined` if it is null/array/primitive. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return undefined
}

/** Return a copy of `value` with all `undefined` entries removed. */
function compactObject<T extends Record<string, unknown>>(value: T): T {
  const output: Record<string, unknown> = {}
  for (const [key, current] of Object.entries(value)) {
    if (current !== undefined) {
      output[key] = current
    }
  }
  return output as T
}

/**
 * Try to JSON-parse a string value.
 * Returns the original value unchanged when the input is not a string
 * or when parsing fails (e.g. already a parsed object stored in the column).
 */
function parseJsonOrRaw(value: unknown): unknown {
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
 * Deserialize the `input` field from a Rikkahub tool-call node.
 *
 * Rikkahub serializes tool arguments as a JSON string in the database.
 * If `input` is already an object (e.g. during a roundtrip) it is returned as-is.
 */
function mapToolInput(input: unknown): unknown {
  if (typeof input !== 'string') {
    return input
  }

  try {
    return JSON.parse(input)
  } catch {
    return input
  }
}

/**
 * Map one Rikkahub UI part into Core part list.
 *
 * Notes:
 * - Rikkahub `tool` part can carry both call + output in one node.
 * - We emit two Core parts (`tool_call` + `tool_result`) to keep semantics.
 */
export function mapRikkahubUiPartToCoreParts(rawPart: unknown): CorePart[] {
  const part = asRecord(rawPart)
  if (!part || typeof part.type !== 'string') {
    return [{ type: 'unknown', raw: rawPart }]
  }

  switch (part.type) {
    case 'text':
      return [{ type: 'text', text: typeof part.text === 'string' ? part.text : '' }]
    case 'reasoning':
      return [{ type: 'reasoning', text: typeof part.reasoning === 'string' ? part.reasoning : '' }]
    case 'image':
      return [{ type: 'image', uri: typeof part.url === 'string' ? part.url : '' }]
    case 'video':
      return [{ type: 'video', uri: typeof part.url === 'string' ? part.url : '' }]
    case 'audio':
      return [{ type: 'audio', uri: typeof part.url === 'string' ? part.url : '' }]
    case 'document':
      return [
        {
          type: 'file',
          uri: typeof part.url === 'string' ? part.url : '',
          name: typeof part.fileName === 'string' ? part.fileName : undefined,
          mime: typeof part.mime === 'string' ? part.mime : undefined,
        },
      ]
    case 'tool': {
      const toolName = typeof part.toolName === 'string' ? part.toolName : 'unknown'
      const callId = typeof part.toolCallId === 'string' ? part.toolCallId : undefined
      const outputParts = Array.isArray(part.output)
        ? part.output.flatMap((item) => mapRikkahubUiPartToCoreParts(item))
        : undefined

      return [
        {
          type: 'tool_call',
          toolName,
          callId,
          args: mapToolInput(part.input),
        },
        {
          type: 'tool_result',
          toolName,
          callId,
          result: outputParts && outputParts.length > 0 ? outputParts : part.output,
        },
      ]
    }
    default:
      return [{ type: 'unknown', raw: rawPart }]
  }
}

/**
 * Backward-compatible wrapper without secret passthrough.
 */
export function mapRikkahubUiMessageToCore(rawMessage: unknown): CoreMessage {
  return mapRikkahubUiMessageToCoreWithSecrets(rawMessage, false)
}

/**
 * Map one Rikkahub UI message JSON record into Core message.
 */
export function mapRikkahubUiMessageToCoreWithSecrets(rawMessage: unknown, includeSecrets: boolean): CoreMessage {
  const message = asRecord(rawMessage)
  if (!message) {
    return {
      id: crypto.randomUUID(),
      role: 'unknown',
      parts: [{ type: 'unknown', raw: rawMessage }],
    }
  }

  const rawParts = Array.isArray(message.parts) ? message.parts : []
  const parts = rawParts.flatMap((part) => mapRikkahubUiPartToCoreParts(part))

  const usage = asRecord(message.usage)
  const transportExtensions = readTransportExtensions(message)

  const passthrough = compactObject({
    ...Object.fromEntries(
      Object.entries(message).filter(
        ([key]) =>
          !['id', 'role', 'parts', 'annotations', 'createdAt', 'finishedAt', 'modelId', 'usage', 'translation', '__chatbridge_extensions'].includes(key)
      )
    ),
    translation: message.translation,
  })

  let extensions = compactObject({
    ...(transportExtensions ?? {}),
    translation: message.translation,
  })
  if (Object.keys(passthrough).length > 0) {
    extensions = capturePlatformPassthrough(extensions, 'rikkahub', passthrough, includeSecrets)
  }

  return {
    id: typeof message.id === 'string' ? message.id : crypto.randomUUID(),
    role: normalizeRole(message.role),
    parts: parts.length > 0 ? parts : [{ type: 'unknown', raw: rawMessage }],
    createdAt: toIsoUtc(message.createdAt),
    finishedAt: toIsoUtc(message.finishedAt),
    model: compactObject({
      modelId: typeof message.modelId === 'string' ? message.modelId : undefined,
      displayName: typeof message.modelId === 'string' ? message.modelId : undefined,
    }),
    usage: usage
      ? compactObject({
          promptTokens: typeof usage.promptTokens === 'number' ? usage.promptTokens : undefined,
          completionTokens: typeof usage.completionTokens === 'number' ? usage.completionTokens : undefined,
          cachedTokens: typeof usage.cachedTokens === 'number' ? usage.cachedTokens : undefined,
          totalTokens: typeof usage.totalTokens === 'number' ? usage.totalTokens : undefined,
        })
      : undefined,
    annotations: Array.isArray(message.annotations) ? message.annotations : undefined,
    extensions,
  }
}

/**
 * Map `settings.providers` to universal provider list.
 */
export function mapRikkahubProvidersToCore(settings: Record<string, unknown>, includeSecrets: boolean): CoreProvider[] {
  const providers = Array.isArray(settings.providers) ? settings.providers : []

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
                name: typeof model.displayName === 'string' ? model.displayName : undefined,
                type: typeof model.type === 'string' ? model.type : undefined,
                extensions: compactObject({
                  modelId: model.modelId,
                  inputModalities: model.inputModalities,
                  outputModalities: model.outputModalities,
                  abilities: model.abilities,
                }),
              }
            })
            .filter((item): item is NonNullable<typeof item> => Boolean(item))
        : []

      let extensions = compactObject({
        providerType: provider.type,
        rawProvider: compactObject({
          useResponseApi: provider.useResponseApi,
          promptCaching: provider.promptCaching,
          vertexAI: provider.vertexAI,
        }),
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
            ([key]) =>
              !['id', 'type', 'enabled', 'name', 'apiKey', 'accessToken', 'baseUrl', 'endpoint', 'models', '__chatbridge_extensions'].includes(key)
          )
        ),
      })
      if (Object.keys(passthrough).length > 0) {
        extensions = capturePlatformPassthrough(extensions, 'rikkahub', passthrough, includeSecrets)
      }

      return {
        id: provider.id,
        type: normalizeProviderType(provider.type ?? provider.name ?? provider.id),
        name: typeof provider.name === 'string' ? provider.name : provider.id,
        enabled: typeof provider.enabled === 'boolean' ? provider.enabled : true,
        endpoint:
          typeof provider.baseUrl === 'string'
            ? provider.baseUrl
            : typeof provider.endpoint === 'string'
              ? provider.endpoint
              : undefined,
        apiKey:
          includeSecrets && typeof provider.apiKey === 'string'
            ? provider.apiKey
            : includeSecrets && typeof provider.accessToken === 'string'
              ? provider.accessToken
              : undefined,
        models,
        extensions,
      } as CoreProvider
    })
    .filter((item): item is CoreProvider => Boolean(item))
}

export type RikkahubConversationRow = {
  id: string
  assistant_id: string
  title: string
  nodes: string
  create_at: number
  update_at: number
  truncate_index: number
  suggestions: string
  is_pinned: number
}

export type RikkahubMessageNodeRow = {
  id: string
  conversation_id: string
  node_index: number
  messages: string
  select_index: number
}

/**
 * Map Room rows (`ConversationEntity` + `message_node`) to Core conversations.
 *
 * Branch rationale:
 * - Rikkahub stores alternatives per node (`messages[]`) with `select_index`.
 * - We preserve that shape as `branchPoints(mode='slot')`.
 * - We also emit legacy `branches` for older compatibility code paths.
 */
export function mapRikkahubRowsToCoreConversations(
  conversationRows: RikkahubConversationRow[],
  nodeRows: RikkahubMessageNodeRow[],
  includeSecrets: boolean = false
): CoreConversation[] {
  const nodeByConversation = new Map<string, RikkahubMessageNodeRow[]>()

  for (const node of nodeRows) {
    const list = nodeByConversation.get(node.conversation_id) ?? []
    list.push(node)
    nodeByConversation.set(node.conversation_id, list)
  }

  return conversationRows.map((conversation) => {
    const rows = (nodeByConversation.get(conversation.id) ?? []).sort((a, b) => a.node_index - b.node_index)

    const messages: CoreMessage[] = []
    const branches: CoreBranch[] = []
    const branchPoints: CoreBranchPoint[] = []

    for (const node of rows) {
      const parsed = parseJsonOrRaw(node.messages)
      const variantsRaw = Array.isArray(parsed) ? parsed : []
      const variants = variantsRaw.map((variant) => mapRikkahubUiMessageToCoreWithSecrets(variant, includeSecrets))

      if (variants.length === 0) {
        continue
      }

      const selectedIndex = Math.min(Math.max(node.select_index ?? 0, 0), variants.length - 1)
      messages.push(variants[selectedIndex])

      // Keep slot semantics instead of forcing a fake tail/tree abstraction.
      const branchPointVariants: CoreBranchVariant[] = variants.map((variant, index) => ({
        id: `${node.id}:variant:${index}`,
        messages: [variant],
      }))

      branchPoints.push({
        id: node.id,
        anchorMessageId: messages.length > 1 ? messages[messages.length - 2].id : undefined,
        mode: 'slot',
        selectedVariantIndex: selectedIndex,
        variants: branchPointVariants,
        extensions: {
          nodeIndex: node.node_index,
        },
      })

      if (variants.length > 1) {
        branches.push({
          nodeId: node.id,
          selectedIndex,
          variants,
        })
      }
    }

    const passthrough = compactObject({
      nodes: parseJsonOrRaw(conversation.nodes),
      truncateIndex: conversation.truncate_index,
      suggestions: parseJsonOrRaw(conversation.suggestions),
    })

    let extensions: Record<string, unknown> | undefined = {
      truncateIndex: conversation.truncate_index,
      suggestions: parseJsonOrRaw(conversation.suggestions),
      legacyNodesField: parseJsonOrRaw(conversation.nodes),
    }

    if (Object.keys(passthrough).length > 0) {
      extensions = capturePlatformPassthrough(extensions, 'rikkahub', passthrough, includeSecrets)
    }

    return {
      id: conversation.id,
      title: conversation.title || `Conversation ${conversation.id}`,
      assistantId: conversation.assistant_id,
      pinned: Boolean(conversation.is_pinned),
      createdAt: toIsoUtc(conversation.create_at),
      updatedAt: toIsoUtc(conversation.update_at),
      messages,
      branchPoints: branchPoints.length > 0 ? branchPoints : undefined,
      branches: branches.length > 0 ? branches : undefined,
      extensions,
    } satisfies CoreConversation
  })
}
