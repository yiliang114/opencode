import { describe, expect, test } from "bun:test"
import { qwenHref, sessionPageKey, terminalPage } from "./qwen-route"

describe("qwenHref", () => {
  test("builds a terminal route for a qwen session", () => {
    expect(qwenHref("L3JlcG8", "qwen_123", "/repo")).toBe("/L3JlcG8/session?qwen=qwen_123&cwd=%2Frepo")
  })
})

describe("sessionPageKey", () => {
  test("uses the opencode session id when present", () => {
    expect(sessionPageKey({ dir: "L3JlcG8", id: "ses_123" })).toBe("L3JlcG8/ses_123")
  })

  test("uses a dedicated qwen key when only a qwen session is selected", () => {
    expect(sessionPageKey({ dir: "L3JlcG8", qwen: "qwen_123" })).toBe("L3JlcG8/qwen/qwen_123")
  })

  test("falls back to the workspace key for a new chat session", () => {
    expect(sessionPageKey({ dir: "L3JlcG8" })).toBe("L3JlcG8")
  })
})

describe("terminalPage", () => {
  test("treats a qwen route as terminal-only when surface is terminal", () => {
    expect(
      terminalPage({
        surface: "terminal",
        qwen: "qwen_123",
      }),
    ).toBe(true)
  })

  test("does not treat a qwen route as terminal-only when surface is chat", () => {
    expect(
      terminalPage({
        surface: "chat",
        qwen: "qwen_123",
      }),
    ).toBe(false)
  })
})
