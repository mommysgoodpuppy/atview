# atview

A direct AT Protocol AppView CLI written in Workman. It does not import `@atproto/*`, generated
clients, or a JavaScript/TypeScript shim. XRPC URLs, HTTPS requests, errors, JSON boundaries, and
Lexicon projections are implemented directly.

## Commands

```sh
wm run app/main.wm
wm run app/cli.wm -- profile <handle-or-did>
wm run app/cli.wm -- feed <handle-or-did> [limit]
wm run app/cli.wm -- thread <at-uri> [depth]
wm run app/cli.wm -- search <query> [limit]
wm run app/cli.wm -- auth
wm run app/cli.wm -- refresh
```

Examples:

```sh
wm run app/cli.wm -- profile atproto.com
wm run app/cli.wm -- feed atproto.com 5
wm run app/cli.wm -- thread \
  'at://did:plc:ewvi7nxzyoun6zhxrhs64oiz/app.bsky.feed.post/3mrfjlbkj5s2k' 2
```

Public profile, feed, and thread calls work against `https://public.api.bsky.app`. Search and the
home timeline log in and route through the authenticated PDS/AppView proxy. The TUI loads the home
timeline and the account's author feed together; use `t` and `m` to switch between them. In
Ghostty, Kitty, and other Kitty-graphics-compatible terminals, image-bearing posts show an inline
preview and their alt text. Press `f` to switch between aspect-preserving fit and centered
crop-to-fill. Moving into the final three loaded entries automatically fetches and appends the next
cursor page. The TUI uses a responsive two-pane layout: compact timeline cards with profile
pictures and post media stay visible on the left, while the selected post, its media, and
recursively nested replies appear on the right. Every displayed thread post has a tiny profile
picture. Post media is left-aligned in both panes, and metrics sit beneath it at the bottom of the
post body. The timeline pane is calculated as a physical 9:19.5 rectangle from the measured
terminal cell dimensions; it is not a fixed percentage of character columns. Selection and thread
completion update only the affected borders, detail pane, footer, and right-pane Kitty images
rather than clearing and retransmitting the feed. These updates are mounted Workman effects:
signals are immutable model projections, the `Reactive` carrier accumulates dependencies actually
read, and transitions rerun only effects subscribed to changed keys.

## Authentication

Create `.env` in the repository root:

```dotenv
USER="your-handle.example"
APPPASS="xxxx-xxxx-xxxx-xxxx"
```

The file is ignored by `.gitignore` and should have mode `0600`. Values may be quoted or
unquoted. Credentials and JWTs are never rendered; `auth` and `refresh` print only the session
handle and DID. Tokens are retained in memory for the duration of one command and are not persisted.

## Architecture

- `proto/` — AT Protocol ownership: XRPC URL/error handling, authentication, JSON boundaries,
  nominal Lexicon views, HTTPS transport, and endpoint procedures.
- `app/` — atview ownership: CLI and TUI entrypoints, immutable application model, data projection,
  view-graph prefetching, event transitions, feed/thread views, and incremental rendering.
- `tui/` — reusable Workman terminal framework. It owns ANSI/Kitty output, geometry, drawing,
  immutable command scheduling, the Node terminal runtime, retained surfaces, and reactive effects.
- `util/` — general helpers that do not belong to AT Protocol or terminal UI. These are candidates
  for later library or standard-library extraction.
- `proto/xrpc.wm` — query parameters, URL encoding, and application errors.
- `proto/auth.wm` — dotenv loading, session creation, and refresh-token rotation.
- `proto/api.wm` — carrier-oriented public/authenticated HTTPS transport and endpoint procedures.
- `proto/json-boundary.wm` — nullish dynamic properties converted into Workman options.
- `proto/views.wm` — nominal profile/post/feed views and recursive thread union decoding.
- `app/main.wm` — small interactive entrypoint wiring data, updates, prefetch, rendering, and runtime.
- `app/cli.wm` — non-interactive command selection and text output.
- `app/model.wm` — immutable application and render models.
- `app/data.wm`, `app/graph.wm`, `app/update.wm` — protocol projection, lookahead cache, and event
  transitions.
- `app/feed-view.wm`, `app/thread-view.wm`, `app/view.wm`, `app/render.wm` — feed/thread drawing,
  shared screen composition, and reactive retained rendering.
- `tui/command.wm` — pure `Step` command algebra and concurrent task scheduler.
- `tui/runtime.wm` — raw terminal host loop and retained-frame orchestration.
- `tui/element.wm` — recursive, typed terminal elements for JSX-like composition with ordinary
  Workman functions and values; one interpreter lowers fragments, text, boxes, and images.
- `tui/reactive.wm` — immutable signal/effect graph with carrier composition, dynamic dependency
  capture, effect cleanup, and dirty-key flushing.
- `tui/surface.wm` — typed terminal commands and the final command-to-ANSI/Kitty host boundary.
- `tui/reactive-probe.wm` — deterministic dynamic-subscription and invocation-group probe.
- `tui/kitty.wm` — Bluesky PNG fetching and direct Kitty graphics APC/chunk generation.
- `tui/kitty-layout-probe.wm` — deterministic fit/fill control-sequence and crop-math probe.
- `tui/avatar-metadata-probe.wm` — authenticated avatar URL projection probe without token output.

## Current stress findings

- `Json.assert` does not adapt missing/null JavaScript fields into Workman `Option`; see
  `json-option-probe.wm`.
- A manually typed nullish `Reflect.get` boundary correctly constructs `Some`/`None`; see
  `json-optional-adapter-probe.wm`.
- A Response-touching Task procedure failed delayed FFI specialization when exported across a
  Workman module boundary. Keeping it beside concrete endpoint uses works.
- Imported function signatures can contain transitive nominal types that the block escape check
  mistakes for block-local types unless the consumer explicitly imports them. This is tracked in
  the Workman compiler's issue notes.
- Required nested records and recursive `$type` unions can be projected without reducing the whole
  payload to `Js.Object`.

See [PROGRESS.md](./PROGRESS.md) for diagnostics and live-test results.
