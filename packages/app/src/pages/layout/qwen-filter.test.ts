import { describe, expect, test } from "bun:test"
import type { Session } from "@opencode-ai/sdk/v2/client"
import type { QwenSession } from "@/pages/session/qwen-route"
import { mergeQwen } from "./qwen-filter"

const session = (id: string) =>
  ({
    id,
    time: { updated: 10 },
  }) as unknown as Session

const qwen = (id: string, sessionID?: string, updated = 1) =>
  ({
    id,
    sessionID,
    title: id,
    cwd: "/repo",
    start: 1,
    updated,
    messageCount: 1,
  }) satisfies QwenSession

describe("mergeQwen", () => {
  test("merges linked qwen rows into their opencode session", () => {
    expect(
      mergeQwen({
        qwen: [qwen("qwen_1", "ses_1"), qwen("qwen_2"), qwen("qwen_3", "ses_3")],
        sessions: [session("ses_1"), session("ses_2")],
      }).map((item) => item.kind === "qwen" ? `q:${item.qwen.id}` : `s:${item.session.id}`),
    ).toEqual(["s:ses_2", "q:qwen_2", "q:qwen_3", "s:ses_1"])
  })

  test("sorts linked rows by qwen activity when present", () => {
    expect(
      mergeQwen({
        qwen: [qwen("qwen_1", "ses_1", 20)],
        sessions: [session("ses_1"), session("ses_2")],
      }).map((item) => item.kind === "qwen" ? item.qwen.id : item.session.id),
    ).toEqual(["ses_1", "ses_2"])
  })
})
