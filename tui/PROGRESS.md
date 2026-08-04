# Workman terminal UI stress-test log

## Goal

Build a small reusable terminal UI library in Workman itself, then use the AT Protocol client as its
first real application. The implementation may call the host terminal APIs directly through
Workman's FFI, but does not import a general-purpose TUI library and does not use a handwritten
JavaScript or TypeScript shim.

The useful reference split is:

- **btop:** owns raw terminal mode, alternate-screen lifecycle, input polling/escape decoding, and
  emits large buffered ANSI draw strings.
- **lazygit/gocui:** models named rectangular views, runs layout for every input/resize event,
  dispatches bindings through the focused view, and retains rendered cells to flush stale content.

## Proposed layers

1. `ansi.wm`: terminal control sequences and cursor/style helpers.
2. `theme.wm`: exact RGB palette values and semantic default-theme inputs.
3. `geometry.wm`: sizes, rectangles, insets, and deterministic horizontal/vertical splits.
4. `event.wm`: raw byte-stream framing and decoding into a Workman key/event datatype.
5. `draw.wm`: immutable clipped drawing commands produced by widgets.
6. `screen.wm`: rasterization into rows plus previous/current row diffing.
7. `widgets.wm`: borders, titles, text, selectable lists, status/help bars.
8. `runtime.wm`: raw mode, alternate screen, cleanup, focus-aware update loop, and resize delivery.
9. `app.wm`: the ATProto browser model, asynchronous commands, and views.
10. `kitty.wm`: image fetching plus direct Kitty graphics protocol encoding for Ghostty-compatible
   terminals.

The event loop will carry the application model and previous screen through recursive one-shot
callbacks. This follows the already successful IRC stream-framing technique and avoids pretending
that Workman has mutable references.

## Progress

- 2026-08-04: Added reusable immutable row-scrolling primitives and connected the feed viewport to
  timer-driven easing. Variable-height cards can now enter and leave through a partially clipped
  top edge instead of snapping at post boundaries. Rapid navigation replaces the animation
  generation, stale timer patches are ignored, media is withheld during motion and restored on
  settle, Page Up/Down move by three posts, and SGR wheel reports drive a persistent free-row
  target without aligning the final viewport to a card boundary. Wheel input advances the
  lightweight selection/media cursor but does not start a thread request for every row gesture.
  `scroll-probe.wm` covers easing, reversal, exact arrival, shared borders, and viewport location;
  `event-pattern-probe.wm` now covers wheel decoding as well.

- 2026-07-24: Studied btop terminal initialization/restoration and key decoding, plus lazygit's
  layout pass, view model, focus/binding conventions, and stale-cell rendering.
- 2026-07-24: Chose immutable draw commands as the widget boundary. A renderer may later rasterize
  them to rows for diffing; exposing random-access mutable cells would be a poor fit for Workman's
  linked lists.
- 2026-07-24: Direct terminal probe compiled and ran in a PTY. Raw input, alternate screen, cursor
  control, batched output, arrow input, normal quit, and terminal restoration all worked through
  reflected Node APIs with no shim.
- 2026-07-24: Added the first reusable library slice: geometry/splits, key ADT, ANSI styles and
  drawing, boxed/text/fill widgets, terminal sizing, and an immutable generic event loop.
- 2026-07-24: The interactive demo rendered at the live 80×24 PTY size; arrow/j/k selection, focus
  switching, and cleanup on quit worked.
- 2026-07-24: A PTY write containing `j` and Tab in one chunk proved that stream chunks cannot be
  treated as keys. `decodeMany` now consumes multiple ordered keys and the runtime folds all updates
  before producing one frame.
- 2026-07-24: Connected the TUI to the real authenticated AppView client. It loaded 30 live author
  feed entries, rendered the selected post at 80×24, moved from entry 1 to entry 2 with `j`, and
  restored cursor/raw/alternate-screen state after `q`.
- 2026-07-24: Fixed the compiler staging blocker exposed by the generic TUI runtime. The relevant
  Workman FFI design is intentionally stricter than ordinary SML closure: unresolved `?ffi`
  placeholders are identity-stable obligations, and bindings crossing the FFI remain monomorphic so
  downstream module constraints can settle them. The defect was instead that post-resolution
  inference reused a dependency's already-constrained monomorphic export while recreating the
  consumer's nominal types, producing the nonsensical `FeedState != FeedState`. Contextual and
  post-resolution inference now rebuild a coherent whole-graph wave when reinference is required.
  A three-module compiler regression covers a generic FFI runtime, a delayed-reflection module, and
  a consumer-local nominal state.
