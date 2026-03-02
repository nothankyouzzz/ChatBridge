import { createHash } from 'node:crypto'
import path from 'node:path'
import type {
  CoreBundle,
  CoreConversation,
  CoreMessage,
  CorePart,
  CoreProvider,
} from '../../core/schema/core.types.ts'
import { attachTransportExtensions, mergeWithPlatformPassthrough } from '../../core/extensions/passthrough.ts'
import { toEpochMillis } from '../../core/normalize/time.ts'

const DEFAULT_ASSISTANT_ID = '0950e2dc-9bd5-4801-afa3-aa887aa36b4e'
const DEFAULT_AUTO_MODEL_ID = 'b7055fb4-39f9-4042-a88a-0d80ed76cf08'

export type RikkahubConversationInsert = {
  id: string
  assistantId: string
  title: string
  nodes: string
  createAt: number
  updateAt: number
  truncateIndex: number
  suggestions: string
  isPinned: number
}

export type RikkahubMessageNodeInsert = {
  id: string
  conversationId: string
  nodeIndex: number
  messages: string
  selectIndex: number
}

export type RikkahubExportPayload = {
  settings: Record<string, unknown>
  conversations: RikkahubConversationInsert[]
  nodes: RikkahubMessageNodeInsert[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(value)
  )
}

function toDeterministicUuid(seed: string): string {
  const hex = createHash('sha256').update(seed).digest('hex').slice(0, 32).split('')

  hex[12] = '4'
  const nibble = parseInt(hex[16], 16)
  hex[16] = ((nibble & 0x3) | 0x8).toString(16)

  const h = hex.join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

class StableUuidRegistry {
  private readonly cache = new Map<string, string>()

  get(kind: string, source: string): string {
    const key = `${kind}:${source}`
    const existed = this.cache.get(key)
    if (existed) {
      return existed
    }

    const normalized = isUuid(source) ? source.toLowerCase() : toDeterministicUuid(key)
    this.cache.set(key, normalized)
    return normalized
  }
}

/**
 * Convert ISO/epoch-like input to Kotlin LocalDateTime text expected by UI payload.
 */
function toKotlinLocalDateTime(input: unknown, fallbackMillis: number): string {
  const millis = toEpochMillis(input) ?? fallbackMillis
  return new Date(millis).toISOString().replace(/Z$/, '')
}

function toIsoInstant(input: unknown, fallbackMillis: number): string {
  const millis = toEpochMillis(input) ?? fallbackMillis
  return new Date(millis).toISOString()
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function toNonNegativeInt(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined
  }

  return Math.max(0, Math.round(value))
}

function mapCoreModelTypeToRikkahub(value: unknown): 'CHAT' | 'IMAGE' | 'EMBEDDING' {
  if (typeof value !== 'string') {
    return 'CHAT'
  }

  const lowered = value.toLowerCase()
  if (lowered.includes('image') || lowered.includes('vision')) {
    return 'IMAGE'
  }

  if (lowered.includes('embed')) {
    return 'EMBEDDING'
  }

  return 'CHAT'
}

function mapCoreProviderTypeToRikkahub(value: unknown): 'openai' | 'google' | 'claude' {
  if (value === 'gemini') {
    return 'google'
  }

  if (value === 'anthropic') {
    return 'claude'
  }

  return 'openai'
}

function ensureArray<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : []
}

function normalizeConversationSuggestions(conversation: CoreConversation): string[] {
  const extensions = isRecord(conversation.extensions) ? conversation.extensions : undefined
  const suggestions = extensions?.suggestions

  if (!Array.isArray(suggestions)) {
    return []
  }

  return suggestions.filter((item): item is string => typeof item === 'string')
}

function normalizeConversationTruncateIndex(conversation: CoreConversation): number {
  const extensions = isRecord(conversation.extensions) ? conversation.extensions : undefined
  const value = extensions?.truncateIndex
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value)
  }

  return -1
}

