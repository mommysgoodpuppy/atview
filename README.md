# atview

A direct AT Protocol AppView CLI written in Workman. It does not import `@atproto/*`, generated
clients, or a JavaScript/TypeScript shim. XRPC URLs, HTTPS requests, errors, JSON boundaries, and
Lexicon projections are implemented directly.

Workman language documentation is in [`../wm-mini/docs`](../wm-mini/docs).

## Install with Pakman

```sh
wm pakman install github.com/mommysgoodpuppy/atview
atview
```

The root `pak.wm` selects a private WM version; WM selects its own Deno.
Your globally installed WM/Deno commands are independent. Pakman builds
`app/main.wm` into a standalone TUI executable, including its workers, using
WM and Deno at build time. Deno may download its compilation runtime and imports;
offline provisioning is not required. The installed app needs no WM launcher.
The separate source CLI below is not installed by this recipe.
Authentication retains the `.env` convention below, relative to the directory
where you run `atview`; credentials are not included in the package.

Before the recipe is published, test the working tree explicitly:

```sh
PAKMAN_REPOSITORIES="{\"github.com/mommysgoodpuppy/atview\":\"$PWD\"}" \
  wm pakman install github.com/mommysgoodpuppy/atview
```

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
timeline and the account's author feed together. The top bar contains Following, My posts, and the
account's pinned Bluesky feeds and lists. Press `u`/`i` for the previous/next tab (wrapping at the
ends); `t` and `m` jump directly to Following and My posts. Adjacent tabs preload their first
page and reachable images in the background; other feeds load on first visit. Each tab keeps its
own posts, pagination cursor, and selection. Press `r` to retry a failed
load. Uppercase `L` toggles a like on the selected post; confirmed likes show `❤️` before the
post metrics (and beside reply authors). Existing likes are loaded with the authenticated viewer
state. Writes run in the background, duplicate toggles are ignored while saving, and failures
leave the confirmed reaction unchanged. Like updates repaint reaction text without deleting or
retransmitting images. Tab labels use their content width, and the bar scrolls to keep the active tab visible. A partially
visible tab uses the remaining columns and ends with `..`. Tabs and timeline cards share retained
viewport offsets, minimal edge-reveal navigation, and the same smooth animation clock. Moving
backward inside the current viewport keeps it still; direction changes ease from the visible
position, and tab-only animation redraws only the header. In
Ghostty, Kitty, and other Kitty-graphics-compatible terminals, image-bearing posts show an inline
preview and their alt text; Windows Terminal, foot, mlterm, and contour get a hand-written sixel
encoding, and any other terminal falls back to half-block rendering. Set
`ATVIEW_IMAGE_BACKEND=kitty|sixel|half` to force a backend. Press `f` to switch between
aspect-preserving fit and centered crop-to-fill. Fit-mode media reserves only the rows required
by the image aspect ratio and terminal cell dimensions, capped by the available height; wide
images do not leave a fixed-height blank frame above or below them. Image aspect metadata sizes
placeholders before downloads; images without metadata use a compact loading placeholder.
Preloading follows the actual viewport, two screens above, four below, and the animation destination.
The first and remembered landing frames of adjacent tabs are semantically reachable too. Media
loads continue during scrolling, prioritize visible content then adjacent-tab frames, share post
resources across tabs, and limit concurrent loading to 16 posts. Ready nearby images and destination frames also warm the encoding cache without painting the
current tab. Sixel prepares images even when they lie entirely outside the paint viewport. See [resource reachability](docs/reachability.md). Moving into the final three loaded entries
automatically fetches and appends the next cursor page. The TUI uses a responsive two-pane
layout: timeline cards with full post text, profile pictures, and post media stay visible on the left,
while the selected post, its media, and recursively nested replies appear on the right. Every
displayed thread post has a tiny profile
picture. Post media is left-aligned in both panes, and metrics sit beneath it at the bottom of the
post body. The timeline pane is calculated as a physical 9:19.5 rectangle from the measured
terminal cell dimensions; it is not a fixed percentage of character columns. Selection and thread
completion update only the affected borders, detail pane, footer, and right-pane Kitty images
rather than clearing and retransmitting the feed. These updates are mounted Workman effects:
signals are immutable model projections, the `Reactive` carrier accumulates dependencies actually
read, and transitions rerun only effects subscribed to changed keys. In the interactive runtime, PNG
decoding and sixel/half-block encoding run in an image worker. Text and selection borders draw
immediately; obsolete image placements are discarded and encoded output is cached. Both sixel and
half-block crops reuse position-independent prepared rows, including on the first scroll through a
new crop; clipping does not rescale the image.

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
- `proto/feed-tabs.wm`, `app/tabs.wm` — read-only pinned feed/list discovery and asynchronous tab pages.
- `tui/reachability.wm`, `app/preload.wm` — visible/nearby viewports, semantic tab destinations,
  prioritized media loading, and bounded concurrency.
- `app/next-tab-image-probe.wm` — real worker-backed PNG preparation while the destination tab
  stays inactive; run with `ATVIEW_IMAGE_BACKEND=sixel wm run app/next-tab-image-probe.wm`.
- `proto/likes.wm`, `app/likes.wm`, `app/reaction-model.wm` — asynchronous like/unlike writes and
  session reaction overrides shared by feed tabs and cached threads.
