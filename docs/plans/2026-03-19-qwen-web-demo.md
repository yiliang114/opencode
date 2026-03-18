# Qwen-Backed OpenCode Web Demo Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace OpenCode Web's current agent execution path with Qwen Code for a fast demo while keeping the OpenCode Web UI, preserving streaming/tool/todo/permission/question process state as closely as possible, and making the terminal "+" action open a Qwen terminal by default.

**Architecture:** Keep `packages/app` as the only UI. Add a Qwen bridge inside `packages/opencode` that runs Qwen through `@qwen-code/sdk` / the `qwen` CLI process, owns the mapping between OpenCode session IDs and Qwen runtime session IDs, and translates Qwen stream messages into OpenCode session/message/todo/permission/question/global-event primitives. Expose Qwen-native models and Qwen permission modes through the existing OpenCode Web metadata flow so the current model selector and session UI can be reused with minimal visual churn.

**Tech Stack:** Bun monorepo, Solid/Vite web app, Hono server routes, OpenCode session/message bus, OpenCode PTY subsystem, Qwen Code TypeScript SDK (`@qwen-code/sdk`), Qwen CLI process transport, git submodule vendoring for `qwen-code`.

## Research Summary

- `packages/app` is the actual Web client. It sends prompts through `sdk.client.session.promptAsync`, `sdk.client.session.command`, `sdk.client.session.shell`, and opens terminals through `sdk.client.pty.create` plus `/pty/:id/connect`.
- `packages/web` is the docs/marketing site and is not the target UI for this work.
- OpenCode Web currently gets:
  - agents from `app.agents`
  - provider/model metadata from `provider.list` and `config.providers`
  - runtime updates from the global event stream (`session.status`, `message.part.updated`, `message.part.delta`, `todo.updated`, `permission.asked`, `question.asked`)
- Qwen can be integrated without ACP:
  - `@qwen-code/sdk` spawns Qwen directly and streams structured JSON events
  - ACP remains a fallback/reference protocol surface, not the required primary path
- OpenCode PTY already supports `command`, `args`, `cwd`, and `env` at creation time, so the terminal "+" button can directly create a PTY that launches `qwen`.

## Constraints

- Demo speed matters more than broad platform coverage.
- Keep OpenCode Web UI and interaction patterns as intact as possible.
- Replace OpenCode `agent` selection with Qwen `permission mode`.
- Use Qwen-native model listing instead of OpenCode provider models.
- Reuse Qwen's own authentication/config (`~/.qwen/settings.json`, env) rather than building OpenCode-side config management.
- Scope the first implementation to OpenCode Web + backend. Do not change TUI/desktop/console flows yet.
- Add `qwen-code` as a git submodule during implementation.

### Task 1: Vendor Qwen Code and make the SDK importable

**Files:**
- Create: `vendor/qwen-code` (git submodule)
- Modify: `package.json`
- Modify: `packages/opencode/package.json`
- Modify: `turbo.json`
- Modify: any repo-level TypeScript/Bun resolution file only if needed after dependency wiring

**Step 1: Add the submodule**

Run:

```bash
git submodule add <qwen-code-remote> vendor/qwen-code
git submodule update --init --recursive
```

Expected:
- `vendor/qwen-code` is pinned as a submodule
- the repo can resolve a stable local path to Qwen sources

**Step 2: Wire the Qwen SDK into `packages/opencode`**

Recommended approach:

```json
{
  "dependencies": {
    "@qwen-code/sdk": "file:../../vendor/qwen-code/packages/sdk-typescript"
  }
}
```

Expected:
- `packages/opencode` can import `@qwen-code/sdk`
- dependency installation works from the repo root with Bun

**Step 3: Validate dependency installation**

Run:

```bash
bun install
```

Expected:
- Bun links the local SDK package successfully
- no unresolved package errors for `@qwen-code/sdk`

**Step 4: Validate the Qwen SDK package itself is buildable if needed**

Run:

```bash
cd vendor/qwen-code/packages/sdk-typescript
npm run build
```

Expected:
- SDK build artifacts are available if Bun needs built outputs from the local file dependency

### Task 2: Introduce a backend Qwen runtime bridge

**Files:**
- Create: `packages/opencode/src/qwen/session.ts`
- Create: `packages/opencode/src/qwen/runtime.ts`
- Create: `packages/opencode/src/qwen/events.ts`
- Create: `packages/opencode/src/qwen/schema.ts`
- Create: `packages/opencode/src/qwen/models.ts`
- Modify: `packages/opencode/src/index.ts`
- Modify: `packages/opencode/src/session/status.ts`
- Modify: `packages/opencode/src/session/message-v2.ts`
- Modify: `packages/opencode/src/session/todo.ts`
- Modify: `packages/opencode/src/question/service.ts`
- Modify: `packages/opencode/src/permission/*` only where required for Qwen-driven requests

