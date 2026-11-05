# AGENTS.md

A direct AT Protocol AppView CLI, terminal UI and REPL API written in Workman.

- `docs/`: settled user-facing documentation. Start with `README.md`, then `docs/repl.md` for the
  REPL API.
- `markdown/`: plans, work in progress and notes that should outlast a session. Start with
  `markdown/repl-sync.md`. Keep project memory here, not in a harness's own memory system (Claude
  Code memory, Codex memories and the like).
- Use `_scratch/` for agent scratch files, experiments and local test artifacts. It is ignored by
  Git. Global tmp may be used but is not persistent; project-local, don't use `project/tmp/` or
  others, only `_scratch/`.
- Check: `wm check <file>`. Test: run the relevant `*-probe.wm`, such as
  `wm run app/repl-sync-probe.wm` (offline, against a fixture). Run: `wm run app/main.wm`.
- `app/`: entry points and the REPL worker. `proto/`: XRPC and Lexicon views. `tui/`: terminal
  rendering. `repl.wm` is the completed-value REPL API and `repl-async.wm` is its Task version.
- `.env` holds account credentials and is ignored by Git. Never print or commit it, and keep
  sessions out of values the REPL prints.

## Related projects

- `../wm-mini`: the Workman compiler. atview needs a version newer than 0.6.0, because it uses
  `List.findMap` and field access on call results. Compiler bugs are tracked in its
  `markdown/issues/`.

## Git

Manage git however you see fit. Primary is `main`.

- Commit as the configured git identity. No `Co-Authored-By` or other co-author trailers.
- Never push, open PRs or issues, or publish anything to external sites unless asked for that
  specific action.
- End every agent-made commit message with:

  ```
  Agent: <harness> <version>; model <exact model id>; thread <harness thread/session id>
  ```

  For example, `Agent: Claude Code 2.1.296; model claude-opus-5-5; thread 941be8c7-aca1-4664-b284-7cc0eed69e21`.
