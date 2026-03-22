export function emptyTerminalAction(input: { full?: boolean }) {
  return input.full ? "chat" : "close"
}

export function showInlineTerminal(input: {
  terminal: boolean
  opened: boolean
}) {
  if (input.terminal) return false
  return input.opened
}
