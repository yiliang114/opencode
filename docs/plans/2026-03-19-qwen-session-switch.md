# Qwen Session Switch Plan

## Goal

Make OpenCode Web support switching a single session between two views:

- `Chat UI` backed by the existing OpenCode timeline/composer
- `Terminal UI` backed by a Qwen PTY resumed into the same Qwen session

The switch must preserve one logical Qwen conversation. When the user returns
from terminal to chat, new terminal-side conversation content must be imported
back into the current OpenCode session so the Web timeline continues from the
same history.

## Scope

- Only change `OpenCode Web + backend`
- Reuse existing OpenCode Web layout and terminal widgets
- Keep one Qwen session per OpenCode session via `qwenSessionID(session.id)`
- Prefer demo speed and deterministic behavior over perfect historical fidelity

## Current State

- Web chat already runs through Qwen runtime
- `terminal.new()` already passes `OPENCODE_SESSION_ID`
- `Pty.create()` already turns that into `qwen --resume <sid>` or `--session-id <sid>`
- Missing piece: terminal-side Qwen history is not imported back into OpenCode
- Missing piece: no session-level view switch between chat and terminal

## Implementation

### 1. Backend sync route

Add a Qwen sync module in `packages/opencode/src/qwen/sync.ts` and expose
`POST /session/:sessionID/qwen/sync`.

The route will:

- load the OpenCode session
- load the matching Qwen chat file from `~/.qwen/projects/<project>/chats/<qwenSessionID>.jsonl`
- reconstruct the aggregated Qwen logical messages
- compare Qwen `user/assistant` turns with already stored OpenCode `user/assistant` messages
- skip the already mirrored prefix
- import only the remaining tail into the current OpenCode session
- `Session.touch(sessionID)` after successful import

### 2. Sync boundary rule

For the demo, the source of truth is ordered turn count:

- OpenCode prefix: existing `user/assistant` messages in the current session
- Qwen prefix: reconstructed `user/assistant` records from the Qwen chat file
- skip the first `min(existing, qwen)` matching-role turns
- import the remaining Qwen tail

This is intentionally simple. It works because the Web path already writes one
OpenCode user message and one assistant message per Qwen turn, so terminal-only
new turns appear as an append-only tail.

### 3. Imported message shape

For imported Qwen tail messages:

- `user` record -> create one OpenCode user message with text parts
- `assistant` record -> create one OpenCode assistant message with:
  - `step-start`
  - `reasoning` parts from Qwen thought parts
  - `text` parts from Qwen text parts
  - best-effort `tool` parts from assistant function calls plus following tool-result records
  - `step-finish`

We will ignore Qwen `system` records for now.

### 4. Frontend switch model

Add a per-session view mode in layout state:

- `chat`
- `terminal`

Rules:

- chat header top-right gets a `Switch to terminal` action
- terminal tab bar top-right gets a `Switch to chat` action
- switching to terminal:
  - ensure a Qwen PTY exists for the current session
  - focus that PTY
  - switch session view mode to `terminal`
- switching to chat:
  - call `POST /session/:sessionID/qwen/sync`
  - rely on message events to update the current session store
  - switch session view mode to `chat`

### 5. Terminal reuse

Extend local terminal state to remember which OpenCode session a PTY belongs to.

Needed behaviors:

- if a PTY already exists for the current session, reuse and focus it
- otherwise create a new Qwen PTY bound to that session

## TDD

### Backend tests

- `packages/opencode/test/qwen/sync.test.ts`
  - picks the unsynced Qwen tail after an existing OpenCode prefix
  - converts assistant thought/text/tool output into OpenCode parts
  - ignores empty or missing Qwen chat files

### Frontend tests

- `packages/app/src/pages/session/session-switch.test.ts`
  - resolves target view transitions correctly
  - requests sync before leaving terminal view
- extend `packages/app/src/pages/session/terminal-panel.test.ts`
  - session-bound Qwen terminal reuse helper behavior

## Risks

- Terminal-side history import is best-effort for tool semantics; UI parity will be close, not exact
- Prefix matching is count/role based; if old data is manually mutated, a forced resync may duplicate turns
- Qwen history format changes upstream could require parser updates

## Done When

- Chat header can switch into terminal view for the same OpenCode session
- Terminal view can switch back to chat view
- The terminal runs Qwen resumed into the same underlying Qwen session
- New terminal-side turns appear in the Web chat timeline after switching back
- Typecheck and targeted tests pass in both `packages/opencode` and `packages/app`
