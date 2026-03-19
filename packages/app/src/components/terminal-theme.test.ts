import { describe, expect, test } from "bun:test"
import { terminalTheme } from "./terminal-theme"

describe("terminalTheme", () => {
  test("fills the ansi palette for dark mode", () => {
    const theme = terminalTheme({
      mode: "dark",
    })

    expect(theme.background).toBe("#191515")
    expect(theme.foreground).toBe("#d4d4d4")
    expect(theme.cursor).toBe("#d4d4d4")
    expect(theme.red).toBe("#cd3131")
    expect(theme.green).toBe("#0dbc79")
    expect(theme.blue).toBe("#2472c8")
    expect(theme.brightRed).toBe("#f14c4c")
    expect(theme.brightBlue).toBe("#3b8eea")
    expect(theme.selectionBackground).toBeDefined()
  })

  test("keeps resolved foreground and background while preserving ansi colors", () => {
    const theme = terminalTheme({
      mode: "light",
      foreground: "#123456",
      background: "#f5f5f5",
    })

    expect(theme.foreground).toBe("#123456")
    expect(theme.background).toBe("#f5f5f5")
    expect(theme.cursor).toBe("#123456")
    expect(theme.yellow).toBe("#e5e510")
    expect(theme.brightWhite).toBe("#ffffff")
  })
})
