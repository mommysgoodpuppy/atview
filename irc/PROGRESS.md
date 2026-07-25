# Workman IRC client stress-test log

## Constraints

- The client and all supporting project code must be Workman (`.wm`).
- No TypeScript or JavaScript shim files.
- Host functionality may be reached only through Workman's direct JavaScript FFI.
- A compiler/runtime limitation is an acceptable outcome when captured with a minimal reproduction.

## Intended vertical slice

1. Parse IRC protocol lines into typed Workman values.
2. Format registration and user commands (`NICK`, `USER`, `JOIN`, `PRIVMSG`, `QUIT`).
3. Maintain basic client state and react to `PING`, numeric welcome, messages, joins, and errors.
4. Open a TCP connection directly from Workman.
5. Accept terminal input directly from Workman.
6. Exercise the client against a deterministic local IRC dialogue if the host APIs are reachable.

## Progress

- 2026-07-24: Read the Workman syntax, Task, carrier, JS FFI, and JS error documentation.
- 2026-07-24: Confirmed the installed CLI is Workman 0.1.16 on Deno 2.9.2.
- 2026-07-24: Rejected the initial shim design; the project now has a strict zero-TS/zero-JS rule.
- 2026-07-24: The upstream `portscan.wm` example proves direct `Deno.connect` is expressible, but an
  IRC client additionally needs byte allocation, incremental reads, decoding, framing, writes, and
  concurrent terminal input. Node's evented `net.Socket` may expose a smaller direct-FFI surface, so
  that route is being probed first.
- 2026-07-24: The direct `node:net` evented-socket probe typechecks.
- 2026-07-24: Implemented typed IRC parsing and command formatting in `protocol.wm`.
- 2026-07-24: Protocol tests pass for PING, numeric welcome, NOTICE, PRIVMSG, prefixes, trailing
  parameters, and outbound registration/message commands.
- 2026-07-24: Implemented a functional TCP line-framing loop. A recursive `once("data", ...)`
  callback captures the previous incomplete suffix, avoiding mutable references.
- 2026-07-24: Live local-server testing passed registration, a numeric welcome split across TCP
  chunks, coalesced welcome/PING lines, automatic JOIN/PONG, and inbound PRIVMSG rendering.
- 2026-07-24: Interactive input failed under `wm run` but passed unchanged after `wm compile`
  followed by `deno run`. Outbound channel text, `/msg`, and `/quit` were observed byte-for-byte by
  the local server.
- 2026-07-24: Final piped integration run exited cleanly with client/server status 0 and produced,
  in order, `NICK`, `USER`, channel `PRIVMSG`, direct `PRIVMSG`, and `QUIT`.
- 2026-07-24: Fixed stdin inheritance in wm-mini's `src/run.ts`, added a CLI regression test, and
  reran the complete IRC send path successfully through ordinary `wm run`.
- 2026-07-24: Refactored `parse` from nested `Result.andThen` callbacks into locally lifted
  `Result` transformations and one flat carrier pipeline. Treating `Monad.lift Result` like an
  effect annotation makes the procedure stages and their carried failure much easier to scan.
- 2026-07-24: Verified Libera.Chat's official endpoint is `irc.libera.chat:6697` with TLS.
- 2026-07-24: A pure Workman `node:tls` probe completed certificate-verified TLS and read live
  server NOTICE traffic from `platinum.libera.chat`.
- 2026-07-24: Converted the full client from plaintext `node:net` to TLS. Automatic channel joining
  was removed; joining is an explicit user command.
- 2026-07-24: The full client registered as `wmstress724e` on Libera.Chat, printed live server
  notices, received numeric `001`, and quit cleanly without joining a channel.
- 2026-07-24: Flattened `configFromArgs` using one lifted port parser, `Result|...|`, and the nominal
  `Config` constructor instead of nested `Result.andThen` callbacks.
- 2026-07-24: A second full-client session printed the complete live Libera.Chat registration
  stream: numerics `002` through `005`, network/user counts, the `375`/`372`/`376` MOTD sequence,
  and the final user mode. It then sent `QUIT` and observed the server close cleanly.
- 2026-07-24: Connected to `irc.tilde.chat:6697` with TLS, completed registration, and explicitly
  joined `#bots`. The client parsed and displayed the topic (`332`), topic metadata (`333`), names
  list (`353`/`366`), its own `JOIN`, and a real channel `PRIVMSG` from `Lamb3`. It sent no channel
  messages and quit cleanly.

## Issues and observations

### OBS-001 — Repository is intentionally not a Git worktree

`/home/ellie/git/testing-wm` has no `.git` directory. Changes are still kept isolated under
`irc/`, and no commit will be attempted.

### OPEN-001 — Direct socket stream ergonomics

Status: investigating.

The direct Deno path is known to connect, but it is not yet known whether Workman's FFI can express
the full duplex byte-stream loop without a shim. The two candidate routes are:

