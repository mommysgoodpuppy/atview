# Buffer workaround audit, 2026-11-05

Retested with WM 0.6.0 at `d4e418c` and its preceding global-generic/primitive
receiver fixes. No changes to WM source were made by this audit.

Removed from atview:

- `Buffer.prototype.toString.call` plus the result assertion; direct
  `buffer.toString("base64")` works again.
- The extra-copy `Png.fromBytes` factory and its callers. Direct `Png.Pixels`
  construction across modules works.
- Duplicate local byte readers/writers in sixel and probes. Imported
  `Png.byte`/`Png.writeByte` work across modules.
- Opaque constructor imports and Reflect.construct for WeakMap/Map. The normal
  `.new()` calls and identity probe pass.
- The manually typed Uint8Array.from adapter. A normal safe reflected import
  checks in the full graph once the remaining buffer boundaries are retained.

Still needed:

- `Buffer.copyBytesFrom` at the dynamic pixel-data and inflated-buffer
  boundaries. `Buffer.from` there yields `Buffer<Js.Value>` instead of a
  concrete backing type, conflicting with `Pixels.bytes: Buffer<ArrayBuffer>`.
  An independent deflate/inflate/Buffer.from/Holder example reproduces it.
- The prototype-call/copy boundary for `Buffer.subarray` in sixel row strips.
  A single-file `Buffer.alloc → subarray → Holder<Buffer<ArrayBuffer>>` example
  still fails in delayed FFI resolution. The subarray result is not merely a
  cross-module global identity problem.
- `util/shared-cells.wm`. Direct Int32Array construction, individual Atomics
  operations, and a simple wait/load composition now check in isolation. The
  actual worker-parent graph still selects an ArrayBuffer-only signature and
  rejects SharedArrayBuffer when the direct constructor replaces this helper.

Validation after cleanup:

- `wm check repl.wm`, `wm check app/main.wm`.
- Image-host/worker probes with both half-block and sixel backends.
- Half-block and sixel partial-crop probes; sixel viewport and identity probes.
- Mocked fetchPost → show(Image) pipeline with Kitty, sixel, and half-block
  backends, with network and credential-file access denied.
- The Workman worker + Atomics probe still returns 42 from an asynchronous Task.

Remaining reductions are recorded in the sibling WM local issue tracker:
`buffer-from-loses-concrete-backing-type.md`,
`buffer-subarray-loses-concrete-backing-type.md`, and the retest note in
`int32array-sharedarraybuffer-constructor-overload.md`.