- 2026-07-24: The real app also exposed two useful module-boundary requirements. A public Task result
  must have its nominal error type in scope (`AppError`), and record projections need the imported
  nominal record definition (`FeedPost`), even when another imported record contains a list of that
  type.
- 2026-07-24: Added the authenticated home timeline from
  `app.bsky.feed.getTimeline`. One login now starts the timeline and author-feed Tasks together and
  both reuse the existing `feedViewPost` decoder. The app starts on the timeline and switches to my
  posts with `m` and back with `t`.
- 2026-07-24: Added a functional scrolling viewport. End jumps to the final item and shifts the
  immutable list window so the selected row remains visible; live testing reached item 28/28.
- 2026-07-24: Live testing also found that `decode` recognized the common CSI Home/End sequences
  `ESC [ H` and `ESC [ F`, while `decodeMany` recognized only their numbered variants. Multi-key
  decoding now handles both forms consistently.
- 2026-07-24: Added typed decoding for the first image in `app.bsky.embed.images#view`, including
  the media nested inside `app.bsky.embed.recordWithMedia#view`. Non-image embeds remain ordinary
  posts rather than poisoning the whole feed decoder.
- 2026-07-24: The Bluesky thumbnail CDN serves WebP by default but accepts an `@png` suffix. The
  client requests that representation and sends the compressed PNG bytes directly, so inline
  images require neither a JavaScript/TypeScript shim nor an image-decoding dependency.
- 2026-07-24: Added a minimal Kitty graphics encoder: APC framing, PNG format declaration, quiet
  mode, explicit cell placement, and continuation chunks no larger than 4096 base64 bytes. The
  timeline preloads at most three image-bearing posts per feed and treats an individual failed
  image request as a missing preview.
- 2026-07-24: Live authenticated testing selected an image-bearing timeline post, displayed its alt
  text, and emitted a complete multi-chunk Kitty transmission. The first chunk declared
  `a=T,f=100,C=1,c=47,r=8,m=1` and the final chunk used `m=0`; normal quit still restored the
  terminal.
- 2026-07-24: Image encoding exposed a compiler/runtime interop defect. A named import of Node's
  callable `Buffer` constructor was automatically bound to the module namespace object, so
  `Buffer.from` received the wrong constructor identity and Node warned about deprecated
  `Buffer()`. Named module imports are now emitted unbound, while receiver-style reflected calls
  retain their separate receiver helper. A compiler regression exercises `Buffer.from` and an
  instance base64 conversion.
- 2026-07-24: Final verification checked the CLI, TUI app, TUI demo, terminal probe, and image
  metadata probe. The compiler JS-import, CLI-JS, and module suites passed 72/72, including both
  compiler regressions discovered by this project.
- 2026-07-24: Replaced distorted fixed-cell image sizing with explicit `fit` and `fill` policies.
  PNG dimensions are read directly from the IHDR header through the reflected Node `Buffer`; no
  decoder shim is involved. Fit computes both cell dimensions from the source pixels and the
  terminal's physical cell size. Fill computes a centered `x,y,w,h` source crop whose pixel aspect
  matches the destination cell rectangle.
- 2026-07-24: The runtime now sends the standard `CSI 16 t` query and consumes
  `CSI 6 ; height ; width t` reports as internal cell-size events. The render geometry therefore
  carries the terminal's actual cell pixel width and height instead of assuming that a character
  cell is square. Terminals that do not answer retain the conservative 1:2 fallback.
- 2026-07-24: Added `f` to switch the selected preview between aspect-preserving fit and
  crop-to-fill. A deterministic layout probe verified a width-limited centered fit and a centered
  `1000×400` crop into a 40×8-cell destination. A PTY test injected a 10×20-pixel cell report and
  confirmed that the runtime updated its metrics without forwarding the report as keyboard input.
