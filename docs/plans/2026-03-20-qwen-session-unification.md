# Qwen Session Unification Plan

## Status

This plan supersedes the sidebar/session-list parts of:

- `docs/plans/2026-03-19-qwen-session-switch.md`
- `docs/plans/2026-03-20-qwen-sidebar-and-terminal-mode.md`

Those plans got the chat-to-terminal bridge mostly right, but they still treat
OpenCode sessions and Qwen sessions as two sidebar concepts. That no longer
matches the target product behavior.

## Goal

Make OpenCode Web behave like a Qwen-first product while keeping the current
web shell:

- the visible chat UI is still OpenCode Web
- the execution engine is Qwen
- the visible session list is a single unified Qwen-oriented list
- one user action creates one logical conversation entry, not one OpenCode row
  plus one extra Qwen row
- chat UI and terminal UI both resume the same underlying Qwen conversation
- switching back from terminal imports new terminal-side turns into the same
  OpenCode session timeline

## User-Visible Requirements

### 1. Unified session list

- The workspace sidebar must not render separate `Qwen` and `OpenCode`
  sections for the same conversation.
- A conversation should appear once in the list.
- Clicking a list item should always open a working conversation entry.
- Existing raw Qwen chats discovered from local files should still be visible,
  but once linked they should collapse into the same single item as the linked
  OpenCode session.

### 2. New chat creates one linked conversation

- Clicking `New Chat` in the chat page or sidebar should create one linked
  conversation identity.
- The UI must not create a standalone OpenCode session entry and then later
  create a second visible Qwen entry for the same conversation.
- The newly created route should already be the canonical linked route, so
  later terminal switching does not need to invent a second identity.

### 3. Chat UI <-> terminal UI switch uses one Qwen session

- `Switch to terminal` should hide the chat surface and open a terminal PTY
  resumed into the same Qwen session.
- The PTY must be created or reused using the same Qwen session ID associated
  with the current linked conversation.
- Continuing the conversation in terminal must append to that same Qwen chat.

### 4. Terminal -> chat sync is part of the normal flow

- `Switch to chat` must sync terminal-side Qwen history back into the linked
  OpenCode session before showing the chat timeline.
- After syncing, the OpenCode chat UI should show the turns that were produced
  in the terminal.
- Navigating away from a terminal-backed session to another session should also
  run the same sync boundary.

### 5. Qwen filters and list interactions remain coherent

- If a Qwen filter/search is shown in the sidebar, it must operate on the same
  unified list source rather than on a separate side list.
- A list item that represents a linked conversation must be clickable from the
  same place every time.

## Current Gap Analysis

### Already covered by older plans

- Web chat execution is Qwen-backed.
- OpenCode session -> Qwen session resume for terminal is implemented.
- Terminal -> chat sync route exists.
- Raw Qwen chat discovery exists.

### Not fully covered yet

- No plan currently defines a single canonical session-list source.
- No plan currently defines how `New Chat` should create a linked conversation
  before the first prompt.
- The latest sidebar plan explicitly keeps Qwen and OpenCode as separate list
  concepts, which conflicts with the product goal.
- No plan currently defines canonical routing rules for linked sessions vs raw
  `?qwen=` routes.
- No plan currently states that every terminal-backed navigation boundary must
  sync before leaving terminal mode.

## Product Decisions

### Canonical identity

Each visible conversation is a linked pair:

- `opencode_session_id`
- `qwen_session_id`
- `directory`

OpenCode remains the web timeline store. Qwen remains the execution/runtime
store. The user should only perceive one conversation.

### Canonical route

Use a linked route as the stable route for any conversation that should support
both chat UI and terminal UI:

- `/:dir/session/:sessionID?qwen=:qwenSessionID`

Allow raw `/:dir/session?qwen=:qwenSessionID` only as a transient discovery
entry for an unlinked Qwen chat. Once linked, navigation should converge to the
canonical linked route.

### Sidebar source of truth

The sidebar should render one merged list, not two sections:

- linked OpenCode sessions with Qwen metadata
- raw Qwen chats that are not linked yet

The UI may still fetch both datasets internally, but the rendered result must be
one deduplicated list with one navigation behavior.

### New chat behavior

`New Chat` should immediately create a linked OpenCode session for the current
workspace and reserve its Qwen identity up front.

The simplest acceptable model is:

1. create OpenCode session
2. derive deterministic Qwen session ID from that OpenCode session ID
3. navigate directly to the canonical linked route

That gives the UI a stable identity before the first prompt and prevents the
later appearance of a second sidebar entry for the same conversation.

## Implementation Plan

### Task 1. Introduce a unified sidebar model

**Files likely involved**