function mapCorePartToRikkahubSimplePart(
  part: Exclude<CorePart, { type: 'tool_call' } | { type: 'tool_result' }>,
  baseMillis: number
): Record<string, unknown>[] {
  switch (part.type) {
    case 'text':
      return [{ type: 'text', text: part.text }]
    case 'reasoning':
      return [
        {
          type: 'reasoning',
          reasoning: part.text,
          createdAt: new Date(baseMillis).toISOString(),
          finishedAt: new Date(baseMillis).toISOString(),
        },
      ]
    case 'image':
      return [{ type: 'image', url: part.uri }]
    case 'video':
      return [{ type: 'video', url: part.uri }]
    case 'audio':
      return [{ type: 'audio', url: part.uri }]
    case 'file':
      return [
        {
          type: 'document',
          url: part.uri,
          fileName: part.name ?? path.basename(part.uri) ?? 'file',
          mime: part.mime ?? 'application/octet-stream',
        },
      ]
    case 'citation':
      return [{ type: 'text', text: safeJsonStringify(part.data) }]
    case 'unknown':
      return [{ type: 'text', text: safeJsonStringify(part.raw) }]
    default:
      return [{ type: 'text', text: safeJsonStringify(part) }]
  }
}

function mapToolResultToOutputParts(result: unknown, baseMillis: number): Record<string, unknown>[] {
  if (Array.isArray(result)) {
    const output: Record<string, unknown>[] = []

    for (const item of result) {
      if (isRecord(item) && typeof item.type === 'string') {
        if (item.type === 'tool_call' || item.type === 'tool_result') {
          output.push({ type: 'text', text: safeJsonStringify(item) })
          continue
        }

        output.push(
          ...mapCorePartToRikkahubSimplePart(
            item as Exclude<CorePart, { type: 'tool_call' } | { type: 'tool_result' }>,
            baseMillis
          )
        )
      } else {
        output.push({ type: 'text', text: safeJsonStringify(item) })
      }
    }

    return output
  }

  if (typeof result === 'string') {
    return [{ type: 'text', text: result }]
  }

  if (result === undefined || result === null) {
    return []
  }

  return [{ type: 'text', text: safeJsonStringify(result) }]
}

function mapCorePartsToRikkahubParts(parts: CorePart[], baseMillis: number): Record<string, unknown>[] {
  const output: Record<string, unknown>[] = []
  const consumedToolResults = new Set<number>()

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index]

    if (part.type === 'tool_result' && consumedToolResults.has(index)) {
      continue
    }

    if (part.type === 'tool_call') {
      let pairedIndex = -1
      let pairedResult: Extract<CorePart, { type: 'tool_result' }> | undefined

      for (let next = index + 1; next < parts.length; next += 1) {
        const candidate = parts[next]
        if (candidate.type !== 'tool_result' || consumedToolResults.has(next)) {
          continue
        }

        const callMatched =
          part.callId !== undefined && candidate.callId !== undefined ? part.callId === candidate.callId : false
        const nameMatched = part.toolName === candidate.toolName

        if (callMatched || nameMatched) {
          pairedIndex = next
          pairedResult = candidate
          break
        }
      }

      if (pairedIndex >= 0) {
        consumedToolResults.add(pairedIndex)
      }

      output.push({
        type: 'tool',
        toolCallId: part.callId ?? toDeterministicUuid(`tool:${index}:${part.toolName}`),
        toolName: part.toolName,
        input: safeJsonStringify(part.args ?? {}),
        output: mapToolResultToOutputParts(pairedResult?.result, baseMillis),
        approvalState: { type: 'auto' },
      })
      continue
    }

    if (part.type === 'tool_result') {
      output.push({
        type: 'tool',
        toolCallId: part.callId ?? toDeterministicUuid(`tool-result:${index}:${part.toolName}`),
        toolName: part.toolName,
        input: '{}',
        output: mapToolResultToOutputParts(part.result, baseMillis),
        approvalState: { type: 'auto' },
      })
      continue
    }

    output.push(
      ...mapCorePartToRikkahubSimplePart(
        part as Exclude<CorePart, { type: 'tool_call' } | { type: 'tool_result' }>,
        baseMillis
      )
    )
  }

  return output.length > 0 ? output : [{ type: 'text', text: '' }]
}