- 2026-07-24: Ghostty rendered the single-axis fit placements as small squares in the real app.
  Fit now supplies both dimensions explicitly after doing the physical-pixel calculation itself.
  For example, the deterministic probe emits `c=40,r=5` for a 2000×500 image with 10×20-pixel
  cells: both source and destination are physically 4:1. The app also removed its hard eight-row
  cap; previews receive every free row below the post metadata.
- 2026-07-24: Added cursor-based pagination for both the authenticated timeline and own-posts
  views. Moving into the final three loaded entries returns an asynchronous runtime step, renders
  `loading…`, fetches the next 30-post page, preloads up to three more images, appends the results,
  and resumes input. Live testing grew a timeline from 28 to 54 posts and selected the first newly
  appended entry.
- 2026-07-24: Replaced the directory/detail split with a conventional single-column timeline.
  Each variable-height card now contains author identity, a bounded two-line word-wrapped excerpt,
  reply/repost/like counts, timestamp, and inline media. Ordinary posts stack three-up at 80×24;
  image posts expand to use up to twelve media rows while preserving the card viewport.
- 2026-07-24: The functional viewport computes card heights from text/media layout and advances its
  first visible index only far enough to keep the selection on screen. Live testing navigated
  mixed text/image cards, showed three adjacent text posts with the selected card highlighted, and
  paginated from 28 to 58 posts without returning to a separate detail pane.
- 2026-07-25: Compacted the card stream after real use exposed large unused regions. Cards no
  longer reserve a blank second text row for short posts or insert a spacer row between borders.
  Media height is capped at 60% of the viewport (within an 8–14-row card bound), and the renderer
  clips a final continuation card into the remaining rows instead of omitting the card and leaving
  the rest of the screen blank.
- 2026-07-25: Added typed actor-avatar projection and tiny inline profile pictures. The initial
  implementation converted AppView's `/img/avatar/plain/` URL directly to PNG, which downloaded
  1000×1000 images of roughly 170 KB each and delayed startup by about 25 seconds. Rewriting to
  Bluesky's `/img/avatar_thumbnail/plain/` route yields 128×128 PNGs around 18 KB. Avatars render
  crop-to-fill in a physically square two-row box whose column count is derived from the measured
  terminal cell dimensions.
- 2026-07-25: Adopted Helix's `adwaita-dark.toml` as the default terminal palette. A new Workman
  theme module holds the exact RGB values; drawing now emits 24-bit ANSI colors rather than lossy
  ANSI-256 approximations. The cleared frame uses `libadwaita_dark`; the initial role mapping used
  `split_and_borders`, `blue_2`, `blue_7`, and `libadwaita_dark_alt`. A PTY run verified the emitted
  color sequences and terminal cleanup.
- 2026-07-25: Tightened the timeline again by overlapping each card's bottom border with the next
  card's top border. Adjacent posts now use one separator row rather than a visually empty pair of
  border rows, and viewport height calculations account for the shared row.
- 2026-07-25: Replaced blue selection treatment with Adwaita's neutral surfaces. The selected
  author text is no longer styled differently; selection is communicated only by a `light_7`
  border, while inactive borders remain `split_and_borders`.
- 2026-07-25: Added retained snapshots to the generic Workman runtime and split the app renderer
  along actual dependencies, inspired by Reactive Surface Compositor's signal/effect command
  emission. Feed, view, image mode, viewport, or terminal-geometry changes produce a full frame.
  When those dependencies are stable, selection changes emit only the previous border, current
  border, and footer. A real timeline move produced no clear, Kitty delete, or image retransmission.
  Full structural frames use synchronized terminal updates so image replacement is presented
  atomically by supporting terminals.
- 2026-07-25: Tried the U+1D229 `𝈩` glyph for shared post boundaries, but its left side did not
  join reliably in the terminal font. Replaced it with the standard mirrored box-drawing pair
  `├…┤`. A card with another visible card below now owns a junction-shaped bottom edge as well as
  the next card owning the same top edge. Incremental redraw order and selection can therefore
  change the separator color without ever exposing `└…┘`. Live testing confirmed the shape before
  and after moving selection.
- 2026-07-25: Made the selected post a visually independent foreground card with all four square
  corners (`┌┐└┘`). Full rendering first draws the joined feed and then overlays the selected
  outline; incremental movement restores the old card's `├…┤` separators before overlaying the new
  selection. Live testing confirmed both transitions without a full redraw or image retransmission.
