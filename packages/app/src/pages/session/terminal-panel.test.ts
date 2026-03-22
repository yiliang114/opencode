import { describe, expect, test } from "bun:test"
import { terminalTabLabel } from "./terminal-label"
import { emptyTerminalAction, showInlineTerminal } from "./terminal-surface"

const t = (key: string, vars?: Record<string, string | number | boolean>) => {
  if (key === "terminal.title.numbered") return `Terminal ${vars?.number}`
  if (key === "terminal.title") return "Terminal"
  return key
}

describe("terminalTabLabel", () => {
  test("returns custom title unchanged", () => {
    const label = terminalTabLabel({ title: "server", titleNumber: 3, t })
    expect(label).toBe("server")
  })

  test("normalizes default numbered title", () => {
    const label = terminalTabLabel({ title: "Terminal 2", titleNumber: 2, t })
    expect(label).toBe("Terminal 2")
  })

  test("falls back to generic title", () => {
    const label = terminalTabLabel({ title: "", titleNumber: 0, t })
    expect(label).toBe("Terminal")
  })
})

describe("emptyTerminalAction", () => {
  test("closes the drawer in docked mode", () => {
    expect(emptyTerminalAction({ full: false })).toBe("close")
  })

  test("returns to chat in full mode", () => {
    expect(emptyTerminalAction({ full: true })).toBe("chat")
  })
})

describe("showInlineTerminal", () => {
  test("shows the docked terminal when chat surface keeps it opened", () => {
    expect(
      showInlineTerminal({
        terminal: false,
        opened: true,
      }),
    ).toBe(true)
  })

  test("hides the docked terminal when the drawer is closed", () => {
    expect(
      showInlineTerminal({
        terminal: false,
        opened: false,
      }),
    ).toBe(false)
  })

  test("hides the docked terminal in full terminal mode", () => {
    expect(
      showInlineTerminal({
        terminal: true,
        opened: true,
      }),
    ).toBe(false)
  })
})