- `app/likes-probe.wm` — fake-write payload, toggle, failure, stale-result, and retained rendering
  probe; run with `ATVIEW_IMAGE_BACKEND=kitty wm run app/likes-probe.wm`.
- `tui/tabs.wm` — reusable content-sized tab strip with partial labels and active-tab visibility
  on narrow screens.
- `tui/clipping-probe.wm` — text/line viewport clipping and partial-tab regression probe; run
  with `wm run tui/clipping-probe.wm`.
- `app/tabs-probe.wm` — offline tab discovery, navigation, pagination isolation, and layout probe;
  run with `wm run app/tabs-probe.wm`.
- `app/cli.wm` — non-interactive command selection and text output.
- `app/model.wm` — immutable application and render models.
- `app/data.wm`, `app/graph.wm`, `app/update.wm` — protocol projection, lookahead cache, and event
  transitions.
- `app/feed-view.wm`, `app/thread-view.wm`, `app/view.wm`, `app/render.wm` — feed/thread drawing,
  shared screen composition, and reactive retained rendering.
- `app/image-layout-probe.wm` — aspect-sized media layout, metrics placement, and stable scroll
  geometry regression probe; run with `wm run app/image-layout-probe.wm`.
- `app/feed-probe.wm` — offline full-text layout and reachable avatar scheduling regression probe; run with
  `wm run app/feed-probe.wm`.
- `app/navigation-probe.wm` — retained selection updates and actual viewport scrolling regression
  probe; run with `ATVIEW_IMAGE_BACKEND=kitty wm run app/navigation-probe.wm`.
- `tui/command.wm` — pure `Step` command algebra and concurrent task scheduler.
- `tui/runtime.wm` — raw terminal host loop and retained-frame orchestration.
- `tui/element.wm` — recursive, typed terminal elements for JSX-like composition with ordinary
  Workman functions and values; one interpreter lowers fragments, text, boxes, and images.
  `textViewport` and `linesViewport` accept separate logical and viewport rectangles, clipping
  at their intersection without reflowing. Pass `""` for hard clipping or `".."` for continuation
  markers; `ellipsizedText` is the single-rectangle convenience helper. The same viewport
  commands are available through `tui/surface.wm` for retained updates.
- `tui/reactive.wm` — immutable signal/effect graph with carrier composition, dynamic dependency
  capture, effect cleanup, and dirty-key flushing.
- `tui/surface.wm` — typed terminal commands and the final command-to-ANSI/Kitty host boundary.
- `tui/reactive-probe.wm` — deterministic dynamic-subscription and invocation-group probe.
- `tui/scroll.wm` — shared horizontal/vertical extent, overlap, edge-reveal, motion, and animation
  cadence primitives.
- `tui/scroll-probe.wm` — deterministic row easing, reversal, and partial-viewport probe.
- `app/scroll-navigation-probe.wm` — shared-axis navigation, backward movement, rapid reversal,
  header-only animation, and background-event regression probe; run with
  `wm run app/scroll-navigation-probe.wm`.
- `tui/kitty.wm` — Bluesky PNG fetching and direct Kitty graphics APC/chunk generation.
- `tui/image-host.wm`, `tui/image-worker.wm` — worker lifecycle, bounded image queue/cache, and
  image decoding/encoding outside the input thread.
- `tui/image-host-probe.wm` — offline worker, cancellation, PNG decoding, and cache regression
  probe; run with `ATVIEW_IMAGE_BACKEND=sixel wm run tui/image-host-probe.wm`.
- `tui/host-identity.wm` — weak asset identities and bounded content sharing for small image-cache keys.
- `bench/scroll-bench.wm` — offline navigation/animation preparation and render timing with
  cold and cached worker output; run with `ATVIEW_IMAGE_BACKEND=sixel wm run bench/scroll-bench.wm`.
- `bench/navigation-bench.wm` — offline synchronous versus worker-backed selection timing; run
  with `ATVIEW_IMAGE_BACKEND=sixel wm run bench/navigation-bench.wm`.
- [Sixel scrolling](docs/sixel-scrolling.md) — implementation boundaries and retained
  scroll-region diagnostic: `wm run tui/sixel-scroll-demo.wm` (`j/k`, `r`, `q`).
- `tui/sixel-viewport-probe.wm` — pixel clipping and source-scale regression probe.
- `tui/sixel-partial-probe.wm` — cached top/bottom crops, reversal, cell-row strips,
  and in-flight crop replacement; run with `ATVIEW_IMAGE_BACKEND=sixel wm run tui/sixel-partial-probe.wm`.
- `tui/halfblock-partial-probe.wm` — first-pass crop caching and pixel/alpha sampling in both
  directions; run with `ATVIEW_IMAGE_BACKEND=half wm run tui/halfblock-partial-probe.wm`.
- `bench/image-crop-bench.wm` — cold worker preparation, main-loop responsiveness, and prepared
  crop assembly using a local PNG: `ATVIEW_IMAGE_BACKEND=sixel wm run bench/image-crop-bench.wm -- /path/to/image.png`
  (also supports `ATVIEW_IMAGE_BACKEND=half`).
- `tui/sixel.wm` — hand-written sixel encoder: 6x6x6 palette, six-row bands, run compression.
- `tui/terminal-cap.wm` — image-protocol detection and backend-to-renderer mapping.
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
