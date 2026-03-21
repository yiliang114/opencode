import type { Session } from "@opencode-ai/sdk/v2/client"
import type { QwenSession } from "@/pages/session/qwen-route"

export type QwenRow =
  | {
      kind: "session"
      key: string
      updated: number
      session: Session
      qwen?: QwenSession
    }
  | {
      kind: "qwen"
      key: string
      updated: number
      qwen: QwenSession
    }

export function mergeQwen(input: {
  qwen: QwenSession[]
  sessions: Session[]
}): QwenRow[] {
  const ids = new Set<string>()
  const qwen = new Map(input.qwen.flatMap((item) => (item.sessionID ? [[item.sessionID, item] as const] : [])))
  const all: QwenRow[] = input.sessions.map((session) => {
    ids.add(session.id)
    const item = qwen.get(session.id)
    return {
      kind: "session" as const,
      key: `session:${session.id}`,
      updated: item?.updated ?? session.time.updated,
      session,
      ...(item ? { qwen: item } : {}),
    }
  })

  for (const item of input.qwen) {
    if (item.sessionID && ids.has(item.sessionID)) continue
    all.push({
      kind: "qwen",
      key: `qwen:${item.id}`,
      updated: item.updated,
      qwen: item,
    })
  }

  return all.sort((a, b) => b.updated - a.updated || a.key.localeCompare(b.key))
}
