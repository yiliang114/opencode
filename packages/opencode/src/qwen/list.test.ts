import { describe, expect, test } from "bun:test"
import { findSessionID } from "./list"
import { qwenSessionID } from "./session"

describe("findSessionID", () => {
  test("returns the linked opencode session id for a qwen chat id", () => {
    expect(
      findSessionID({
        qwen: qwenSessionID("ses_456"),
        sessions: ["ses_123", "ses_456"],
      }),
    ).toBe("ses_456")
  })

  test("returns undefined when no opencode session matches", () => {
    expect(
      findSessionID({
        qwen: "qwen_123",
        sessions: ["ses_123", "ses_456"],
      }),
    ).toBeUndefined()
  })
})