function mapCoreAnnotationsToRikkahub(annotations: unknown[] | undefined): Record<string, unknown>[] {
  if (!Array.isArray(annotations)) {
    return []
  }

  const output: Record<string, unknown>[] = []

  for (const annotation of annotations) {
    if (!isRecord(annotation)) {
      continue
    }

    const url = typeof annotation.url === 'string' ? annotation.url : undefined
    const title = typeof annotation.title === 'string' ? annotation.title : undefined

    if (url && title) {
      output.push({
        type: 'url_citation',
        url,
        title,
      })
    }
  }

  return output
}

function mapCoreRoleToRikkahub(value: CoreMessage['role']): 'system' | 'user' | 'assistant' | 'tool' {
  if (value === 'system' || value === 'user' || value === 'assistant' || value === 'tool') {
    return value
  }

  return 'assistant'
}

type MessageModelRegistry = {
  providerModelToUuid: Map<string, string>
  anyModelToUuid: Map<string, string>
}

function providerModelKey(providerSourceId: string, modelSourceId: string): string {
  return `${providerSourceId}::${modelSourceId}`
}

function buildMessageModelRefs(bundle: CoreBundle): Map<string, Set<string>> {
  const refs = new Map<string, Set<string>>()

  for (const conversation of bundle.conversations) {
    for (const message of conversation.messages) {
      const model = message.model
      const providerId = typeof model?.providerId === 'string' ? model.providerId : undefined
      const modelId = typeof model?.modelId === 'string' ? model.modelId : undefined

      if (!providerId || !modelId) {
        continue
      }

      const set = refs.get(providerId) ?? new Set<string>()
      set.add(modelId)
      refs.set(providerId, set)
    }
  }

  return refs
}

function resolveMessageModelUuid(
  message: CoreMessage,
  registry: StableUuidRegistry,
  modelRegistry: MessageModelRegistry
): string | undefined {
  const model = message.model
  if (!model) {
    return undefined
  }

  const providerId = typeof model.providerId === 'string' ? model.providerId : undefined
  const modelId = typeof model.modelId === 'string' ? model.modelId : undefined

  if (!modelId) {
    return undefined
  }

  if (providerId) {
    const exactKey = providerModelKey(providerId, modelId)
    const exact = modelRegistry.providerModelToUuid.get(exactKey)
    if (exact) {
      return exact
    }
  }

  const byModelOnly = modelRegistry.anyModelToUuid.get(modelId)
  if (byModelOnly) {
    return byModelOnly
  }

  return registry.get('model-fallback', `${providerId ?? 'unknown'}:${modelId}`)
}