- `packages/app/src/pages/layout/sidebar-workspace.tsx`
- `packages/app/src/pages/layout/sidebar-items.tsx`
- `packages/app/src/pages/layout/qwen-filter.ts`
- `packages/app/src/pages/session/qwen-route.ts`
- `packages/opencode/src/qwen/list.ts`
- `packages/opencode/src/qwen/map.ts`
- `packages/opencode/src/server/routes/session.ts`

**Changes**

- Replace the current two-block rendering (`Qwen` section + OpenCode sessions
  section) with one merged list model.
- Deduplicate by linked identity:
  - if a Qwen chat is linked to an OpenCode session, render one row
  - if a Qwen chat is the deterministic session for an existing OpenCode
    session, render one row
  - if a Qwen chat is unlinked, render one row that links on open
- Keep list ordering coherent, preferably by most recent Qwen activity with a
  fallback to OpenCode `updatedAt` when the Qwen file does not exist yet.

### Task 2. Make `New Chat` create a linked session immediately

**Files likely involved**

- `packages/app/src/pages/layout/sidebar-items.tsx`
- `packages/app/src/pages/layout/sidebar-workspace.tsx`
- `packages/app/src/pages/session.tsx`
- `packages/opencode/src/server/routes/session.ts`
- `packages/opencode/src/qwen/link.ts`
- `packages/opencode/src/qwen/session.ts`

**Changes**

- Add a backend path for creating a Qwen-backed OpenCode session from the UI,
  or extend existing session creation with an explicit Qwen-backed mode.
- Make sidebar `New Chat` and page-level `New Chat` use that linked creation
  path instead of just navigating to the empty OpenCode session route.
- Navigate directly to the canonical linked route on success.

### Task 3. Normalize route behavior around linked sessions

**Files likely involved**

- `packages/app/src/pages/session/qwen-route.ts`
- `packages/app/src/pages/session.tsx`
- `packages/app/src/pages/session/session-layout.ts`

**Changes**

- Treat linked `sessionID + qwen` as the normal route for Qwen-backed sessions.
- Keep raw `?qwen=` support only for unlinked imported chats.
- When a raw Qwen chat is linked on click, redirect to the linked route rather
  than leaving the page on a transient route forever.

### Task 4. Tighten terminal reuse and sync boundaries

**Files likely involved**

- `packages/app/src/context/terminal.tsx`
- `packages/app/src/pages/session.tsx`
- `packages/app/src/pages/session/session-switch.ts`
- `packages/app/src/pages/layout/sidebar-items.tsx`
- `packages/app/src/pages/layout/sidebar-workspace.tsx`
- `packages/opencode/src/pty/index.ts`
- `packages/opencode/src/qwen/sync.ts`

**Changes**

- Reuse the same PTY for a linked session whenever possible.
- Ensure `Switch to terminal` uses the linked Qwen session every time.
- Ensure `Switch to chat` always syncs before showing the timeline.
- Ensure navigating away from a terminal-backed session to another session also
  syncs before route change.

### Task 5. Fill acceptance tests for the missing product behavior

**Files likely involved**

- `packages/app/src/pages/layout/sidebar-sync.test.ts`
- `packages/app/src/pages/session/session-switch.test.ts`
- `packages/app/src/pages/session/qwen-route.test.ts`
- `packages/app/e2e/session/qwen-sidebar.spec.ts`
- `packages/app/e2e/session/session-switch.spec.ts`
- `packages/opencode/test/qwen/list.test.ts`
- `packages/opencode/test/qwen/link.test.ts`
- `packages/opencode/test/qwen/sync.test.ts`

**Add coverage for**

- one `New Chat` action creates one visible sidebar item
- linked conversations do not render as duplicated Qwen + OpenCode rows
- opening a raw Qwen chat links and redirects to canonical linked route
- switching chat -> terminal resumes the same Qwen session
- switching terminal -> chat imports terminal-side turns into the same OpenCode
  timeline

## Verification

### Backend

- `cd packages/opencode && bun test test/qwen/list.test.ts test/qwen/link.test.ts test/qwen/sync.test.ts test/qwen/session.test.ts`
- `cd packages/opencode && bun typecheck`

### Frontend

- `cd packages/app && bun test src/context/terminal.test.ts src/pages/session/qwen-route.test.ts src/pages/session/session-switch.test.ts src/pages/layout/sidebar-sync.test.ts`
- `cd packages/app && bun typecheck`

### Manual checks

- click `New Chat` once -> exactly one new conversation row appears
- open that row -> chat UI works
- switch to terminal -> resumed into same Qwen session
- chat in terminal -> switch back -> new turns appear in chat UI
- linked sessions remain single-row in the sidebar after refresh

## Done When

- the sidebar behaves as one unified Qwen-oriented session list
- `New Chat` creates one linked conversation identity
- no duplicated visible rows appear for the same conversation
- terminal and chat continue the same Qwen conversation
- terminal-originated turns reappear in chat after sync