- 2026-07-25: Restored a responsive two-pane application layout. At 80 columns the current feed
  occupies 33 columns on the left and a 46-column selected-post pane occupies the right. Feed cards
  retain their tiny avatars but omit large media; the right pane gives the selected post up to six
  wrapped text rows, optional fit/fill media, metrics, and the remaining height for replies.
- 2026-07-25: Connected selection to authenticated `app.bsky.feed.getPostThread` requests with
  depth four. Startup loads the first thread, navigation renders a loading state, and successful
  responses recursively flatten typed reply nodes with indentation. Missing, blocked, unknown, and
  request-failure cases render explicit muted placeholders. Live testing displayed a real
  one-reply thread in the right pane.
- 2026-07-25: Preserved fine-grained navigation after adding the detail pane. Kitty transmissions
  now accept stable image IDs: feed avatars use IDs derived from their feed index and right-pane
  media uses ID 1. Selection deletes only ID 1, restores the old/new feed borders, clears and
  redraws the right pane, and updates the footer. A live move emitted roughly 3,000 tokens across
  loading and completion frames instead of retransmitting tens of thousands of tokens of avatars.
- 2026-07-25: Restored main post media to the compact left-hand timeline without sacrificing
  retained-image updates. Left media uses a stable ID derived from the feed index, while the
  selected post continues to use right-pane ID 1. Fit-mode placement now anchors to the left edge
  in both panes instead of centering a portrait image; the deterministic layout probe covers a
  portrait case and still preserves its aspect ratio.
- 2026-07-25: Enriched the recursive thread model with avatar thumbnails for every returned post.
  The selected author uses right-pane image ID 2000 and visible replies receive subsequent IDs,
  allowing selection changes to remove only the old detail images. A live authenticated thread
  rendered selected-post media and a reply avatar together.
- 2026-07-25: Moved post metrics below media. Timeline metrics now occupy the final interior card
  row, with the media allocation ending immediately above it. In the selected-post pane, the
  metrics row follows the text/media block and precedes the replies section.
- 2026-07-25: Bounded selection-driven reply work after a high-reply post could freeze the app.
  Thread requests now ask for depth two, the typed tree is pruned depth-first to the root plus at
  most twelve replies, and only that bounded tree starts concurrent avatar downloads. This retains
  nested replies without letting invisible nodes create unbounded image work.
- 2026-07-25: Reply avatars now share their node's depth indentation instead of all rendering at
  the thread pane's left edge. The avatar, author, and excerpt advance together by two columns per
  nesting level.
- 2026-07-25: Refined media geometry. Detail media may occupy up to fourteen rows. Timeline media
  uses the same x coordinate and width as text and metrics, leaving an avatar-sized gutter on its
  left rather than touching the card border.
- 2026-07-25: Replaced the trial fixed-width feed pane with a physical aspect calculation. Its
  character width is `body rows × cell height × 9 ÷ 19.5 ÷ cell width`, with safety clamps only for
  very small terminals and detail-pane viability. Ghostty's measured 80×24 frame produced a
  21-column feed and a 58-column detail pane.
- 2026-07-25: Replaced the next manual retained-region iteration with a carrier-based reactive
  graph modeled directly after Reactive Surface Compositor v0.2. `Signal.read` is a pure model
  projection that records its dependency key; `Reactive.map`, `map2`, `andThen`, and
  `Reactive|…|` propagate the keys actually read. Mounted effects retain those keys, rerun only
  when a transition intersects them, emit their previous cleanup first, and stage typed surface
  commands into one frame.
- 2026-07-25: Migrated selection, thread, and footer rendering onto mounted effects. Selection owns
  the cleanup command that restores its inactive border; thread completion dirties only the thread
  effect; footer state has its own subscription. Structural feed/layout changes still remount
  behind the existing full-frame fallback. A live unrelated keypress emitted zero terminal bytes,
  while selection and authenticated thread completion updated their subscribed regions.
- 2026-07-25: Added a deterministic reactive probe with a conditional detail subscription.
  Changing hidden detail data emits nothing, revealing it subscribes the effect, and later detail
  changes emit the update. The same probe exercises `Reactive|…|` invocation grouping.
