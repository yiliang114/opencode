export function restoreBuffer(input: {
  buffer?: string
  session?: string
  qwen?: string
}) {
  return typeof input.buffer === "string" ? input.buffer : ""
}

export function restoreCursor(input: {
  replay?: boolean
  cursor?: number
  restore: string
}) {
  if (input.replay && typeof input.cursor === "number" && Number.isSafeInteger(input.cursor)) return input.cursor
  if (input.restore) return -1
  return 0
}
