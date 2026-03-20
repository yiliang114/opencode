import { type HexColor, withAlpha } from "@opencode-ai/ui/theme"

const ansi = {
  black: "#000000",
  red: "#cd3131",
  green: "#0dbc79",
  yellow: "#e5e510",
  blue: "#2472c8",
  magenta: "#bc3fbc",
  cyan: "#11a8cd",
  white: "#e5e5e5",
  brightBlack: "#666666",
  brightRed: "#f14c4c",
  brightGreen: "#23d18b",
  brightYellow: "#f5f543",
  brightBlue: "#3b8eea",
  brightMagenta: "#d670d6",
  brightCyan: "#29b8db",
  brightWhite: "#ffffff",
} as const

const base = {
  light: {
    background: "#fcfcfc",
    foreground: "#211e1e",
  },
  dark: {
    background: "#191515",
    foreground: "#d4d4d4",
  },
} as const

export function terminalTheme(input: {
  mode: "light" | "dark"
  foreground?: string
  background?: string
}) {
  const fallback = base[input.mode]
  const foreground = input.foreground ?? fallback.foreground
  const background = input.background ?? fallback.background
  const alpha = input.mode === "dark" ? 0.25 : 0.2
  const color = foreground.startsWith("#") ? (foreground as HexColor) : (fallback.foreground as HexColor)

  return {
    ...ansi,
    foreground,
    background,
    cursor: foreground,
    cursorAccent: background,
    selectionBackground: withAlpha(color, alpha),
    selectionForeground: background,
  }
}
