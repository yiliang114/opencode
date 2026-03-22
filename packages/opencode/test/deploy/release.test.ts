import { describe, expect, test } from "bun:test"
import { release } from "../../src/deploy/release"

describe("deploy.release", () => {
  test("builds bundle metadata and runtime files for a web release archive", () => {
    const result = release({
      target: "linux-x64",
      version: "1.2.27",
      rev: "c9c873499abc",
    })

    expect(result.name).toBe("opencode-web-linux-x64-1.2.27-c9c873499")
    expect(result.root).toBe("opencode-web-linux-x64-1.2.27-c9c873499")
    expect(result.archive).toBe("opencode-web-linux-x64-1.2.27-c9c873499.tar.gz")
    expect(result.stage).toEqual({
      app: "app",
      env: "env/server.env.example",
      health: "bin/check-health.sh",
      readme: "README.md",
      server: "server/bin/opencode",
      start: "bin/start-server.sh",
    })

    expect(result.env).toContain("OPENCODE_SERVER_PASSWORD=change-me")
    expect(result.env).toContain("OPENCODE_SERVER_HOSTNAME=127.0.0.1")
    expect(result.env).toContain("OPENCODE_SERVER_PORT=4096")

    expect(result.start).toContain('exec "$root/server/bin/opencode" serve')
    expect(result.start).toContain("--hostname \"$OPENCODE_SERVER_HOSTNAME\"")
    expect(result.start).toContain("--port \"$OPENCODE_SERVER_PORT\"")
    expect(result.start).toContain("--cors \"$OPENCODE_SERVER_CORS\"")

    expect(result.health).toContain("curl -fsS")
    expect(result.health).toContain("/global/health")
    expect(result.health).toContain("127.0.0.1:${OPENCODE_SERVER_PORT:-4096}")

    expect(result.readme).toContain("tar -xzf")
    expect(result.readme).toContain("./bin/start-server.sh")
    expect(result.readme).toContain("env/server.env")
  })
})