**Step 1: Define Qwen session state**

Implement a session store that keeps:
- OpenCode `sessionID`
- Qwen runtime `sessionId`
- working directory / worktree directory
- selected Qwen model
- selected Qwen permission mode
- current query instance / abort controller
- pending tool/question/permission bookkeeping

Expected:
- OpenCode can resume its own routing while delegating execution to Qwen

**Step 2: Wrap Qwen SDK query lifecycle**

Use `@qwen-code/sdk` `query()` with:
- `cwd`
- `model`
- `permissionMode`
- `sessionId`
- `pathToQwenExecutable` pointing at the submodule CLI entry or resolved built binary

Expected:
- one OpenCode session can start, stream, abort, and continue a Qwen query

**Step 3: Translate Qwen stream-json messages into OpenCode primitives**

Map at minimum:
- partial assistant text -> `message.part.delta`
- assistant completion -> `message.part.updated`
- tool start/update/finish -> OpenCode tool parts
- todo/plan updates -> `todo.updated`
- permission requests -> `permission.asked`
- user questions -> `question.asked`
- busy/idle transitions -> `session.status`

Expected:
- existing Web listeners in `packages/app` continue to work with minimal or no structural changes

**Step 4: Keep the mapping lossy only where unavoidable**

Design rule:
- prefer preserving user-visible behavior over preserving exact old internal semantics
- explicitly document mismatches between Qwen event types and OpenCode part types in code comments near the adapter

### Task 3: Switch backend session execution for Web flows to Qwen

**Files:**
- Modify: `packages/opencode/src/server/routes/session.ts`
- Modify: `packages/opencode/src/session/prompt.ts`
- Create: `packages/opencode/src/qwen/submit.ts`
- Create: `packages/opencode/src/qwen/commands.ts`

**Step 1: Add a Qwen-backed prompt path**

Replace or branch the implementation behind:
- `session.prompt`
- `session.prompt_async`
- `session.command`
- `session.shell` where needed for Qwen-backed Web sessions

Expected:
- Web-originated prompts are executed by the Qwen bridge instead of the current OpenCode agent loop

**Step 2: Keep OpenCode session creation/history as the outer system of record**

Design:
- OpenCode still creates sessions, stores message rows, exposes routes, and drives routing
- Qwen remains the execution engine nested inside that session

Expected:
- Web routes, session URLs, history loading, and optimistic UI stay intact

**Step 3: Define a Web-only runtime gate**

For the first implementation, gate the new behavior to the Web/backend path only.

Expected:
- TUI/desktop/console are not accidentally regressed while the demo path is being built

### Task 4: Expose Qwen models and Qwen modes through existing metadata flows

**Files:**
- Modify: `packages/opencode/src/server/server.ts`
- Modify: `packages/opencode/src/server/routes/config.ts`
- Modify: `packages/opencode/src/server/routes/provider.ts`
- Modify: `packages/opencode/src/agent/agent.ts`
- Create: `packages/opencode/src/qwen/metadata.ts`

**Step 1: Replace visible primary agents with Qwen permission modes for the Web path**

Target mode set:
- `plan`
- `default`
- `auto-edit`
- `yolo`

Expected:
- the Web client's current agent selection mechanisms can be reused as a mode selector with minimal UI edits

**Step 2: Return synthetic provider/model metadata for Qwen**

Recommended shape:
- expose a single synthetic provider such as `qwen`
- populate its models from Qwen's configured/available model list
- mark connected/default state so the current model selection UI remains functional

Expected:
- `packages/app` can keep using its provider/model infrastructure without showing old OpenCode providers

**Step 3: Drop OpenCode-native model choices from the Web path**

Expected:
- only Qwen models are selectable in the demo

### Task 5: Update the Web client to speak in Qwen terms

**Files:**
- Modify: `packages/app/src/context/local.tsx`
- Modify: `packages/app/src/pages/session/use-session-commands.tsx`
- Modify: `packages/app/src/components/dialog-select-model.tsx`
- Modify: `packages/app/src/components/prompt-input.tsx`
- Modify: `packages/app/src/context/models.tsx`
- Modify: `packages/app/src/hooks/use-providers.ts`
- Modify: `packages/app/src/i18n/en.ts`
- Modify: `packages/app/src/i18n/zh.ts`
- Modify: other locale files only if required for compile/typecheck

