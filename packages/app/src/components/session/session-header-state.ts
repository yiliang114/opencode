export function showSwitchTerminal(input: {
  id?: string
  surface: "chat" | "terminal"
  action?: () => void
}) {
  return !!input.id && input.surface === "chat" && !!input.action
}
