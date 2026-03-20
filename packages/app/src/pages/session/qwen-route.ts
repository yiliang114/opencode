export type QwenSession = {
  id: string
  sessionID?: string
  title: string
  cwd: string
  start: number
  updated: number
  messageCount: number
}

export function qwenListUrl(url: string, dir: string) {
  const next = new URL("/session/qwen", url)
  next.searchParams.set("directory", dir)
  return next.toString()
}

export function qwenLinkUrl(url: string) {
  return new URL("/session/qwen/link", url).toString()
}

export async function ensureQwenSession(input: {
  url: string
  dir: string
  qwen: string
  fetch?: typeof globalThis.fetch
}) {
  const fetch = input.fetch ?? globalThis.fetch
  const result = await fetch(qwenLinkUrl(input.url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      directory: input.dir,
      qwen: input.qwen,
    }),
  })
  if (!result.ok) throw new Error(`Failed to link qwen session: ${result.status}`)
  const data = (await result.json()) as {
    id: string
  }
  return data.id
}

export function qwenHref(dir: string, qwen: string, cwd?: string) {
  const next = new URL(`/${dir}/session`, "http://localhost")
  next.searchParams.set("qwen", qwen)
  if (cwd) next.searchParams.set("cwd", cwd)
  return `${next.pathname}${next.search}`
}

export function sessionHref(dir: string, sessionID: string) {
  return `/${dir}/session/${sessionID}`
}

export function linkedHref(input: {
  dir: string
  sessionID: string
  qwen: string
  cwd?: string
}) {
  const next = new URL(sessionHref(input.dir, input.sessionID), "http://localhost")
  next.searchParams.set("qwen", input.qwen)
  if (input.cwd) next.searchParams.set("cwd", input.cwd)
  return `${next.pathname}${next.search}`
}

export function qwenTarget(input: {
  dir: string
  qwen: string
  cwd?: string
  sessionID?: string
}) {
  if (input.sessionID)
    return linkedHref({
      dir: input.dir,
      sessionID: input.sessionID,
      qwen: input.qwen,
      cwd: input.cwd,
    })
  return qwenHref(input.dir, input.qwen, input.cwd)
}

export function sessionPageKey(input: {
  dir?: string
  id?: string
  qwen?: string
}) {
  const dir = input.dir ?? ""
  if (input.id) return `${dir}/${input.id}`
  if (input.qwen) return `${dir}/qwen/${input.qwen}`
  return dir
}

export function terminalPage(input: {
  surface: "chat" | "terminal"
  id?: string
  qwen?: string
}) {
  return input.surface === "terminal" && !!(input.id || input.qwen)
}