- 2026-07-25: Replaced retained runtime suspension with a pure concurrent command loop.
  `Runtime.Spawn` carries an eager Task whose result is a state patch; terminal input and all
  outstanding patches race through `Task.race`, while the losing input handle is retained so no
  extra Node listener is installed. Every decoded key in a coalesced chunk is folded, navigation
  redraws immediately during reply and pagination work, `q` remains active, and stale thread
  patches check the currently selected URI before applying.
- 2026-07-25: Pagination completion now rebases onto the current model instead of replacing it with
  its pre-request snapshot. A live PTY test sent 26 down keys and five up keys around a page load:
  the feed grew from 28 to 55 posts while selection remained at 22/55, then `q` restored the
  terminal during remaining reply work. A separate 20-key coalesced write reached 21/28 without
  dropping the tail of the chunk.
- 2026-07-25: Added the first background view-graph scheduler. Thread URIs are explicit graph nodes
  in the immutable model with absent, pending, cached, and failed states. The selected timeline
  node plus two neighbors in each direction form a priority frontier. Selection consumes a cached
  thread synchronously, while newly exposed edges start independently through `Runtime.SpawnMany`;
  they are not hidden behind a `Task.collectList` barrier.
- 2026-07-25: Generalized the retained runtime with a post-completion scheduler. After a command
  patch rebases onto the latest model, the application derives another ordinary `Step` from that
  model. This lets a completed stale edge release a concurrency slot and immediately start the
  current frontier without mutable queues, ambient observers, or `await`. At most five thread
  expansions remain pending; completed nodes outside the five-node working set are pruned while
  pending nodes remain represented until they settle.
- 2026-07-25: Live graph testing started with three valid forward nodes at timeline position one,
  then moved onto an already-cached neighbor with its complete thread rendered immediately while
  one newly exposed edge loaded in the background. A coalesced ten-key jump reached 11/30, kept the
  visible pending count below the five-command bound, refilled the destination frontier as stale
  work completed, and later moved backward to another cached thread without a loading frame.
- 2026-07-25: Combined pagination and graph-load testing sent 27 down keys plus five up keys in one
  input chunk. The model immediately reached 23/30 with `loading…` and exactly five background
  thread expansions, then independently merged the page and graph completions to finish at 23/59
  with the selected thread ready. Pagination did not displace later navigation, graph Tasks did not
  wait for the page, and the terminal restored normally on quit.
- 2026-07-25: Replaced the nested terminal-sequence conditional stack with SML-shaped list-prefix
  matching. Workman has no separate `Char`, so an input chunk is exploded into
  `List<String>` containing one-character strings. Patterns such as
  `[escape, "[", "A", ..rest]` consume a key and recursively decode the unmatched tail. The
  variable-width cell-size response uses the same representation with a recursive
  positive-number parser rather than dropping back to string searches and splits.
- 2026-07-25: Added `event-pattern-probe.wm`. One coalesced input covers CSI and SS3 arrows,
  Shift-Tab, Page Up/Down, both Home/End encodings, `CSI 6;20;10t`, an ordinary character, and
  Ctrl-C. It evaluates to the expected twelve-event list and prints `event prefix patterns ok`.

## Issues and observations

### OPEN-TUI-001 — Guaranteed terminal restoration

Normal quit and `SIGINT` can explicitly disable raw mode, restore the normal screen, and show the
cursor. It is not yet known whether Workman can express a sufficiently reliable cleanup handler for
all synchronous FFI failures and invariant panics. A failed cleanup leaves the invoking terminal in
raw/alternate-screen mode, so this is a correctness requirement rather than polish.

### OPEN-TUI-002 — Incremental input decoding

Node stream chunks do not preserve terminal escape-sequence boundaries. The decoder must carry an
incomplete `ESC`/CSI prefix across callbacks and distinguish a lone Escape key from a prefix, which
normally requires a short timer. This will test immutable state, callbacks, and timer FFI together.

### OPEN-TUI-003 — Functional screen-buffer cost

Naively replacing cells in a `List<Cell>` is quadratic. The initial API therefore produces clipped
spans/drawing commands. We will measure whether row rasterization and row-level diffing are
sufficient, and only add a different persistent structure when evidence requires it.

### FIXED-TUI-004 — Asynchronous application events

