export function qwenSyncUrl(url: string, sessionID: string) {
  return new URL(`/session/${sessionID}/qwen/sync`, url).toString()
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
