# Qwen Sidebar And Terminal Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show Qwen Code sessions in the web sidebar and make manual terminal creation open a plain shell while chat-to-terminal switching still resumes the linked Qwen session.

**Architecture:** Keep OpenCode sessions and Qwen sessions as separate concepts. Add a lightweight backend endpoint that scans the current workspace's Qwen chat files and returns sidebar metadata, then render a dedicated Qwen section in the workspace sidebar. Extend terminal creation so manual terminal opens create shell PTYs, while explicit session resume paths still create Qwen PTYs bound to either an OpenCode session or a raw Qwen session ID.

**Tech Stack:** Bun, Hono, SolidJS, existing OpenCode PTY/session infrastructure, Qwen chat files under `~/.qwen/projects/<workspace>/chats`.

### Task 1: Add Backend Qwen Session Listing

**Files:**
- Create: `packages/opencode/src/qwen/list.ts`
- Modify: `packages/opencode/src/server/routes/session.ts`
- Test: `packages/opencode/test/qwen/list.test.ts`

**Step 1: Write the failing test**

Add tests that:
- ignore missing chat directories
- read `*.jsonl` chat files for the current workspace
- derive `id`, `title`, `cwd`, `start`, `updated`, and `messageCount`
- sort by most recent update descending

**Step 2: Run test to verify it fails**

Run: `cd packages/opencode && bun test test/qwen/list.test.ts`

Expected: FAIL because the list helper does not exist yet.

**Step 3: Write minimal implementation**

Implement a small file-system reader that:
- resolves the workspace Qwen chats directory
- scans `*.jsonl`
- parses enough lines to derive first user text, first timestamp, last timestamp, and user/assistant count
- returns lightweight metadata only

Expose `GET /session/qwen?directory=<dir>` from the server route.

**Step 4: Run test to verify it passes**

Run: `cd packages/opencode && bun test test/qwen/list.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/opencode/src/qwen/list.ts packages/opencode/src/server/routes/session.ts packages/opencode/test/qwen/list.test.ts
git commit -m "feat(qwen): list workspace qwen sessions"
```

### Task 2: Split Manual Terminal Creation From Qwen Resume

**Files:**
- Modify: `packages/app/src/context/terminal.tsx`
- Modify: `packages/app/src/context/terminal.test.ts`
- Modify: `packages/app/src/pages/session/terminal-panel.tsx`
- Modify: `packages/app/src/pages/session/use-session-commands.tsx`

**Step 1: Write the failing test**

Add tests that:
- manual terminal input creates a plain shell payload
- explicit Qwen resume input still creates a `qwen` payload
- linked OpenCode session resume still injects `OPENCODE_SESSION_ID`

**Step 2: Run test to verify it fails**

Run: `cd packages/app && bun test src/context/terminal.test.ts`

Expected: FAIL because terminal creation always targets `qwen`.

**Step 3: Write minimal implementation**

Refactor terminal creation so:
- `terminal.new()` defaults to a shell PTY
- `terminal.openSession(...)` still creates/reuses a linked Qwen PTY
- add a dedicated path for opening/reusing a raw Qwen session ID
- terminal panel auto-create and manual new-terminal actions use the shell path

**Step 4: Run test to verify it passes**

Run: `cd packages/app && bun test src/context/terminal.test.ts src/pages/session/terminal-panel.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/app/src/context/terminal.tsx packages/app/src/context/terminal.test.ts packages/app/src/pages/session/terminal-panel.tsx packages/app/src/pages/session/use-session-commands.tsx
git commit -m "feat(app): separate shell terminals from qwen resume"
```

### Task 3: Render Qwen Sessions In Sidebar And Open Them In Terminal Mode

**Files:**
- Modify: `packages/app/src/context/global-sync.tsx`
- Modify: `packages/app/src/context/global-sync/child-store.ts`
- Modify: `packages/app/src/context/global-sync/types.ts`
- Modify: `packages/app/src/pages/layout/sidebar-workspace.tsx`
- Modify: `packages/app/src/pages/session/session-layout.ts`
- Modify: `packages/app/src/pages/session.tsx`
- Test: `packages/app/src/context/global-sync/event-reducer.test.ts` (only if reducer/state behavior needs direct coverage)
- Test: `packages/app/src/pages/session/session-switch.test.ts` or a new focused helper test if route helpers are extracted

**Step 1: Write the failing test**

Add focused tests for any extracted helper that:
- builds the Qwen session URL/href
- treats a `qwen` query selection as terminal-only state
- keeps OpenCode session switching behavior unchanged

**Step 2: Run test to verify it fails**

Run the smallest relevant app test command for the extracted helper.

Expected: FAIL because the helper/state path does not exist yet.

**Step 3: Write minimal implementation**

Implement:
- per-workspace Qwen session state + loader in global sync
- periodic refresh for visible/open workspaces
- a dedicated Qwen sessions sidebar section
- click behavior that navigates to a terminal-only session route using a `qwen` query parameter
- session page behavior that opens/reuses the chosen Qwen session and defaults that route to terminal view

**Step 4: Run test to verify it passes**

Run the targeted app test command for the helper plus terminal/session tests.

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/app/src/context/global-sync.tsx packages/app/src/context/global-sync/child-store.ts packages/app/src/context/global-sync/types.ts packages/app/src/pages/layout/sidebar-workspace.tsx packages/app/src/pages/session/session-layout.ts packages/app/src/pages/session.tsx
git commit -m "feat(app): surface qwen sessions in sidebar"
```

### Task 4: Verify End-To-End Behavior

**Files:**
- No code changes unless verification exposes issues

**Step 1: Run targeted backend verification**

Run: `cd packages/opencode && bun test test/qwen/list.test.ts test/qwen/sync.test.ts test/qwen/session.test.ts test/server/qwen-provider-list.test.ts && bun typecheck`

Expected: PASS.

**Step 2: Run targeted frontend verification**

Run: `cd packages/app && bun test src/context/terminal.test.ts src/pages/session/terminal-panel.test.ts src/pages/session/session-switch.test.ts && bun typecheck`

Expected: PASS.

**Step 3: Manual behavior check**

Validate:
- chat session switch still resumes the same Qwen conversation
- manual terminal open/new creates a plain shell PTY
- Qwen sessions appear in the sidebar after polling refresh
- clicking a Qwen sidebar item opens terminal mode and resumes that Qwen session

**Step 4: Commit any final fixups**

If verification required no code changes, skip.
