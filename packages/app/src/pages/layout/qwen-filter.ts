import type { Session } from "@opencode-ai/sdk/v2/client"
import type { QwenSession } from "@/pages/session/qwen-route"

export function filterQwen(input: {
  all: QwenSession[]
  sessions: Session[]
}) {
  const seen = new Set(input.sessions.map((item) => item.id))
  return input.all.filter((item) => !item.sessionID || !seen.has(item.sessionID))
}