Keyboard, resize, timer, and completed XRPC tasks all need to serialize through one update
function. JavaScript libraries use a mutable queue/channel here. A Workman-native runtime needs to
show that recursive callbacks can preserve ordering without leaking host mutation through the API.
The retained runtime now races one persistent input Task against a pure list of tagged command
Tasks. A command yields a `(State) => State` patch, so completion rebases onto the latest immutable
model. Input creates a fresh handle only after the prior input wins; background completions reuse
the losing handle and therefore cannot accumulate listeners.

### OBS-TUI-005 — Reflected stream methods work, `ReadStream.isTTY` does not

Importing `process.stdin` as Node's reflected `ReadStream` resolves inherited methods including
`setRawMode`, `resume`, `pause`, and `once`. Accessing its `isTTY` property fails checking with
`ReadStream is not a record type`. The runtime currently attempts `setRawMode(true)` and reports its
failure as the non-TTY diagnostic. Terminal dimensions use an explicit dynamic `Reflect.get`
boundary on stdout and successfully returned the PTY's 80×24 dimensions.

### OPEN-TUI-006 — Unicode cells and display width

The first chunk splitter uses JavaScript string indices, so non-BMP input may be split into UTF-16
surrogates. Drawing truncates by the same indexing model and does not yet account for grapheme
clusters, combining marks, or double-width terminal cells. Correct terminal text needs a
Workman-side width/segmentation policy or a narrow platform primitive.

### FIXED-TUI-007 — Staged FFI monotype retained an obsolete nominal type

`Runtime.run` deliberately stays monomorphic because its implementation crosses the Node FFI. The
initial whole-graph HM pass therefore allowed the app to settle its state variable to that pass's
`FeedState`. A later selective pass reused this mutated runtime result but reinferred the app,
creating a new nominal `FeedState` identity and reporting `FeedState != FeedState`.

Cloning imports or generalizing the FFI binding would violate the delayed-FFI model: `?ffi`
obligations and shared monotypes must retain identity while downstream constraints settle. The fix
is pass-level consistency: if contextualization or delayed FFI requires reinference, infer the
module graph together in dependency order rather than mixing results from different inference
waves.

### PARTIAL-TUI-008 — Image placement cache and redraw volume

The first image implementation deletes all terminal images and retransmits the selected PNG on
every application render. One real 1000×659 thumbnail produced roughly 256 KiB of captured terminal
output for a single frame. Stable image IDs now keep feed avatars mounted during selection and
thread updates, while right-pane media is deleted independently by ID. Structural changes such as
resize, pagination, view switching, and image scaling still delete and retransmit the complete
image set. A complete placement cache would retain encoded image data across those layout changes
and issue placement-only updates.

### OPEN-TUI-009 — Selection-driven image loading

The app preloads the first three image-bearing posts in each initial feed and each newly fetched
page. Avatar thumbnails are currently fetched concurrently for the entire page so later cards do
not lose their profile pictures. The merged command/input loop can now safely ignore stale
selection completions, but loading arbitrary media and avatars on demand and representing their
independent pending states remains unimplemented.

### OBS-TUI-010 — Initial embed coverage is intentionally narrow

The view decoder uses the first item in an images embed and follows the media arm of
`recordWithMedia`. Galleries, video thumbnails, external-card thumbnails, quoted-record images,
animated formats, and accessibility presentation beyond the visible alt-text row are not yet
implemented.

### OPEN-TUI-011 — Terminal reports share the incremental input problem

The cell-size query response is decoded when a complete `CSI 6 ; height ; width t` sequence arrives
at the start of a stream chunk. A terminal is allowed to split that response across chunks or
coalesce it with other input. Coalesced trailing input is already retained, but fragmented reports
need the same persistent byte framing and timeout policy as `OPEN-TUI-002`.

### FIXED-TUI-012 — Awaited work temporarily suspends input

`Runtime.Await` serializes one Task by drawing its pending model and installing the next input
listener only after completion. This makes pagination deterministic, but a slow or hung XRPC/image
request cannot currently be cancelled with `q`, and resize/key input during the wait may be lost.
The app now uses `Runtime.Spawn`, which keeps input and multiple tagged commands active together.
Commands return pure state patches rather than captured replacement states. Thread patches apply
only when their requested URI is still selected; page patches append into the current feed and
preserve current navigation. `Runtime.Await` remains as a compatibility path for older probes, but
new interactive code should use `Spawn`.

