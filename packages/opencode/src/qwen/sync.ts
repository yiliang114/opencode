import { ModelID, ProviderID } from "@/provider/schema"
import { Session } from "@/session"
import type { MessageV2 } from "@/session/message-v2"
import { MessageID, PartID, type SessionID } from "@/session/schema"
import { linkedQwen } from "./map"
import { QWEN_PROVIDER, qwenDefaultModel, qwenProvider } from "./meta"
import { qwenChatPath, qwenSessionID } from "./session"

type QwenCall = {
  id?: string
  name: string
  args?: Record<string, unknown>
}

type QwenReply = {
  id?: string
  name: string
  response?: Record<string, unknown>
}

type QwenPart = {
  text?: string
  thought?: boolean
  functionCall?: QwenCall
  functionResponse?: QwenReply
}

export type QwenItem = {
  uuid: string
  parentUuid?: string | null
  sessionId?: string
  timestamp: string
  type: "user" | "assistant" | "tool_result" | "system"
  subtype?: string
  cwd?: string
  version?: string
  model?: string
  usageMetadata?: Record<string, unknown>
  message?: {
    role?: string
    parts?: QwenPart[]
  }
}

type SyncRole = {
  role: "user" | "assistant"
}

type Tool = {
  callID: string
  tool: string
  input: Record<string, unknown>
  output?: string
  error?: string
}

export function qwenChatFile(input: {
  dir: string
  id: string
  home?: string
}) {
  return qwenChatPath({
    dir: input.dir,
    id: qwenSessionID(input.id),
    home: input.home,
  })
}

function qwenText(item: QwenItem) {
  return (item.message?.parts ?? []).flatMap((part) => {
    if (!part.text) return []
    if (part.thought) return []
    return [part.text]
  })
}

function qwenThought(item: QwenItem) {
  return (item.message?.parts ?? []).flatMap((part) => {
    if (!part.text || !part.thought) return []
    return [part.text]
  })
}

function qwenCallID(part: QwenCall, idx: number) {
  return part.id ?? `${part.name}:${idx}`
}

function qwenOutput(value: unknown) {
  if (typeof value === "string") return value
  if (value === undefined) return ""
  return JSON.stringify(value)
}

export function qwenAssistantState(input: {
  item: QwenItem
  tools: QwenItem[]
}) {
  const list = (input.item.message?.parts ?? []).flatMap((part, idx) => {
    if (!part.functionCall) return []
    return [
      {
        callID: qwenCallID(part.functionCall, idx),
        tool: part.functionCall.name,
        input: part.functionCall.args ?? {},
      },
    ]
  })
  const out = input.tools.flatMap((item) =>
    (item.message?.parts ?? []).flatMap((part) => {
      const reply = part.functionResponse
      if (!reply) return []
      return [
        {
          callID: reply.id,
          tool: reply.name,
          output: qwenOutput(reply.response?.output ?? reply.response?.result ?? reply.response),
          error:
            typeof reply.response?.error === "string"
              ? reply.response.error
              : typeof reply.response?.message === "string"
                ? reply.response.message
                : undefined,
        },
      ]
    }),
  )
  const used = new Set<number>()
  const tools = list.flatMap((item) => {
    const found = out.findIndex((next, idx) => {
      if (used.has(idx)) return false
      if (next.callID && next.callID === item.callID) return true
      return next.tool === item.tool
    })
    if (found === -1) return []
    used.add(found)
    const next = out[found]
    return [
      {
        ...item,
        ...(next.error ? { error: next.error } : { output: next.output ?? "" }),
      },
    ]
  })
  return {
    text: qwenText(input.item),
    reasoning: qwenThought(input.item),
    tools,
  }
}

function qwenVisible(items: QwenItem[]) {
  return items.filter((item) => item.type === "user" || item.type === "assistant")
}

function qwenStart(input: {
  items: QwenItem[]
  existing: SyncRole[]
}) {
  const visible = qwenVisible(input.items)
  const limit = Math.min(visible.length, input.existing.length)
  let idx = 0
  while (idx < limit) {
    if (visible[idx].type !== input.existing[idx].role) break
    idx += 1
  }
  return idx
}

export function qwenTail(input: {
  items: QwenItem[]
  existing: SyncRole[]
}) {
  return qwenVisible(input.items).slice(qwenStart(input))
}

