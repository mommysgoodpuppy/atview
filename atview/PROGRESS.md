# Workman AT Protocol AppView CLI stress-test log

## Constraints

- Application code is Workman.
- No `@atproto/*` runtime dependency or generated SDK client.
- XRPC requests are assembled and sent directly over HTTPS.
- Official AT Protocol lexicons may be cloned under `research/` and used as schemas/reference data.
- Findings and compiler/runtime blockers are preserved as small probes.

## Intended vertical slice

1. Generic public XRPC GET transport with explicit application errors.
2. Profile lookup by handle or DID.
3. Author feed rendering and cursor pagination.
4. Post/thread lookup by AT URI, including recursive union handling.
5. Post search.
6. Later: identity/PDS discovery, authenticated sessions, and writes without importing the SDK.

## Research

- Official `bluesky-social/atproto` repository cloned sparsely at commit `102503c`.
- Checked the live lexicons for:
  - `app.bsky.actor.getProfile`
  - `app.bsky.feed.getAuthorFeed`
  - `app.bsky.feed.getPostThread`
  - `app.bsky.feed.searchPosts`
  - shared actor and feed view definitions
- Public requests will target `https://public.api.bsky.app/xrpc/<NSID>`.

## Progress

- 2026-07-24: Defined the initial CLI scope and cloned the official lexicons without adding an SDK
  dependency.
- 2026-07-24: Implemented generic XRPC query encoding and a carrier-oriented fetch/status/JSON
  pipeline with explicit transport, HTTP, and response-shape errors.
- 2026-07-24: Implemented typed profile projection. Live lookup of `atproto.com` returned its DID,
  display name, description, and counts.
- 2026-07-24: Implemented typed author-feed projection. A live three-post request decoded nested
  authors, opaque post records, timestamps, metrics, AT URIs, and a pagination cursor.
- 2026-07-24: Implemented recursive thread decoding using the Lexicon `$type` union. A live depth-2
  thread rendered the root and two replies.
- 2026-07-24: Implemented post search transport/decoding. The public AppView returned HTTP 403,
  matching the Lexicon warning that this endpoint may require authentication.
- 2026-07-24: Added direct `com.atproto.server.createSession` authentication and in-memory session
  projection. Tightened `atview/.env` permissions from `0644` to `0600`.
- 2026-07-24: Added quoted/unquoted dotenv parsing after the first request revealed that literal
  quote characters were being sent as part of both credentials.
- 2026-07-24: Authenticated successfully, then routed search through the PDS with the access JWT.
  Live search returned a hit count, typed posts, and a cursor.
- 2026-07-24: Implemented `com.atproto.server.refreshSession` with the refresh JWT. Live token
  rotation succeeded and returned the same handle/DID without rendering either token.

## Issues and observations

### RESOLVED-001 — Optional JSON object fields

AppView view records have few required fields and many omitted optional fields. Before declaring
typed projections, verify whether `Json.assert` maps a missing property into `Option<T>` or requires
every nominal Workman record field to exist.

Resolution: `Json.assert` does not perform the adaptation. It leaves raw `undefined`, string, or
`null` values in a field statically typed as `Option<String>`, and an exhaustive `Some`/`None` match
fails at runtime. `json-option-probe.wm` is the reproduction.

The working boundary manually declares `Reflect.get` as returning `Option<Js.Value>`. Workman's FFI
then performs its normal nullish conversion, after which the present value is asserted to the
required type. `json-optional-adapter-probe.wm` demonstrates missing -> `None`, present -> `Some`,
and null -> `None`.

### RESOLVED-002 — Opaque record payloads and recursive unions

`postView.record` is Lexicon `unknown`, while `thread` is a recursive union of thread, missing, and
blocked variants tagged by `$type` or distinguishing fields. A useful client should not erase the
entire response to `Js.Object`; the implementation will look for the narrowest checked boundary that
still preserves the recursive Workman-side model.

Resolution for the initial slice: required post-view fields are asserted into a nominal wire record;
the opaque `record` field is separately asserted to the required `app.bsky.feed.post` projection.
Thread nodes inspect `$type` through the optional-property adapter and recursively decode
`threadViewPost`, `notFoundPost`, and `blockedPost`, retaining an explicit unknown variant.

### ISSUE-003 — Exported Task procedure fails delayed Response FFI specialization

Status: same-module workaround confirmed.

`xrpc.wm` typechecks when its generic `query` procedure is not used. Importing it into `api.wm` and
calling it from concrete endpoint functions fails during the second delayed-FFI pass:

```text
cannot pass unresolved JS FFI result as a call argument before FFI reflection resolves
the member access: ... Response.ok
```

`Response.json()` remains unresolved in the same compiler state. The equivalent procedure shape is
known to work within a single module (`examples/weather.wm`), so the Response-touching procedure is
being instantiated beside the concrete endpoint functions to isolate cross-module specialization.

Moving the Response-touching carrier procedure into `api.wm`, beside its concrete callers, resolves
all FFI members and the live requests succeed. URL construction and error datatypes remain reusable
in `xrpc.wm`.

### OBS-004 — Dotenv values need syntax normalization

The supplied values were double-quoted. The first parser sliced everything after `KEY=` verbatim,
so the quote characters reached `createSession` and produced a clean 401. `auth.wm` now detects
matching single or double quotes and strips only the outer pair. No credential contents were logged
during diagnosis.

### OPEN-005 — PDS endpoint discovery

Authenticated calls currently use the Bluesky entryway at `https://bsky.social`, which works for the
configured account and correctly proxies AppView calls. A provider-neutral client should resolve
the account DID document's `#atproto_pds` service endpoint rather than assume the Bluesky entryway.
