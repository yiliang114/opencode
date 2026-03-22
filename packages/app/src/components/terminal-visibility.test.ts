import { describe, expect, test } from "bun:test"
import { terminalStyle, terminalVisible } from "./terminal-visibility"

describe("terminalVisible", () => {
  test("hides a restored terminal until replay finishes", () => {
    expect(terminalVisible({ restore: "buffer", shown: false, stream: false })).toBe(false)
  })

  test("shows a restored terminal after replay finishes", () => {
    expect(terminalVisible({ restore: "buffer", shown: true, stream: false })).toBe(true)
  })

  test("shows a fresh terminal immediately", () => {
    expect(terminalVisible({ restore: "", shown: false, stream: false })).toBe(true)
  })

  test("hides a fresh streamed terminal until the first frame is ready", () => {
    expect(terminalVisible({ restore: "", shown: false, stream: true })).toBe(false)
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
