#!/usr/bin/env bun

import { $ } from "bun"
import fs from "fs/promises"
import path from "path"
import { release } from "../packages/opencode/src/deploy/release"

const root = path.resolve(import.meta.dir, "..")
const out = path.join(root, ".output", "releases")
const target = process.env.OPENCODE_DEPLOY_TARGET ?? "linux-x64"

if (!target.startsWith("linux-")) {
  throw new Error(`unsupported target "${target}"; expected a linux target like linux-x64`)
}

const rev = (await $`git rev-parse --short=9 HEAD`.cwd(root).text()).trim()
const pkg = await Bun.file(path.join(root, "packages/opencode/package.json")).json()
const meta = release({
  target,
  version: String((pkg as { version?: string }).version ?? "0.0.0"),
  rev,
})

const stage = path.join(out, meta.root)
const app = path.join(root, "packages/app/dist")
const dist = path.join(root, "packages/opencode/dist")
const name = `opencode-${target}`
const server = path.join(dist, name, "bin", "opencode")

await fs.rm(stage, { force: true, recursive: true })
await fs.mkdir(path.join(stage, "bin"), { recursive: true })
await fs.mkdir(path.join(stage, "env"), { recursive: true })
await fs.mkdir(path.join(stage, "server", "bin"), { recursive: true })
await fs.mkdir(out, { recursive: true })

await $`bun --cwd packages/opencode build`.cwd(root)
await $`bun --cwd packages/app build`.cwd(root)

await fs.cp(app, path.join(stage, meta.stage.app), { recursive: true })
await fs.copyFile(server, path.join(stage, meta.stage.server))
await fs.writeFile(path.join(stage, meta.stage.env), `${meta.env}\n`)
await fs.writeFile(path.join(stage, meta.stage.start), `${meta.start}\n`)
await fs.writeFile(path.join(stage, meta.stage.health), `${meta.health}\n`)
await fs.writeFile(path.join(stage, meta.stage.readme), `${meta.readme}\n`)
await fs.chmod(path.join(stage, meta.stage.server), 0o755)
await fs.chmod(path.join(stage, meta.stage.start), 0o755)
await fs.chmod(path.join(stage, meta.stage.health), 0o755)

const tar = path.join(out, meta.archive)
await fs.rm(tar, { force: true })
await $`tar -czf ${tar} -C ${out} ${meta.root}`.cwd(root)

console.log(`release: ${stage}`)
console.log(`archive: ${tar}`)
