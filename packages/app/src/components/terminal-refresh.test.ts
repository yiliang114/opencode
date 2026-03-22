import { describe, expect, test } from "bun:test"
import type { FitAddon, Terminal as Term } from "ghostty-web"
import { refreshTerminal } from "./terminal-refresh"

describe("refreshTerminal", () => {
  test("fits and forces a full redraw when terminal internals are available", () => {
    let fit = 0
    let force = false
    let viewport = -1
    let opacity = -1
    const wasm = {}
    const term = {
      renderer: {
        render(input: unknown, full: boolean, y: number, _term: unknown, scroll: number) {
          force = full && input === wasm
          viewport = y
          opacity = scroll
        },
      },
      wasmTerm: wasm,
      viewportY: 7,
      scrollbarOpacity: 0.5,
    } as unknown as Term
    const addon = {
      fit() {
        fit += 1
      },
    } as unknown as FitAddon

    expect(refreshTerminal({ term, fit: addon })).toBe(true)
    expect(fit).toBe(1)
    expect(force).toBe(true)
    expect(viewport).toBe(7)
    expect(opacity).toBe(0.5)
  })

  test("still fits even when the terminal internals are unavailable", () => {
    let fit = 0
    const addon = {
      fit() {
        fit += 1
      },
    } as unknown as FitAddon

    expect(refreshTerminal({ term: {} as Term, fit: addon })).toBe(false)
    expect(fit).toBe(1)
  })
})
