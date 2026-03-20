export type Surface = "chat" | "terminal"

export function qwenSyncUrl(url: string, sessionID: string) {
  return new URL(`/session/${sessionID}/qwen/sync`, url).toString()
}

export function nextSurface(current: Surface) {
  return current === "chat" ? "terminal" : "chat"
}

export async function syncQwenSession(input: {
  url: string
  sessionID: string
  fetch?: typeof globalThis.fetch
}) {
  const fetch = input.fetch ?? globalThis.fetch
  const result = await fetch(qwenSyncUrl(input.url, input.sessionID), {
    method: "POST",
  })
  if (!result.ok) {
    throw new Error(`Failed to sync Qwen session: ${result.status}`)
  }
  return (await result.json()) as {
    imported: number
    total: number
  }
}

export async function setSurface(input: {
  current: Surface
  next?: Surface
  sessionID: string
  url: string
  set(next: Surface): void
  sync?: typeof syncQwenSession
  after?: () => Promise<void> | void
}) {
  const next = input.next ?? nextSurface(input.current)
  if (next === input.current) return next
  if (input.current === "terminal" && next === "chat") {
    await (input.sync ?? syncQwenSession)({
      url: input.url,
      sessionID: input.sessionID,
    })
    await input.after?.()
  }
  input.set(next)
  return next
}
