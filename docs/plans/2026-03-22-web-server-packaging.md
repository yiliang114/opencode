# Web Server Packaging Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a repeatable packaging flow that builds the OpenCode web app and server into a deployable release archive for a Linux x64 server, plus documentation that explains upload, extraction, configuration, and startup.

**Architecture:** Keep deployment simple and explicit. Reuse the existing `packages/app` Vite build for static assets and the existing `packages/opencode` single-target Bun build for the backend binary. Add a small release helper to define bundle names and generated runtime files, then add one packaging script that stages a release directory and compresses it into a `.tar.gz` archive.

**Tech Stack:** Bun, TypeScript, Vite, Bun.build output from `packages/opencode`, Markdown docs, shell startup scripts generated into the release bundle.

### Task 1: Add release helper coverage first

**Files:**
- Create: `packages/opencode/test/deploy/release.test.ts`
- Create: `packages/opencode/src/deploy/release.ts`

**Step 1: Write the failing test**

Add tests for:
- release name generation from version + git revision
- bundle directory layout names
- generated runtime files (`server.env.example`, `start-server.sh`, `check-health.sh`)

**Step 2: Run test to verify it fails**

Run: `bun test test/deploy/release.test.ts`
Expected: FAIL because `src/deploy/release.ts` does not exist yet.

**Step 3: Write minimal implementation**

Implement pure helpers that:
- normalize a revision string
- compute a release name
- return generated file contents for:
  - `server.env.example`
  - `start-server.sh`
  - `check-health.sh`

**Step 4: Run test to verify it passes**

Run: `bun test test/deploy/release.test.ts`
Expected: PASS

### Task 2: Add packaging script

**Files:**
- Create: `script/package-web-release.ts`
- Modify: `package.json`

**Step 1: Write the failing test**

Extend `packages/opencode/test/deploy/release.test.ts` to assert the helper exposes the exact staged paths the packaging script should emit:
- `app/`
- `server/bin/opencode`
- `env/server.env.example`
- `bin/start-server.sh`
- `bin/check-health.sh`
- `README.md`

**Step 2: Run test to verify it fails**

Run: `bun test test/deploy/release.test.ts`
Expected: FAIL because layout metadata is incomplete.

**Step 3: Write minimal implementation**

Create `script/package-web-release.ts` that:
- resolves repo root
- runs `bun --cwd packages/opencode run build --single`
- runs `bun --cwd packages/app run build`
- stages a release directory under `.output/releases/<name>/`
- copies app `dist/` into `app/`
- copies the single-target backend binary into `server/bin/opencode`
- writes generated helper files into `env/`, `bin/`, and bundle `README.md`
- archives the staged directory into `.output/releases/<name>.tar.gz`

Add a root script entry:
- `deploy:pack:web`

**Step 4: Run test to verify it passes**

Run: `bun test test/deploy/release.test.ts`
Expected: PASS

### Task 3: Document server deployment

**Files:**
- Create: `docs/deploy/web-server-package.md`
- Modify: `README.md`

**Step 1: Write the failing test**

No automated Markdown test needed. Use a checklist review instead:
- package command documented
- archive upload command documented
- extraction command documented
- env editing documented
- backend start command documented
- reverse proxy example documented

**Step 2: Write minimal documentation**

Document:
- assumptions: Linux x64, Bun available on build machine
- local build prerequisites
- how to run `bun run deploy:pack:web`
- what files appear in `.output/releases/`
- how to upload the archive to the server
- how to extract it with `tar -xzf`
- how to edit `env/server.env`
- how to start the server with the generated shell script
- how to verify `/global/health`
- how to serve the `app/` directory and proxy API/WebSocket traffic on the same origin

Add a short link in `README.md` to the deployment doc.

### Task 4: Verify end to end

**Files:**
- Reuse previous files

**Step 1: Run targeted tests**

Run: `bun test test/deploy/release.test.ts`
Expected: PASS

**Step 2: Run package typecheck**

Run: `bun typecheck`
Expected: PASS

**Step 3: Build a real release archive**

Run: `bun run deploy:pack:web`
Expected:
- backend build succeeds
- frontend build succeeds
- archive exists under `.output/releases/`

**Step 4: Spot check the archive layout**

Run:
- `tar -tzf .output/releases/<name>.tar.gz | sed -n '1,80p'`

Expected:
- includes `app/`
- includes `server/bin/opencode`
- includes `env/server.env.example`
- includes `bin/start-server.sh`
- includes `bin/check-health.sh`
- includes bundle `README.md`