### OPEN-TUI-013 — Variable-height viewport scan cost

To keep the selected card visible without mutable scroll state, the first implementation repeatedly
sums card heights while advancing the candidate start index. This is simple and correct but
quadratic in the selected index, and dynamic pagination removes the old small upper bound on list
length. A single fold that retains prefix heights, or explicit scroll state updated from measured
layout, will be needed if long sessions make redraw latency visible.

### OBS-TUI-014 — Nested tuple patterns inside `Option` are not accepted

The retained renderer snapshot has type `Option<(State, Size)>`. Matching it directly as
`Some((oldState, oldSize))` produced `unknown pinned pattern oldState`; binding
`Some(snapshot)` and destructuring `snapshot` in a following `let` checks correctly. This is either
a missing nested constructor-pattern case or a diagnostic/parser defect, and is worth reducing in
the compiler suite separately.

### OPEN-TUI-015 — Synchronized-update capability detection

Structural redraws are enclosed in `CSI ? 2026 h` / `CSI ? 2026 l`, which Ghostty supports and
which prevents a delete-and-repaint image frame from becoming visible halfway through. The runtime
does not yet query support or provide a retained text/image placement fallback for terminals that
ignore this private mode. Selection-only updates do not depend on it for correctness because they
never clear the screen or touch image placements.

### OPEN-TUI-016 — Independent thread-pane navigation

The first dual-pane slice depth-first renders replies into the rows remaining below the selected
post and clips the rest. There is not yet a focus model or independent scroll position for the
thread pane, so a long or deeply nested conversation cannot be explored past the first viewport.
Adding pane focus and reply selection should build on the retained-region renderer rather than
making feed selection and thread scrolling share one index.

### FIXED-TUI-017 — Recursive thread avatar fan-out

The first depth-four thread projection fetched avatar thumbnails for the complete returned reply
tree before publishing `ThreadReady`. A high-fan-out post could therefore block input while
decoding and downloading images that the reply viewport would immediately clip. Requests now use
depth two, and a pure depth-first pass retains at most twelve replies before the bounded avatar
tasks start concurrently. Independent thread scrolling will eventually need viewport-driven
pagination, but selection latency no longer scales with the complete returned tree.

### FIXED-TUI-018 — Equality obligations ran before parameter annotations

Reducing region equality exposed that `(left: String, right: String) => left == right` failed with
`'a does not admit equality`. Workman deliberately checks annotations after inference so they
cannot masquerade as evidence for unresolved JavaScript FFI, but equality admissibility was being
rejected immediately instead of surviving until the annotation constraint settled. Equality is
now a deferred type-variable obligation: binding it checks the concrete type, while an unresolved
obligation still cannot generalize because Workman does not expose SML equality variables. The
compiler regression test and the existing function-equality rejection suite both pass.

### OBS-TUI-019 — Pure reactive authoring is explicit about reads

Without references or algebraic effect handlers, Workman cannot reproduce Solid's ambient
`activeObserver` getter syntax without hiding mutation in the host. The reactive carrier therefore
makes reads explicit and accumulates dependencies as ordinary values. This preserves dynamic
dependency semantics and the compositor's effect/frame architecture. Shared memoized computed
values remain a later design question because a single cache of heterogeneous result types would
need existential packaging; ordinary computed formulas already compose as `Reactive` values.

### OPEN-TUI-020 — Superseded commands are ignored, not cancelled

Thread patches are URI-guarded, so a late result cannot replace the current detail pane. The
underlying XRPC and avatar Tasks are eager, however, and `Task.race` deliberately does not cancel a
losing handle. The graph scheduler now prevents more than five thread expansions from remaining
pending and gives the current node first priority whenever a slot opens, but stale requests still
occupy those slots until completion. A later cancellation design should be an explicit command
capability (likely backed by `AbortSignal`) rather than hidden mutation in the runtime.

### PARTIAL-TUI-021 — The view graph currently projects only timeline-to-thread edges

The scheduler treats nearby timeline posts as nodes whose first outgoing resource edge is the
bounded post thread, including reply avatars. This proves deduplication, bounded parallel starts,
incremental completion, cache hits, and working-set pruning. Media not loaded during the initial
feed projection, deeper reply children, cursor pages, actor profiles, and quoted-record targets are
not yet independent graph resources. Those should become distinct node/edge variants rather than
adding more booleans and lists directly to `UiState`.

