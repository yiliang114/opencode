import { describe, expect, mock, test } from "bun:test"
import { qwenSyncUrl, syncQwenSession } from "./session-switch"

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
