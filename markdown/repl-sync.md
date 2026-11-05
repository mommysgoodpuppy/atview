# Completed-value REPL API

Implemented in `repl.wm`. Runnable guide: `docs/repl.md`.

The default functions return completed Workman values. Selection remains an
ordinary composition over lists and options; there are no hardcoded
newest/image-post query helpers. The original Task facade lives in
`repl-async.wm` and is also exported as `Async`.

## Ownership

- `util/sync-rpc.wm`: generic worker handshake, shared UTF-8 reply transport,
  exact-size allocation, bounded waiting, and termination on success/failure.
- `util/sync-rpc-worker.wm`: generic Task request listener and error replies.
- `util/shared-cells.wm`: narrow JS FFI construction boundary for shared views;
  direct Int32Array construction still fails in the complete worker graph.
- `app/repl-worker.wm`: installs `app/repl-operations.wm` in a Workman worker.
- `app/repl-operations.wm`: argument adapters which call the existing API,
  authentication, pinned-feed discovery, and image-loader implementations.
  No XRPC endpoints, authentication procedure, or fetch implementation is
  duplicated here.
- `app/repl-codec.wm`: typed transport codecs. Records cross as protocol-shaped
  JSON and use the existing view decoders on receipt. Runtime constructor IDs,
  singleton objects, closures, and Buffer methods do not cross the boundary.
- `app/repl-client.wm`: selects the worker artifact; its internal URL injection
  lets offline probes reuse the dispatcher while replacing host I/O.
- `tui/repl-image.wm`: requests the existing image loader in the worker, then
  renders the completed image on the caller through `tui/inline-image.wm`.

Account/session closures are created locally after transferring the session's
string fields. Printing an account does not print JWTs. The worker never logs
API result data. Image terminal sequences are emitted by the caller before the
synchronous display returns, avoiding forwarding them through a blocked event
loop.

One worker is created and terminated for each call. A separate handshake buffer
handles initialization: full module initialization can yield before installing
the message listener, so an immediate first request can be lost. Handshake
pings are safe to repeat and use a different buffer from the operation. The
operation and collection phases each run once; collecting an oversized reply
does not repeat the operation. UTF-8 output allocation uses the completed byte
length rather than a fixed response-size limit.

Waiting on an already-started Task in the caller remains unsupported: blocking
that thread would prevent its completion. The operation starts in the worker.
No TypeScript shim is used by the runtime; the TS file in the probe is fake I/O
for tests only.

## Limits and checks

The WM REPL still replays old phrases. This facade removes Task plumbing and
async output ordering from the default interaction but does not make the
session persistent. Existing reads, logins, and image output can repeat.
Each bootstrap/operation/collection wait is bounded. A worker that fails to
initialize produces a timeout rather than leaving a live worker behind.

- `wm run util/sync-rpc-probe.wm`: Task completion, UTF-8, empty and large
  replies, and worker errors.
- `ATVIEW_IMAGE_BACKEND=half wm run app/repl-sync-probe.wm`: real facade and API
  through fake I/O, including normal list composition, cursors, local thread
  constructors, auth, error propagation, and image rendering.
- Run the sync REPL probe with kitty and sixel as well for renderer coverage.

The old `awaitTask` design was a WM-level proposal, not the user-facing API.
It is superseded here by ordinary completed-value calls through Workman workers
and JS FFI Atomics.
