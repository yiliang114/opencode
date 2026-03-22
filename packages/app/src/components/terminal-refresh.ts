import type { FitAddon, Terminal as Term } from "ghostty-web"

type Core = {
  renderer?: {
    render: (wasm: unknown, full: boolean, viewportY: number, term: unknown, scroll?: number) => void
  }
  wasmTerm?: unknown
  viewportY?: number
  scrollbarOpacity?: number
}

export function refreshTerminal(input: {
  term?: Term
  fit?: FitAddon
}) {
  input.fit?.fit()
  const term = input.term as unknown as Core | undefined
  if (!term?.renderer || !term.wasmTerm) return false
  term.renderer.render(term.wasmTerm, true, term.viewportY ?? 0, term, term.scrollbarOpacity)
  return true
}
