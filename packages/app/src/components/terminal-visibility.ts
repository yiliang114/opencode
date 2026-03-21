import type { JSX } from "solid-js"

export function terminalVisible(input: { restore?: string; shown: boolean }) {
  if (!input.restore) return true
  return input.shown
}

export function terminalStyle(input: { background: string; visible: boolean }): JSX.CSSProperties {
  return {
    "background-color": input.background,
    visibility: input.visible ? "visible" : "hidden",
  }
}
