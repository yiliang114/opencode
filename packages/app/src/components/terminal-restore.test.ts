import { describe, expect, test } from "bun:test"
import { restoreBuffer, restoreCursor } from "./terminal-restore"

describe("restoreBuffer", () => {
  test("replays persisted buffer for a plain shell terminal", () => {
    expect(
      restoreBuffer({
        buffer: "shell-state",
      }),
    ).toBe("shell-state")
  })

  test("does not replay persisted buffer for a linked qwen session terminal", () => {
    expect(
      restoreBuffer({
        buffer: "qwen-state",
        session: "ses_123",
      }),
    ).toBe("")
  })

  test("does not replay persisted buffer for a raw qwen terminal", () => {
    expect(
      restoreBuffer({
        buffer: "qwen-state",
        qwen: "qwen_123",
      }),
    ).toBe("")
  })
})

describe("restoreCursor", () => {
  test("skips websocket replay when local shell restore is available", () => {
    expect(
      restoreCursor({
        replay: true,
        cursor: 42,
        restore: "shell-state",
      }),
    ).toBe(42)
  })

  test("requests full server replay for linked qwen terminals", () => {
    expect(
      restoreCursor({
        replay: false,
        cursor: 42,
        restore: "",
      }),
    ).toBe(0)
  })

  test("requests websocket tail when cursor is unavailable after local replay", () => {
    expect(
      restoreCursor({
        replay: true,
        restore: "shell-state",
      }),
    ).toBe(-1)
  })
})