**Step 1: Re-label agent affordances as mode affordances**

Update the visible text so users see Qwen terms:
- `agent` -> `mode` or `permission mode`
- keep the same interaction slots where possible

Expected:
- UI behavior feels familiar but semantics match Qwen

**Step 2: Keep the current model selector component, but feed it Qwen models**

Expected:
- minimal visual change
- no OpenCode-specific model/provider semantics exposed in the demo

**Step 3: Preserve process-state docks**

Make sure the Web session composer and timeline continue to surface:
- permission prompts
- question prompts
- todo/plan state
- streaming message updates

Expected:
- user-visible flow remains close to current OpenCode behavior

### Task 6: Turn terminal "+" into "new Qwen terminal"

**Files:**
- Modify: `packages/app/src/pages/session/terminal-panel.tsx`
- Modify: `packages/app/src/pages/session/use-session-commands.tsx`
- Modify: `packages/app/src/context/terminal.tsx`
- Modify: `packages/opencode/src/pty/index.ts` only if frontend-only command injection proves unreliable
- Modify: `packages/app/src/i18n/en.ts`
- Modify: `packages/app/src/i18n/zh.ts`

**Step 1: Change the terminal creation behavior**

Recommended backend call:

```ts
sdk.client.pty.create({
  command: "qwen",
  cwd: currentWorktreeOrProjectDir,
  title: "Qwen",
})
```

Expected:
- the existing "+" icon stays
- the label/tooltip changes to Qwen wording
- a new tab launches directly into Qwen

**Step 2: Inherit the current workspace/worktree**

Expected:
- if a session is running in a created worktree, the Qwen terminal opens there
- otherwise it opens in the project root

**Step 3: Keep fallback behavior explicit**

If `qwen` is not found on PATH:
- surface a clear UI error
- do not silently fall back to a plain shell

### Task 7: Verification for the demo path

**Files:**
- Modify: `packages/app/e2e/*` only for the flows touched
- Create: targeted tests under `packages/opencode` if bridge logic is isolated enough

**Step 1: Typecheck changed packages**

Run:

```bash
cd packages/opencode && bun typecheck
cd packages/app && bun typecheck
```

Expected:
- both packages typecheck cleanly

**Step 2: Validate the Web app against the local backend**

Run:

```bash
cd packages/opencode && bun run --conditions=browser ./src/index.ts serve --port 4096
cd packages/app && bun dev -- --port 4444
```

Expected:
- Web connects to local backend
- Qwen models appear
- mode selection appears in place of agent semantics
- sending a prompt streams Qwen output into the session
- todo/permission/question flows remain visible
- terminal "+" opens a Qwen tab

**Step 3: Run narrow tests for touched UI/backend slices**

Run:

```bash
cd packages/app && bun test
```

And, if targeted tests exist:

```bash
cd packages/opencode && bun test <targeted-files>
```

Expected:
- changed local tests pass

## Risks

- Qwen stream-json and OpenCode message-part semantics will not line up 1:1. The adapter layer is the highest-risk area.
- Qwen model discovery may require reading Qwen runtime/config state that does not already match OpenCode provider metadata shape.
- Preserving permission/question/todo parity without ACP may require custom translation code that is non-trivial.
- Importing the local Qwen SDK from a submodule may require building the SDK package before Bun can consume it cleanly.
- Web-only backend switching must be isolated carefully so current non-Web flows are not accidentally broken.

## Recommended Delivery Order

1. Vendor Qwen and get `@qwen-code/sdk` importable in `packages/opencode`.
2. Build the backend Qwen bridge and prove a single prompt can stream into one OpenCode session.
3. Replace model/agent metadata with Qwen model/mode metadata.
4. Update the Web labels and selectors.
5. Change terminal "+" to create a Qwen PTY.
6. Tighten parity for todo/permission/question flows and run demo verification.

## Demo Acceptance Criteria

- OpenCode Web starts normally against the local backend.
- Model selection shows Qwen models only.
- Agent semantics are replaced by Qwen permission modes (`plan/default/auto-edit/yolo`).
- Sending a prompt executes through Qwen, not the current OpenCode agent runtime.
- Streaming output is visible in the existing message timeline.
- Tool/todo/permission/question process state remains visible in the existing Web UI as closely as practical.
- Terminal "+" opens a Qwen terminal in the active project/worktree.

Plan complete and saved to `docs/plans/2026-03-19-qwen-web-demo.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