function buildSettingsProviderFromCore(
  provider: CoreProvider,
  providerUuid: string,
  modelRefsFromMessages: Set<string>,
  includeSecrets: boolean,
  preservePrivateState: boolean,
  registry: StableUuidRegistry,
  modelRegistry: MessageModelRegistry
): Record<string, unknown> {
  const providerSourceId = provider.id
  const providerType = mapCoreProviderTypeToRikkahub(provider.type)

  const explicitModels = [...ensureArray(provider.models)]
  const existingModelIds = new Set(explicitModels.map((model) => model.id))

  for (const ref of modelRefsFromMessages) {
    if (!existingModelIds.has(ref)) {
      explicitModels.push({
        id: ref,
        name: ref,
        type: 'chat',
      })
    }
  }

  const models = explicitModels.map((model) => {
    const modelSourceId = model.id
    const modelUuid = registry.get('model', `${providerSourceId}:${modelSourceId}`)

    modelRegistry.providerModelToUuid.set(providerModelKey(providerSourceId, modelSourceId), modelUuid)
    if (!modelRegistry.anyModelToUuid.has(modelSourceId)) {
      modelRegistry.anyModelToUuid.set(modelSourceId, modelUuid)
    }

    return {
      id: modelUuid,
      modelId: modelSourceId,
      displayName: model.name ?? modelSourceId,
      type: mapCoreModelTypeToRikkahub(model.type),
      inputModalities: ['TEXT'],
      outputModalities: ['TEXT'],
      abilities: [],
      tools: [],
    }
  })

  const base = {
    id: providerUuid,
    enabled: provider.enabled ?? true,
    name: provider.name ?? providerSourceId,
    models,
  }

  if (providerType === 'google') {
    const providerBase = {
      type: 'google',
      ...base,
      apiKey: includeSecrets ? provider.apiKey ?? '' : '',
      baseUrl: provider.endpoint ?? 'https://generativelanguage.googleapis.com/v1beta',
      vertexAI: false,
      privateKey: '',
      serviceAccountEmail: '',
      location: 'us-central1',
      projectId: '',
    }
    return mergeWithPlatformPassthrough(providerBase, provider.extensions, 'rikkahub', preservePrivateState)
  }

  if (providerType === 'claude') {
    const providerBase = {
      type: 'claude',
      ...base,
      apiKey: includeSecrets ? provider.apiKey ?? '' : '',
      baseUrl: provider.endpoint ?? 'https://api.anthropic.com/v1',
      promptCaching: false,
    }
    return mergeWithPlatformPassthrough(providerBase, provider.extensions, 'rikkahub', preservePrivateState)
  }

  const providerBase = {
    type: 'openai',
    ...base,
    apiKey: includeSecrets ? provider.apiKey ?? '' : '',
    baseUrl: provider.endpoint ?? 'https://api.openai.com/v1',
    chatCompletionsPath: '/chat/completions',
    useResponseApi: false,
  }
  return mergeWithPlatformPassthrough(providerBase, provider.extensions, 'rikkahub', preservePrivateState)
}

function pickPrimaryModelId(settingsProviders: Record<string, unknown>[]): string {
  for (const provider of settingsProviders) {
    if (!isRecord(provider)) {
      continue
    }

    const models = Array.isArray(provider.models) ? provider.models : []
    const first = models[0]
    if (isRecord(first) && typeof first.id === 'string') {
      return first.id
    }
  }

  return DEFAULT_AUTO_MODEL_ID
}

function buildSettingsAssistants(
  assistantSourceIds: string[],
  assistantUuidBySourceId: Map<string, string>,
  primaryModelId: string
): Record<string, unknown>[] {
  return assistantSourceIds.map((sourceId, index) => {
    const id = assistantUuidBySourceId.get(sourceId) ?? DEFAULT_ASSISTANT_ID
    const fallbackName = sourceId === 'default' ? 'Default Assistant' : sourceId

    return {
      id,
      name: fallbackName,
      systemPrompt: '',
      chatModelId: primaryModelId,
      tags: [],
      contextMessageSize: 0,
      streamOutput: true,
    }
  })
}

