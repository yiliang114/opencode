import { describe, expect, test } from "bun:test"
import { forwardData } from "./terminal-wire"

describe("forwardData", () => {
  test("keeps normal keyboard input for qwen terminals", () => {
    expect(
      forwardData({
        data: "hi",
        session: "ses_123",
      }),
    ).toBe("hi")
  })

  test("drops device-attribute replies for qwen terminals", () => {
    expect(
      forwardData({
        data: "\u001b[?62;22c\u001b[>1;10;0c",
        qwen: "qwen_123",
      }),
    ).toBe("")
  })

  test("keeps device-attribute replies for plain shell terminals", () => {
    expect(
      forwardData({
        data: "\u001b[?62;22c",
      }),
    ).toBe("\u001b[?62;22c")
  })
})
