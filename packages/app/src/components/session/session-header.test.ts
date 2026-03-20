import { describe, expect, test } from "bun:test"
import { showSwitchTerminal } from "./session-header-state"

describe("showSwitchTerminal", () => {
  test("shows the switch action for chat sessions", () => {
    expect(
      showSwitchTerminal({
        id: "ses_123",
        surface: "chat",
        action: () => undefined,
      }),
    ).toBe(true)
  })

  test("hides the switch action without a session id", () => {
    expect(
      showSwitchTerminal({
        surface: "chat",
        action: () => undefined,
      }),
    ).toBe(false)
  })

  test("hides the switch action on terminal pages", () => {
    expect(
      showSwitchTerminal({
        id: "ses_123",
        surface: "terminal",
        action: () => undefined,
      }),
    ).toBe(false)
  })
})
