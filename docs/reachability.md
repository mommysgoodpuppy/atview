# Viewports and resource reachability

Painting and preloading use different bounds. `tui/reachability.wm` represents:

- A `Viewport` with a visible rectangle and a larger nearby rectangle, in the
  surface's content coordinates.
- A keyed `Surface` with a semantic navigation distance. Distance zero is the
  active surface; distance one is a destination reachable by one action.
- A resource `Candidate` with its surface key, bounds, and application value.

`expand` builds the nearby rectangle and clips it to content bounds. `rank`
returns candidates once, ordered by visible active content, adjacent destination frames, then nearby
active content and farther destinations. Overlapping windows do not duplicate
candidates. The application supplies semantic links; screen coordinates alone do
not establish reachability between tabs or screens.

`tui/runtime.wm` adds `runRetainedManagedPrepared`. Its preparation hook receives
application state, freshly queried terminal geometry, and previous retained render
memory before startup paint, input paint, and background-completion paint. It can
return background resource work through ordinary `Command` steps. Existing managed
runtime entry points keep a no-op preparation hook. Preparation does not wait for
image/network tasks before drawing.

## Atview policy

`app/render.wm` exposes its pure `project` function. `app/preload.wm` uses that
same projection, rather than estimating the viewport from selected post count.

The active feed preloads two viewports above and four below its visible frame. A
scroll animation's destination is nearby even during a large jump. Previous and
next tabs (including wraparound) have explicit semantic links: both their first
frame and remembered selection's landing frame are reachable. Only those two
neighbors have their initial page fetched; their neighbors are not recursively
expanded. Failed speculative pages wait for a visit/retry.

Visible posts take priority, followed by adjacent-tab frames, then nearby posts.
At most 16 posts have media loading concurrently. Each post can load an avatar
and image; completions refill the budget. Loading resources are marked across all
copies of a post URI, and later pages reuse resources already loaded or in flight.
Loads continue during scroll animation. Inactive page/media completions preserve
active navigation.

`Ui.preload` walks an element tree without painting it. `Ui.preloadWithin` uses
an explicit larger resource clip instead of the image element's paint clip, so
images entirely outside the actual screen can be prepared before scrolling. Ready images are decoded
and encoded in a separate cache-only worker queue, using the destination frame's
actual image geometry and clipping. Foreground rendering takes priority over that
queue. Full-screen clears cancel stale placements but preserve warming work;
activating a destination reuses cached output or attaches a real placement to an
in-flight encoding. Warm completions do not write to the current terminal view.
Kitty uses the already downloaded PNG directly; sixel and half-block need this
additional preparation step. The worker retains up to 256 prepared image families
and bounds its warming queue to the same capacity. Nearby sixel families are
position-independent and include reusable row strips, so entering the viewport
does not require fresh decoding, scaling, or crop encoding.

Bluesky's optional image `aspectRatio` is decoded before downloading pixels, so
fit-mode placeholders can reserve their expected final height. Without metadata,
the placeholder uses at most two rows and displays a loading label. Such images
can still reflow when dimensions become known. Fill mode retains its requested
frame height.

## Frame costs

Animation-only ticks reuse the prepared current and landing windows. Navigation,
geometry/scale changes, and resource/page completions invalidate the plan through
an explicit resource version. Large jumps keep warming intermediate windows until
they are covered by the landing margin. Planning projects layout once, visits only
reachable feeds, and avoids rebuilding duplicate destination frames.

Image cache keys use short native identity numbers. A weak object map makes repeat
lookups independent of PNG size; bounded content interning preserves sharing for
separate copies of the same encoded avatar. PNG bytes are no longer concatenated
into every cache/queue key or re-encoded to base64 during scroll preparation.

`bench/scroll-bench.wm` measures preparation and rendering separately with eight
synthetic feeds, 60 posts per feed, and 128 KiB encoded image strings. It reports
new-navigation passes, animation-only ticks, and the same paths after worker output
is cached. This measures application CPU work, not terminal graphics throughput.

## Verification

```sh
wm run tui/reachability-probe.wm
ATVIEW_IMAGE_BACKEND=kitty wm run app/preload-probe.wm
ATVIEW_IMAGE_BACKEND=kitty wm run app/image-layout-probe.wm
ATVIEW_IMAGE_BACKEND=sixel wm run app/next-tab-image-probe.wm
ATVIEW_IMAGE_BACKEND=sixel wm run bench/scroll-bench.wm
```

The preload probe injects fake media and page tasks; the next-tab image probe
uses a real embedded PNG and worker encoding, including an image entirely below
the active viewport before any scroll input. Neither performs network requests. `tui/prepare-probe.wm` is an interactive PTY fixture for startup,
background, input, resize geometry, and retained-memory delivery.

Half-block output follows the same cache-family rule as sixel: screen position
and vertical viewport clipping are placement data, not raster identity. The
worker prepares rows for the full logical image once. First-time top/bottom
crops select those rows immediately, while horizontal clipping uses a separate
family that preserves the original sampling scale. `tui/halfblock-partial-probe.wm`
checks both directions and fit/fill against original unclipped cell samples.

`bench/image-crop-bench.wm` accepts a local PNG and measures cold preparation,
main-loop timer intervals during that work, output size, and 300 crop frames
including conversion to terminal bytes. It asserts that no new crop queues an
encoding job. It does not measure the terminal emulator's graphics decoding or
compositing time. Downloaded reproduction images belong outside the repository.