function qwenTime(value: string | undefined) {
  const time = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(time) ? time : Date.now()
}

function qwenUsage(input: Record<string, unknown> | undefined) {
  const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0)
  return {
    total: num(input?.totalTokenCount),
    input: num(input?.promptTokenCount),
    output: num(input?.candidatesTokenCount),
    reasoning: num(input?.thoughtsTokenCount),
    cache: {
      read: num(input?.cachedContentTokenCount),
      write: 0,
    },
  }
}

function qwenModel(input: {
  dir: string
  last?: MessageV2.User
  model?: string
}) {
  if (input.model) return ModelID.make(input.model)
  if (input.last) return input.last.model.modelID
  return qwenDefaultModel(qwenProvider({ dir: input.dir }), { dir: input.dir })
}

function qwenBase(input: {
  session: Session.Info
  last?: MessageV2.User
}) {
  return {
    agent: input.last?.agent ?? "default",
    variant: input.last?.variant,
    model: {
      providerID: ProviderID.make(QWEN_PROVIDER),
      modelID: input.last?.model.modelID ?? qwenDefaultModel(qwenProvider({ dir: input.session.directory }), { dir: input.session.directory }),
    },
  }
}

function qwenTag(uuid: string) {
  return {
    qwen_uuid: uuid,
    qwen_sync: "terminal",
  }
}

function qwenMerge(records: QwenItem[]) {
  const base = { ...records[0] }
  for (let idx = 1; idx < records.length; idx += 1) {
    const item = records[idx]
    if (item.message?.parts?.length) {
      base.message = {
        role: base.message?.role ?? item.message.role,
        parts: [...(base.message?.parts ?? []), ...item.message.parts],
      }
    }
    if (item.usageMetadata) base.usageMetadata = item.usageMetadata
    if (item.model && !base.model) base.model = item.model
    if (item.timestamp > base.timestamp) base.timestamp = item.timestamp
  }
  return base
}

function qwenChain(items: QwenItem[]) {
  if (!items.length) return []
  const rows = new Map<string, QwenItem[]>()
  for (const item of items) {
    const list = rows.get(item.uuid) ?? []
    list.push(item)
    rows.set(item.uuid, list)
  }
  const chain: string[] = []
  const seen = new Set<string>()
  let cur: string | null | undefined = items.at(-1)?.uuid
  while (cur && !seen.has(cur)) {
    seen.add(cur)
    chain.push(cur)
    cur = rows.get(cur)?.[0]?.parentUuid
  }
  chain.reverse()
  return chain.flatMap((uuid) => {
    const list = rows.get(uuid)
    if (!list?.length) return []
    return [qwenMerge(list)]
  })
}

export async function qwenItems(input: {
  dir: string
  id: string
  home?: string
  raw?: boolean
}) {
  const file = Bun.file(
    input.raw
      ? qwenChatPath({
          dir: input.dir,
          id: input.id,
          home: input.home,
        })
      : qwenChatFile(input),
  )
  if (!(await file.exists())) return []
  const text = await file.text()
  const rows = text
    .split("\n")
    .map((line) => line.trim())
    .flatMap((line) => {
      if (!line) return []
      try {
        return [JSON.parse(line) as QwenItem]
      } catch {
        return []
      }
    })
  return qwenChain(rows)
}

async function qwenUser(input: {
  session: Session.Info
  item: QwenItem
  last?: MessageV2.User
}) {
  const base = qwenBase(input)
  const info = await Session.updateMessage({
    id: MessageID.ascending(),
    sessionID: input.session.id,
    role: "user",
    time: {
      created: qwenTime(input.item.timestamp),
    },
    agent: base.agent,
    model: base.model,
    variant: base.variant,
  })
  for (const text of qwenText(input.item)) {
    await Session.updatePart({
      id: PartID.ascending(),
      sessionID: info.sessionID,
      messageID: info.id,
      type: "text",
      text,
      metadata: qwenTag(input.item.uuid),
    })
  }
  return info as MessageV2.User
}