- reflected `node:net` `Socket` callbacks with `setEncoding("utf8")`;
- reflected `Deno.Conn.read`/`write` with `Uint8Array` and `TextDecoder`.

Every failed route will be reduced to a `.wm` probe and its exact diagnostic recorded here.

### ISSUE-002 — No carriage-return string escape

Status: workaround available.

The parser rejects `"\r"` with:

```text
Expected "\"", "\\\"", "\\\\", "\\n", or "\\t" but "\\" found.
```

IRC wire lines require CRLF. `protocol.wm` obtains the missing character directly through an unsafe,
manually typed import of `String.fromCharCode(13)` and appends the supported `"\n"` literal. This
keeps the project shim-free, but a `\r` escape would remove an unnecessary host dependency from
protocol formatting.

### OBS-003 — A generic equality assertion cannot be inferred

The natural test helper `(name, actual, expected) => actual == expected` fails because unconstrained
`'a` does not admit equality. Tests instead compare concrete values at each call site and pass the
resulting `Bool` to a polymorphic-free `assertTrue`. This is sound, but makes a basic reusable test
assertion less ergonomic without an equality constraint or comparator argument.

### OBS-004 — `process.stdin` and `process.stdout` need manual declarations

The direct namespace attempt:

```wm
from js.global("process") import unsafe * as process;
process.stdin
```

produced a generated-location mismatch between `Result<Js.Value, Js.Error>` and `Js.Value`;
`unsafe` does not make derived receiver/property access unsafe. A named reflected import then
reported `unknown JS import process.stdin`. The working direct-FFI form is:

```wm
from js.global("process") import {
  stdin: Js.Value,
  stdout: Js.Value,
};
```

The two safe values can be collected with `Result|stdin, stdout|` and passed to
`node:readline.createInterface`. This is an escape hatch rather than a blocker.

### RESOLVED-005 — `wm run` did not inherit stdin

Status: fixed locally in wm-mini on 2026-07-24.

Symptoms:

- `readline.Interface.on("line", callback)` returns `Ok` and prints that the listener registered,
  but the callback is never invoked under `wm run`;
- a lower-level typed `process.stdin.on("data", callback)` behaves the same way;
- socket event callbacks in the same program work;
- the equivalent direct Deno/Node readline diagnostic receives input;
- the exact JavaScript emitted by `wm compile` receives input when launched with `deno run -A`.

The runner implementation in Workman 0.1.16 constructs its child as:

```ts
new Deno.Command(Deno.execPath(), {
  args: [...],
  stdout: options.stdout ?? "inherit",
  stderr: options.stderr ?? "inherit",
})
```

No `stdin` option is provided, so Deno gives the generated child a null stdin instead of inheriting
the parent terminal. This prevents any interactive Workman application from working through the
normal `wm run` entrypoint.

Reproduction:

```sh
printf 'hello\n' | wm run irc/readline-probe.wm
# prints only: listener registered

wm compile irc/readline-probe.wm /tmp/readline-probe.mjs
printf 'hello\n' | deno run -A /tmp/readline-probe.mjs
# prints: listener registered
#         read: hello
```

The runner now supplies `stdin: "inherit"` to `Deno.Command`. A regression test launches the CLI
with piped stdin and checks that a Workman child reading fd 0 receives the exact text.

Verification after the fix:

```text
cli run passes stdin through to the Workman program ... ok
38 CLI tests passed
deno task check passed
```

The IRC client also completed a local `wm run` integration with client/server exit status 0 and the
server receiving `NICK`, `USER`, channel `PRIVMSG`, direct `PRIVMSG`, and `QUIT`.

### ISSUE-006 — Dynamic callback passes `check` but fails later in compilation

Status: compiler phase-consistency defect; typed workaround available.

When `process.stdin` is manually declared as `Js.Object`, `.on("data", callback)` is invoked, and
the callback performs the nested dynamic call `chunk.toString()`,
`wm check irc/dynamic-stdin-probe.wm` reports `ok`, while `wm run` fails before execution with:

```text
unresolved FFI call reached Core elaboration
```

Declaring the foreign value as `node:tty.ReadStream` makes the receiver method reflectable and
avoids the late failure. The concern is that `check` accepts a program which the compiler cannot
lower, with no source location or authored diagnostic at the later failure.

### OBS-007 — Repeated inherited `TLSSocket.write` reflection is fragile

Calling `socket.write(...)` in both the `secureConnect` callback and the `data` callback made the
second call fail checking with:

```text
TLSSocket is not a record type
```

Centralizing the receiver access in `sendWire(socket, wire)` lets all call sites reuse the inferred
foreign method and typechecks. This is a useful carrier/procedure shape anyway, but the original
diagnostic is misleading: `TLSSocket` is a reflected foreign class and the inherited method exists.
