import path from "path"
import { qwenHome } from "./session"

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function text(value: unknown) {
  return typeof value === "string" && value ? value : undefined
}

function selected(value: unknown) {
  if (!record(value)) return
  if (record(value.security) && record(value.security.auth)) {
    const found = text(value.security.auth.selectedType)
    if (found) return found
  }
  const legacy = text(value.selectedAuthType) ?? text(value.authType) ?? text(value.provider)
  if (legacy) return legacy
}

function model(value: unknown) {
  if (!record(value) || !record(value.model)) return
  return text(value.model.name)
}

function types(value: unknown, id: string) {
  if (!record(value) || !record(value.modelProviders)) return []
  const out = Object.entries(value.modelProviders).flatMap(([key, item]) => {
    if (!Array.isArray(item)) return []
    return item.some((row) => record(row) && text(row.id) === id) ? [key] : []
  })
  return [...new Set(out)]
}

function inferred(env: Record<string, string | undefined>) {
  if (env.QWEN_OAUTH) return true
  if (env.OPENAI_API_KEY && env.OPENAI_MODEL && env.OPENAI_BASE_URL) return true
  if (env.GEMINI_API_KEY && env.GEMINI_MODEL) return true
  if (env.GOOGLE_API_KEY && env.GOOGLE_MODEL) return true
  if (env.ANTHROPIC_API_KEY && env.ANTHROPIC_MODEL && env.ANTHROPIC_BASE_URL) return true
  return false
}

export async function qwenAuth(input?: {
  home?: string
  env?: Record<string, string | undefined>
}) {
  const env = input?.env ?? process.env
  if (inferred(env)) return

  const file = Bun.file(path.join(qwenHome(input?.home), ".qwen", "settings.json"))
  if (!(await file.exists())) return

  let json: unknown
  try {
    json = await file.json()
  } catch {
    return
  }

  const pick = selected(json)
  if (pick) return pick

  const name = model(json)
  if (!name) return

  const out = types(json, name)
  if (out.length !== 1) return
  return out[0]
}

export async function qwenAuthArgs(input?: {
  home?: string
  env?: Record<string, string | undefined>
}) {
  const auth = await qwenAuth(input)
  if (!auth) return []
  return ["--auth-type", auth]
}
