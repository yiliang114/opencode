import { describe, expect, mock, test } from "bun:test"
import { nextSurface, qwenSyncUrl, setSurface, syncQwenSession } from "./session-switch"

describe("qwenSyncUrl", () => {
  test("builds the qwen sync endpoint from the current server url", () => {
    expect(qwenSyncUrl("http://127.0.0.1:4096/", "ses_123")).toBe("http://127.0.0.1:4096/session/ses_123/qwen/sync")
  })
})

describe("syncQwenSession", () => {
  test("posts to the qwen sync endpoint", async () => {
    const fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ imported: 2, total: 4 }),
      }),
    )

    await expect(
      syncQwenSession({
        url: "http://127.0.0.1:4096/",
        sessionID: "ses_123",
        fetch: fetch as unknown as typeof globalThis.fetch,
      }),
    ).resolves.toEqual({
      imported: 2,
      total: 4,
    })

    expect(fetch).toHaveBeenCalledWith("http://127.0.0.1:4096/session/ses_123/qwen/sync", {
      method: "POST",
    })
  })
})

describe("nextSurface", () => {
  test("switches chat to terminal", () => {
    expect(nextSurface("chat")).toBe("terminal")
  })

  test("switches terminal to chat", () => {
    expect(nextSurface("terminal")).toBe("chat")
  })
})

describe("setSurface", () => {
  test("requests qwen sync before returning to chat", async () => {
    const calls: string[] = []
    const sync = mock(async () => {
      calls.push("sync")
      return { imported: 2, total: 4 }
    })

    await expect(
      setSurface({
        current: "terminal",
        next: "chat",
        sessionID: "ses_123",
        url: "http://127.0.0.1:4096/",
        sync: sync as unknown as typeof syncQwenSession,
        after: async () => {
          calls.push("after")
        },
        set: (next) => {
          calls.push(`set:${next}`)
        },
      }),
    ).resolves.toBe("chat")

    expect(calls).toEqual(["sync", "after", "set:chat"])
  })

  test("does not sync when switching into terminal", async () => {
    const sync = mock(async () => ({ imported: 0, total: 0 }))
    const set = mock(() => {})

    await expect(
      setSurface({
        current: "chat",
        next: "terminal",
        sessionID: "ses_123",
        url: "http://127.0.0.1:4096/",
        sync: sync as unknown as typeof syncQwenSession,
        set,
      }),
    ).resolves.toBe("terminal")

    expect(sync).not.toHaveBeenCalled()
    expect(set).toHaveBeenCalledWith("terminal")
  })
})
