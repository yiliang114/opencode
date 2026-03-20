import { describe, expect, test } from "bun:test"
import type { Session } from "@opencode-ai/sdk/v2/client"
import type { QwenSession } from "@/pages/session/qwen-route"
import { filterQwen } from "./qwen-filter"

const session = (id: string) =>
  ({
    id,
  }) as unknown as Session

const qwen = (id: string, sessionID?: string) =>
  ({
    id,
    sessionID,
    title: id,
    cwd: "/repo",
    start: 1,
    updated: 1,
    messageCount: 1,
  }) satisfies QwenSession

describe("filterQwen", () => {
  test("drops qwen entries already represented by opencode sessions", () => {
    expect(
      filterQwen({
        all: [qwen("qwen_1", "ses_1"), qwen("qwen_2"), qwen("qwen_3", "ses_3")],
        sessions: [session("ses_1"), session("ses_2")],
      }).map((item) => item.id),
    ).toEqual(["qwen_2", "qwen_3"])
  })
})
