# Qwen Web Demo Handoff

## Branch

- branch: `chore/qwen-code-web-research`
- repo: `https://github.com/yiliang114/opencode`
- submodule: `vendor/qwen-code`
- qwen fork: `https://github.com/yiliang114/qwen-code.git`
- qwen fork branch: `opencode-web-demo`

## What Is Done

- OpenCode Web chat path now runs through Qwen instead of the old OpenCode agent loop.
- Web metadata is Qwen-first:
  - provider is synthetic `qwen`
  - agent selection is now Qwen permission mode
  - model list comes from Qwen settings
- terminal `+` opens a Qwen terminal by default.
- Qwen PTY startup now strips `NO_COLOR` and forces color-related env so the Qwen CLI header does not crash with `Invalid number of stops (< 2)`.
- Qwen tool execution path in Web was fixed so plain tool output no longer crashes todo parsing.
- Qwen runtime now stops waiting forever for child process exit after a result is already available.
- Qwen tool state now stays `completed` instead of falling back to stale `pending/raw`.

## Verified

- `cd packages/opencode && bun typecheck`
- `cd packages/opencode && bun test test/qwen/meta.test.ts test/qwen/runtime.test.ts test/pty/pty-env.test.ts test/pty/pty-session.test.ts`
- `cd packages/app && bun test src/context/terminal.test.ts`
- manual backend smoke:
  - simple prompt: `Reply with exactly: qwen-web-ok`
  - tool prompt: `Run pwd and tell me the output.`
  - expected result now lands as:
    - one reasoning part
    - one `run_shell_command` tool part with `completed`
    - one final text part

## Known Gaps

- Qwen model list still needs another pass in the Web UI. It is not fully surfaced the way you want yet.
- Web session list and terminal `qwen` session list are not the same source of truth.
  - OpenCode Web list = OpenCode session storage
  - terminal `qwen` list = Qwen history/session storage
  - current terminal launch does not auto-resume the active Web session
- I have not finished a full browser-click E2E pass for:
  - permission dialog
  - question dialog
  - model selection UX polish
- The Qwen terminal fix only applies to newly created terminals. Old tabs keep their old env.

## Important Behavior Notes

- If Qwen terminal still shows the gradient error, close the old tab and create a new Qwen terminal.
- Web chat already creates deterministic Qwen runtime session IDs internally, but there is no UI bridge yet that resumes those sessions inside the terminal CLI.

## Recommended Next Steps

1. Re-open the app and verify a fresh Qwen terminal on the new machine.
2. Finish the Qwen model list rendering in the Web UI.
3. Decide whether terminal-launched `qwen` should auto-resume the current Web session.
4. Add an end-to-end check for permission/question flows.

## Continue Tomorrow

1. Clone and enter the repo.
2. Update submodules:
   - `git submodule update --init --recursive`
   - if needed: `git submodule sync --recursive`
3. Install deps:
   - `bun install`
4. Start from this branch:
   - `git checkout chore/qwen-code-web-research`
   - `git pull --recurse-submodules`
5. Re-run focused verification:
   - `cd packages/opencode && bun typecheck`
   - `cd packages/opencode && bun test test/qwen/meta.test.ts test/qwen/runtime.test.ts test/pty/pty-env.test.ts`
6. Then continue from the known gaps above.
