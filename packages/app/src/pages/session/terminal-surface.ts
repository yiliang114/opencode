export function emptyTerminalAction(input: { full?: boolean }) {
  return input.full ? "chat" : "close"
}