function buildMessageNodeVariants(
  conversation: CoreConversation,
  message: CoreMessage,
  index: number
): {
  nodeIdSeed: string
  variants: CoreMessage[]
  selectedIndex: number
} {
  // Prefer Phase 3 canonical branchPoints and preserve native mode semantics.
  // - slot: one node, multiple candidate messages
  // - tail: anchor + tail variants (mapped to current index slot)
  const branchPoints = ensureArray(conversation.branchPoints)
  const previousMessageId = index > 0 ? conversation.messages[index - 1]?.id : undefined

  let branchPoint = branchPoints.find((point) => {
    if (!Array.isArray(point.variants) || point.variants.length === 0) {
      return false
    }

    if (point.mode === 'slot') {
      return point.variants.some((variant) =>
        Array.isArray(variant.messages) ? variant.messages.some((variantMessage) => variantMessage.id === message.id) : false
      )
    }

    const anchorMessageId = point.anchorMessageId
    if (!anchorMessageId) {
      return false
    }

    const anchorIndex = conversation.messages.findIndex((candidate) => candidate.id === anchorMessageId)
    if (anchorIndex < 0 || index <= anchorIndex) {
      return false
    }

    const relative = index - anchorIndex - 1
    return point.variants.some((variant) =>
      Array.isArray(variant.messages) && variant.messages[relative]?.id === message.id
    )
  })

  if (!branchPoint) {
    branchPoint = branchPoints.find((point) => {
      if (point.mode === 'slot' && point.anchorMessageId && previousMessageId) {
        return point.anchorMessageId === previousMessageId
      }
      return false
    })
  }

  if (branchPoint) {
    const variantsFromPoint: CoreMessage[] = []
    if (branchPoint.mode === 'slot') {
      for (const variant of ensureArray(branchPoint.variants)) {
        const first = ensureArray(variant.messages)[0]
        if (first) {
          variantsFromPoint.push(first)
        }
      }
    } else {
      const anchorIndex = branchPoint.anchorMessageId
        ? conversation.messages.findIndex((candidate) => candidate.id === branchPoint.anchorMessageId)
        : -1
      const relative = anchorIndex >= 0 ? index - anchorIndex - 1 : index
      for (const variant of ensureArray(branchPoint.variants)) {
        const item = ensureArray(variant.messages)[relative]
        if (item) {
          variantsFromPoint.push(item)
        }
      }
    }

    if (variantsFromPoint.length > 0) {
      const deduped: CoreMessage[] = []
      const seen = new Set<string>()
      for (const variantMessage of variantsFromPoint) {
        if (seen.has(variantMessage.id)) {
          continue
        }
        seen.add(variantMessage.id)
        deduped.push(variantMessage)
      }
      if (!seen.has(message.id)) {
        deduped.push(message)
      }

      const selectedById = deduped.findIndex((item) => item.id === message.id)
      const selectedIndex = Math.min(
        Math.max(
          typeof branchPoint.selectedVariantIndex === 'number'
            ? Math.trunc(branchPoint.selectedVariantIndex)
            : selectedById,
          0
        ),
        Math.max(deduped.length - 1, 0)
      )

      return {
        nodeIdSeed: branchPoint.id || message.id,
        variants: deduped,
        selectedIndex,
      }
    }
  }

  const branches = ensureArray(conversation.branches)

  let branch = branches.find((item) => item.variants.some((variant) => variant.id === message.id))
  if (!branch && index < branches.length) {
    branch = branches[index]
  }

  if (!branch) {
    return {
      nodeIdSeed: message.id,
      variants: [message],
      selectedIndex: 0,
    }
  }

  const variants = ensureArray(branch.variants)
  const deduped: CoreMessage[] = []
  const seen = new Set<string>()

  for (const variant of variants) {
    if (seen.has(variant.id)) {
      continue
    }
    seen.add(variant.id)
    deduped.push(variant)
  }

  if (!seen.has(message.id)) {
    deduped.push(message)
  }

  const messageIndex = deduped.findIndex((variant) => variant.id === message.id)
  const selectedIndexRaw = typeof branch.selectedIndex === 'number' ? Math.trunc(branch.selectedIndex) : messageIndex
  const selectedIndex = Math.min(Math.max(selectedIndexRaw, 0), Math.max(deduped.length - 1, 0))

  return {
    nodeIdSeed: branch.nodeId,
    variants: deduped,
    selectedIndex,
  }
}

/**
 * Map one Core message to the JSON payload Rikkahub stores in `message_node.messages`.
 */
