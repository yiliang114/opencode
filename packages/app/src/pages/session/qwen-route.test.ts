import { describe, expect, mock, test } from "bun:test"
import { ensureQwenSession, qwenHref, qwenLinkUrl, qwenTarget, sessionHref, sessionPageKey, terminalPage } from "./qwen-route"

describe("qwenHref", () => {
  test("builds a terminal route for a qwen session", () => {
    expect(qwenHref("L3JlcG8", "qwen_123", "/repo")).toBe("/L3JlcG8/session?qwen=qwen_123&cwd=%2Frepo")
  })
})

describe("qwenLinkUrl", () => {
  test("builds the qwen link endpoint from the current server url", () => {
    expect(qwenLinkUrl("http://127.0.0.1:4096/")).toBe("http://127.0.0.1:4096/session/qwen/link")
  })
})

describe("ensureQwenSession", () => {
  test("posts to create or reuse a linked opencode session for a raw qwen chat", async () => {
    const fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ id: "ses_123" }),
      }),
    )

    await expect(
      ensureQwenSession({
        url: "http://127.0.0.1:4096/",
        dir: "/repo",
        qwen: "qwen_123",
        fetch: fetch as unknown as typeof globalThis.fetch,
      }),
    ).resolves.toBe("ses_123")

    expect(fetch).toHaveBeenCalledWith("http://127.0.0.1:4096/session/qwen/link", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        directory: "/repo",
        qwen: "qwen_123",
      }),
    })
  })
})

describe("sessionHref", () => {
  test("builds a chat route for an opencode session", () => {
    expect(sessionHref("L3JlcG8", "ses_123")).toBe("/L3JlcG8/session/ses_123")
  })
})

describe("qwenTarget", () => {
  test("restores the linked opencode session in terminal mode when available", () => {
    expect(
      qwenTarget({
        dir: "L3JlcG8",
        qwen: "qwen_123",
        cwd: "/repo",
        sessionID: "ses_123",
      }),
    ).toBe("/L3JlcG8/session/ses_123?qwen=qwen_123&cwd=%2Frepo")
  })

  test("falls back to the raw qwen terminal route when no session is linked", () => {
    expect(
      qwenTarget({
        dir: "L3JlcG8",
        qwen: "qwen_123",
        cwd: "/repo",
      }),
    ).toBe("/L3JlcG8/session?qwen=qwen_123&cwd=%2Frepo")
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
