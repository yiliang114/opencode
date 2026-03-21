import { describe, expect, test } from "bun:test"
import { terminalStyle, terminalVisible } from "./terminal-visibility"

describe("terminalVisible", () => {
  test("hides a restored terminal until replay finishes", () => {
    expect(terminalVisible({ restore: "buffer", shown: false })).toBe(false)
  })

  test("shows a restored terminal after replay finishes", () => {
    expect(terminalVisible({ restore: "buffer", shown: true })).toBe(true)
  })

  test("shows a fresh terminal immediately", () => {
    expect(terminalVisible({ restore: "", shown: false })).toBe(true)
  })
})

describe("terminalStyle", () => {
  test("keeps restored terminal hidden while replaying", () => {
    expect(
      terminalStyle({
        background: "#111111",
        visible: false,
      }),
    ).toEqual({
      "background-color": "#111111",
      visibility: "hidden",
    })
  })

  test("renders visible terminal styles after replay", () => {
    expect(
      terminalStyle({
        background: "#111111",
        visible: true,
      }),
    ).toEqual({
      "background-color": "#111111",
      visibility: "visible",
    })
  })
})
