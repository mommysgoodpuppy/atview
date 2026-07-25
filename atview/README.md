# atview

A direct AT Protocol AppView CLI written in Workman. It does not import `@atproto/*`, generated
clients, or a JavaScript/TypeScript shim. XRPC URLs, HTTPS requests, errors, JSON boundaries, and
Lexicon projections are implemented directly.

## Commands

```sh
wm run atview/tui/app.wm
wm run atview/main.wm -- profile <handle-or-did>
wm run atview/main.wm -- feed <handle-or-did> [limit]
wm run atview/main.wm -- thread <at-uri> [depth]
wm run atview/main.wm -- search <query> [limit]
wm run atview/main.wm -- auth
wm run atview/main.wm -- refresh
```

Examples:

```sh
wm run atview/main.wm -- profile atproto.com
wm run atview/main.wm -- feed atproto.com 5
wm run atview/main.wm -- thread \
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

Create `atview/.env`:

```dotenv
USER="your-handle.example"
APPPASS="xxxx-xxxx-xxxx-xxxx"
```

The file is ignored by `atview/.gitignore` and should have mode `0600`. Values may be quoted or
unquoted. Credentials and JWTs are never rendered; `auth` and `refresh` print only the session
handle and DID. Tokens are retained in memory for the duration of one command and are not persisted.

## Architecture

- `xrpc.wm` — query parameters, URL encoding, and application errors.
- `auth.wm` — dotenv loading, session creation, and refresh-token rotation.
- `api.wm` — carrier-oriented public/authenticated HTTPS transport and endpoint procedures.
- `json-boundary.wm` — conversion of nullish dynamic properties into real Workman options.
- `views.wm` — nominal profile/post/feed views and recursive thread union decoding.
- `main.wm` — command selection and terminal rendering.
- `tui/` — Workman-native raw-terminal runtime, layout/drawing/widget primitives, and interactive
  AppView browser. It directly owns ANSI output and Node terminal FFI rather than importing a TUI
  library.
- `tui/reactive.wm` — immutable signal/effect graph with carrier composition, dynamic dependency
  capture, effect cleanup, and dirty-key flushing.
- `tui/surface.wm` — typed terminal commands and the final command-to-ANSI/Kitty host boundary.
- `tui/reactive-probe.wm` — deterministic dynamic-subscription and invocation-group probe.
- `tui/kitty.wm` — Bluesky PNG fetching and direct Kitty graphics APC/chunk generation.
- `tui/kitty-layout-probe.wm` — deterministic fit/fill control-sequence and crop-math probe.
- `tui/avatar-metadata-probe.wm` — authenticated avatar URL projection probe without token output.
- `research/atproto` — sparse clone of the official lexicons, for research only.

## Current stress findings

- `Json.assert` does not adapt missing/null JavaScript fields into Workman `Option`; see
  `json-option-probe.wm`.
- A manually typed nullish `Reflect.get` boundary correctly constructs `Some`/`None`; see
  `json-optional-adapter-probe.wm`.
- A Response-touching Task procedure failed delayed FFI specialization when exported across a
  Workman module boundary. Keeping it beside concrete endpoint uses works.
- Required nested records and recursive `$type` unions can be projected without reducing the whole
  payload to `Js.Object`.

See [PROGRESS.md](./PROGRESS.md) for diagnostics and live-test results.