function mapCoreMessageToRikkahub(
  message: CoreMessage,
  fallbackMillis: number,
  registry: StableUuidRegistry,
  modelRegistry: MessageModelRegistry
): Record<string, unknown> {
  const createdAtLocal = toKotlinLocalDateTime(message.createdAt, fallbackMillis)
  const finishedAtLocal = message.finishedAt ? toKotlinLocalDateTime(message.finishedAt, fallbackMillis) : undefined

  const usage = message.usage
    ? {
        promptTokens: toNonNegativeInt(message.usage.promptTokens) ?? 0,
        completionTokens: toNonNegativeInt(message.usage.completionTokens) ?? 0,
        cachedTokens: toNonNegativeInt(message.usage.cachedTokens) ?? 0,
        totalTokens:
          toNonNegativeInt(message.usage.totalTokens) ??
          (toNonNegativeInt(message.usage.promptTokens) ?? 0) +
            (toNonNegativeInt(message.usage.completionTokens) ?? 0),
      }
    : undefined

  const annotations = mapCoreAnnotationsToRikkahub(message.annotations)
  const parts = mapCorePartsToRikkahubParts(message.parts, fallbackMillis)

  return {
    id: registry.get('message', message.id),
    role: mapCoreRoleToRikkahub(message.role),
    parts,
    annotations,
    createdAt: createdAtLocal,
    finishedAt: finishedAtLocal,
    modelId: resolveMessageModelUuid(message, registry, modelRegistry),
    usage,
    translation:
      isRecord(message.extensions) && typeof message.extensions.translation === 'string'
        ? message.extensions.translation
        : undefined,
  }
}

/**
 * Legacy convenience wrapper preserving private state by default.
 */
export function buildRikkahubExportPayload(bundle: CoreBundle, includeSecrets: boolean): RikkahubExportPayload {
  return buildRikkahubExportPayloadWithOptions(bundle, includeSecrets, true)
}

/**
 * Build settings rows + conversation rows + message node rows for SQLite writer.
 *
 * KISS policy:
 * - Produce deterministic rows from Core.
 * - Reapply Rikkahub passthrough when enabled.
 * - Keep branch mapping local to `buildMessageNodeVariants`.
 */