### OBS-TUI-022 — Generic equality helpers need an explicit concrete key type

The first graph membership helper compared unconstrained keys and therefore inferred the SML-shaped
need for an equality type variable. Workman intentionally does not expose equality-polymorphic
variables, so the helper cannot generalize until its key is concretized. Annotating the graph key as
`String` resolves the deferred equality obligation. This is consistent with the earlier compiler
fix, but graph algorithms make the missing SML equality-variable surface more noticeable.

### FIXED-TUI-023 — Ownership-based project layout

The client previously mixed protocol modules at the project root with application code inside
`tui/`, which made the reusable library boundary unclear and left `app.wm` near two thousand lines.
The project now has four explicit ownership roots:

- `proto/` for AT/XRPC/authentication and Lexicon projections;
- `tui/` for reusable terminal primitives, retained surfaces, and runtime infrastructure;
- `app/` for the atview model, transitions, graph scheduler, views, renderer, and entrypoints;
- `util/` for general helpers that may later become libraries or standard-library functions.

The interactive entrypoint is now 60 lines. Its former body is split by responsibility into
`model`, `data`, `graph`, `update`, feed/thread views, screen composition, and reactive rendering.
The pure command and concurrent scheduling algebra moved from the host runtime into
`tui/command.wm`, reducing `runtime.wm` from 627 to 435 lines without introducing references.

### OPEN-TUI-024 — Transitive imported nominal rejected as block-local

Moving image loading and retained rendering across application-module boundaries exposed a distinct
module inference defect. An imported function may carry a nominal type in its inferred signature,
but `inferBlock` accepts only nominal IDs explicitly present in the consumer's type environment.
It therefore reports `local type escapes scope` for dependency-owned types such as `AppError`,
`RenderModel`, and `RenderDependency`.

Explicitly importing those otherwise-unused types is a working but fragile workaround.
`app/image-boundary-probe.wm` retains a small checked reproduction. The compiler issue and likely
cause are recorded in:

```text
wm-mini/markdown/issues/transitive-imported-nominal-fails-block-escape-check.md
```

The earlier staged FFI/nominal-wave defect is separately documented as fixed in:

```text
wm-mini/markdown/issues/FIXED-staged-ffi-reinference-mixes-nominal-waves.md
```

### OPEN-TUI-025 — Named import collides with generated module binding

The reorganized entrypoint initially used:

```wm
from "./render.wm" import { render };
```

`wm check` passed, but `wm run` generated `const render = render.render` and Node rejected the
duplicate declaration before the application started. A distinct namespace import
(`* as Render`) is a working source-level workaround. The compiler issue is recorded in:

```text
wm-mini/markdown/issues/named-import-collides-with-generated-module-binding.md
```

### FIXED-TUI-026 — Feed and thread rendering used imperative string assembly

Feed cards and reply trees previously interleaved geometry, conditionals, recursive traversal, and
ANSI/Kitty string concatenation inside large blocks. This made the visible component hierarchy hard
to see and made reusable UI extraction mostly a matter of copying string-producing helpers.

`tui/element.wm` now defines a small recursive `Element` datatype:

```wm
type Element =
  | Empty
  | Fragment<List<Element>>
  | Text<Geometry.Rect, String, Draw.Style>
  | Lines<Geometry.Rect, List<String>, Draw.Style>
  | Fill<Geometry.Rect, String, Draw.Style>
  | Box<Geometry.Rect, String, Bool>
  | TimelineBox<Geometry.Rect, Bool, Bool, Bool>
  | Image<Number, Geometry.Rect, Kitty.Scale, Kitty.Image>;
```

Components are ordinary Workman functions returning `Element`. `fragment`, `showIf`, and `optional`
provide JSX-like composition without custom syntax, macros, ambient builders, or mutable child
buffers. A single total interpreter lowers the tree to the existing `Draw` and Kitty boundaries.

Feed cards, selected-post content, thread status, reply placeholders, and recursive reply posts now
compose elements. Reply traversal returns an immutable element plus its next row/image cursor;
reply geometry and reply presentation are separate functions. `element-probe.wm` deterministically
checks nested fragment ordering and conditional/optional omission.
