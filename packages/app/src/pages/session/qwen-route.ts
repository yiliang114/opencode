export type QwenSession = {
  id: string
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

export function qwenHref(dir: string, qwen: string, cwd?: string) {
  const next = new URL(`/${dir}/session`, "http://localhost")
  next.searchParams.set("qwen", qwen)
  if (cwd) next.searchParams.set("cwd", cwd)
  return `${next.pathname}${next.search}`
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