export function buildRikkahubExportPayloadWithOptions(
  bundle: CoreBundle,
  includeSecrets: boolean,
  preservePrivateState: boolean
): RikkahubExportPayload {
  const registry = new StableUuidRegistry()

  const assistantSourceIds: string[] = []
  const assistantSourceSeen = new Set<string>()

  const pushAssistant = (sourceId: string) => {
    if (assistantSourceSeen.has(sourceId)) {
      return
    }
    assistantSourceSeen.add(sourceId)
    assistantSourceIds.push(sourceId)
  }

  for (const conversation of bundle.conversations) {
    const assistantSourceId =
      typeof conversation.assistantId === 'string' && conversation.assistantId.trim().length > 0
        ? conversation.assistantId
        : 'default'
    pushAssistant(assistantSourceId)
  }

  if (assistantSourceIds.length === 0) {
    pushAssistant('default')
  }

  const assistantUuidBySourceId = new Map<string, string>()
  for (const sourceId of assistantSourceIds) {
    const uuid = sourceId === 'default' ? DEFAULT_ASSISTANT_ID : registry.get('assistant', sourceId)
    assistantUuidBySourceId.set(sourceId, uuid)
  }

  const modelRefsFromMessages = buildMessageModelRefs(bundle)

  const settingsProviders: Record<string, unknown>[] = []
  const providerSourceIds = new Set<string>()
  const modelRegistry: MessageModelRegistry = {
    providerModelToUuid: new Map<string, string>(),
    anyModelToUuid: new Map<string, string>(),
  }

  for (const provider of bundle.providers) {
    providerSourceIds.add(provider.id)
    const providerUuid = registry.get('provider', provider.id)
    const messageRefs = modelRefsFromMessages.get(provider.id) ?? new Set<string>()
    settingsProviders.push(
      buildSettingsProviderFromCore(
        provider,
        providerUuid,
        messageRefs,
        includeSecrets,
        preservePrivateState,
        registry,
        modelRegistry
      )
    )
  }

  for (const [providerSourceId, modelIds] of modelRefsFromMessages.entries()) {
    if (providerSourceIds.has(providerSourceId)) {
      continue
    }

    const syntheticProvider: CoreProvider = {
      id: providerSourceId,
      type: 'compatible',
      name: providerSourceId,
      enabled: true,
      models: Array.from(modelIds).map((modelId) => ({
        id: modelId,
        name: modelId,
        type: 'chat',
      })),
    }

    const providerUuid = registry.get('provider', providerSourceId)
    settingsProviders.push(
      buildSettingsProviderFromCore(
        syntheticProvider,
        providerUuid,
        modelIds,
        includeSecrets,
        preservePrivateState,
        registry,
        modelRegistry
      )
    )
  }

  const primaryModelId = pickPrimaryModelId(settingsProviders)
  const assistants = buildSettingsAssistants(assistantSourceIds, assistantUuidBySourceId, primaryModelId)
  const primaryAssistantId = (assistants[0]?.id as string | undefined) ?? DEFAULT_ASSISTANT_ID

  const settingsBase: Record<string, unknown> = {
    assistantId: primaryAssistantId,
    chatModelId: primaryModelId,
    titleModelId: primaryModelId,
    imageGenerationModelId: primaryModelId,
    translateModeId: primaryModelId,
    suggestionModelId: primaryModelId,
    ocrModelId: primaryModelId,
    compressModelId: primaryModelId,
    providers: settingsProviders,
    assistants,
    assistantTags: [],
    favoriteModels: [],
    searchServices: [{ type: 'bing_local', id: registry.get('search-service', 'bing_local') }],
    searchCommonOptions: { resultSize: 10 },
    searchServiceSelected: 0,
    mcpServers: [],
    modeInjections: [],
    lorebooks: [],
  }
  // Merge Rikkahub platform-private bundle state on top of deterministic base.
  const mergedSettings = mergeWithPlatformPassthrough(
      settingsBase,
      bundle.extensions,
      'rikkahub',
      preservePrivateState
  )
  const settings = preservePrivateState
    ? attachTransportExtensions(mergedSettings, bundle.extensions)
    : mergedSettings

  const conversationRows: RikkahubConversationInsert[] = []
  const nodeRows: RikkahubMessageNodeInsert[] = []

  const now = Date.now()

  for (const conversation of bundle.conversations) {
    const conversationId = registry.get('conversation', conversation.id)
    const assistantSourceId =
      typeof conversation.assistantId === 'string' && conversation.assistantId.trim().length > 0
        ? conversation.assistantId
        : 'default'
    const assistantId = assistantUuidBySourceId.get(assistantSourceId) ?? DEFAULT_ASSISTANT_ID

    const createdAt = toEpochMillis(conversation.createdAt) ?? now
    const updatedAt =
      toEpochMillis(conversation.updatedAt) ??
      (() => {
        const candidates = conversation.messages
          .map((item) => toEpochMillis(item.finishedAt ?? item.createdAt))
          .filter((value): value is number => typeof value === 'number')

        if (candidates.length === 0) {
          return createdAt
        }

        return Math.max(createdAt, ...candidates)
      })()

    conversationRows.push({
      id: conversationId,
      assistantId,
      title: conversation.title || `Conversation ${conversation.id}`,
      nodes: '[]',
      createAt: createdAt,
      updateAt: updatedAt,
      truncateIndex: normalizeConversationTruncateIndex(conversation),
      suggestions: JSON.stringify(normalizeConversationSuggestions(conversation)),
      isPinned: conversation.pinned ? 1 : 0,
    })

    for (let nodeIndex = 0; nodeIndex < conversation.messages.length; nodeIndex += 1) {
      const message = conversation.messages[nodeIndex]
      const { nodeIdSeed, variants, selectedIndex } = buildMessageNodeVariants(conversation, message, nodeIndex)
      const fallbackMillis = toEpochMillis(message.createdAt) ?? createdAt

      const uiMessages = variants.map((variant) =>
        mapCoreMessageToRikkahub(variant, fallbackMillis, registry, modelRegistry)
      )

      const nodeId = registry.get('message-node', `${conversation.id}:${nodeIdSeed}:${nodeIndex}`)

      nodeRows.push({
        id: nodeId,
        conversationId,
        nodeIndex,
        messages: JSON.stringify(uiMessages),
        selectIndex: Math.min(Math.max(selectedIndex, 0), Math.max(uiMessages.length - 1, 0)),
      })
    }
  }

  return {
    settings,
    conversations: conversationRows,
    nodes: nodeRows,
  }
}