async function qwenAssistant(input: {
  session: Session.Info
  item: QwenItem
  tools: QwenItem[]
  user: MessageV2.User
  last?: MessageV2.User
}) {
  const time = qwenTime(input.item.timestamp)
  const tokens = qwenUsage(input.item.usageMetadata)
  const info = await Session.updateMessage({
    id: MessageID.ascending(),
    sessionID: input.session.id,
    parentID: input.user.id,
    role: "assistant",
    time: {
      created: time,
      completed: time,
    },
    mode: input.last?.agent ?? "default",
    agent: input.last?.agent ?? "default",
    variant: input.last?.variant,
    modelID: qwenModel({
      dir: input.session.directory,
      last: input.last,
      model: input.item.model,
    }),
    providerID: ProviderID.make(QWEN_PROVIDER),
    path: {
      cwd: input.session.directory,
      root: input.session.directory,
    },
    cost: 0,
    tokens,
    finish: "stop",
  })
  await Session.updatePart({
    id: PartID.ascending(),
    sessionID: info.sessionID,
    messageID: info.id,
    type: "step-start",
  })
  const next = qwenAssistantState(input)
  for (const text of next.reasoning) {
    await Session.updatePart({
      id: PartID.ascending(),
      sessionID: info.sessionID,
      messageID: info.id,
      type: "reasoning",
      text,
      time: {
        start: time,
        end: time,
      },
      metadata: qwenTag(input.item.uuid),
    })
  }
  for (const text of next.text) {
    await Session.updatePart({
      id: PartID.ascending(),
      sessionID: info.sessionID,
      messageID: info.id,
      type: "text",
      text,
      time: {
        start: time,
        end: time,
      },
      metadata: qwenTag(input.item.uuid),
    })
  }
  for (const tool of next.tools) {
    await Session.updatePart({
      id: PartID.ascending(),
      sessionID: info.sessionID,
      messageID: info.id,
      type: "tool",
      callID: tool.callID,
      tool: tool.tool,
      metadata: qwenTag(input.item.uuid),
      state: "error" in tool
        ? {
            status: "error",
            input: tool.input,
            error: tool.error,
            time: {
              start: time,
              end: time,
            },
          }
        : {
            status: "completed",
            input: tool.input,
            output: tool.output ?? "",
            title: tool.tool,
            metadata: {},
            time: {
              start: time,
              end: time,
            },
          },
    })
  }
  await Session.updatePart({
    id: PartID.ascending(),
    sessionID: info.sessionID,
    messageID: info.id,
    type: "step-finish",
    reason: "stop",
    cost: 0,
    tokens,
  })
  return info as MessageV2.Assistant
}

export namespace QwenSync {
  export async function run(input: SessionID | { sessionID: SessionID; qwen?: string }) {
    const sessionID = typeof input === "string" ? input : input.sessionID
    const session = await Session.get(sessionID)
    const linked = typeof input === "string" ? await linkedQwen(sessionID) : undefined
    const id = typeof input === "string" ? (linked?.qwen ?? session.id) : (input.qwen ?? session.id)
    const items = await qwenItems({
      dir: session.directory,
      id,
      raw: typeof input === "string" ? !!linked?.qwen : !!input.qwen,
    })
    if (!items.length) {
      return {
        imported: 0,
        total: 0,
      }
    }

    const msgs = await Session.messages({ sessionID })
    const existing = msgs.flatMap((item) => {
      if (item.info.role !== "user" && item.info.role !== "assistant") return []
      return [{ role: item.info.role } as const]
    })
    const start = qwenStart({ items, existing })
    const total = qwenVisible(items).length
    if (start >= total) {
      return {
        imported: 0,
        total,
      }
    }

    let imported = 0
    let seen = 0
    let last = msgs
      .map((item) => item.info)
      .filter((item): item is MessageV2.User => item.role === "user")
      .at(-1)

    for (let idx = 0; idx < items.length; idx += 1) {
      const item = items[idx]
      const visible = item.type === "user" || item.type === "assistant"
      if (visible) {
        if (seen < start) {
          seen += 1
          continue
        }
        seen += 1
      }

      if (item.type === "user") {
        last = await qwenUser({
          session,
          item,
          last,
        })
        imported += 1
        continue
      }

      if (item.type !== "assistant" || !last) continue

      const tools: QwenItem[] = []
      let end = idx + 1
      while (end < items.length && items[end].type !== "user" && items[end].type !== "assistant") {
        if (items[end].type === "tool_result") tools.push(items[end])
        end += 1
      }
      await qwenAssistant({
        session,
        item,
        tools,
        user: last,
        last,
      })
      imported += 1
      idx = end - 1
    }

    if (imported) await Session.touch(sessionID)
    return {
      imported,
      total,
    }
  }
}
