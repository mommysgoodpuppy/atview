# Sixel scrolling

Atview is a terminal client. It can send cell-based scroll commands and sixel
rasters, but it cannot access the emulator's textures or apply fractional pixel
transforms to text or graphics. A terminal can animate a scroll operation at
pixel granularity; that animation belongs to the terminal.

## Current implementation

- Sixel feed images and avatars are no longer intentionally hidden during scroll
  animation. Other backends keep their existing behavior.
- Image viewport elements carry both the logical image rectangle and the clipping
  rectangle. Sixel crops the source at its original scale instead of fitting the
  whole image into the smaller visible rectangle. Feed media retains its logical
  height when a card intersects the bottom of the viewport.
- Worker output caches the raster separately from its cursor position. Moving an
  unchanged raster reuses the encoding. Pending placements follow their latest
  requested position; cancelled placements cannot write stale coordinates.
- The worker prepares the full raster and independent cell-row strips from one
  resampled pixel buffer. Top/bottom crops select cached strips, including when
  both edges intersect the viewport. Prepared images need no new encoding as
  their visible height changes. Cache families include scale, horizontal crop,
  and cell height; resize or a horizontal crop change can still require encoding.
- Strips use transparent sixel backgrounds so padding in a six-pixel band cannot
  erase neighboring rows when the terminal cell height is not divisible by six.
- The normal feed renderer still clears/repaints the screen as its viewport moves
  and sends image bytes on repaint. This is not yet retained terminal-region
  scrolling, and terminal repaint behavior can still cause flicker.

The `imageViewport` element and `PlaceImageViewport` surface command provide true
source clipping for sixel. Kitty and half-block currently fit into the intersected
rectangle, preserving their previous clipping behavior.

## Test the terminal

Run inside the terminal (and tmux session, if used) that runs atview:

```sh
wm run tui/sixel-scroll-demo.wm
```

The demo deliberately sends sixel, independently of automatic backend detection.
Use a window at least 60 columns wide and 16 rows high. Press `j` and `k` to
scroll the left rectangle. The colored bands and adjacent text should move
together; the right pane and header should remain stationary. Press `r` to redraw
and `q` to exit. Content discarded at a region boundary does not return when the
direction reverses; redraw before another trial.

The image is transmitted once per initial paint, resize, or explicit redraw.
Scrolling sends only margin/scroll controls, without a screen clear or image
retransmission. This checks retention and horizontal/vertical margin behavior;
it does not establish whether the terminal animates those operations smoothly.
The PTY regression checks the emitted protocol, not emulator pixels.

## Partial-image regression

```sh
ATVIEW_IMAGE_BACKEND=sixel wm run tui/sixel-partial-probe.wm
```

This exercises both scroll directions, top/bottom clipping, images larger than the
viewport, non-six-aligned cell heights, fallback cell geometry, and in-flight crop
replacement. After preparation, visible crops must return output immediately with
no new worker jobs or delayed writes. `-- --dump` emits cases for independent
pixel decoding and comparison against the full raster.

## Next renderer step

Use retained region scrolling only on a verified terminal. The two-pane layout
requires both vertical and horizontal margins. Sixel support alone does not
establish those semantics. Keep the repaint path as a fallback.

For each committed row delta, scroll only the feed rectangle, translate retained
image anchors, invalidate or update pending worker placements, and paint exposed
rows. Images intersecting the exposed strip need source clipping without changing
scale. Repaint selection borders independently; preserve the header, footer, and
thread pane. Geometry changes, tab switches, and layout reflow need a full paint.
The terminal may animate the row operation; fractional motion cannot be guaranteed
by the sixel protocol.

## Sources

- [tmux's sixel-region-scrolling change](https://github.com/tmux/tmux/commit/efbd09e101c2fd47694d9318c3dd91f383db95c1)
  explicitly notes there is no query for whether a terminal scrolls sixel with a
  region, and supplies a visual test.
- [Rio changelog](https://rioterm.com/changelog) describes images as grid content,
  including scrolling inside regions and clipping by text/erase operations.
- [Xterm control sequences](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html)
  documents DECSTBM, DECLRMM/DECSLRM, and SU/SD used by the diagnostic.

- [DEC VT330/VT340 reference manual](https://vt100.net/dec/ek-vt3xx-hr-002.pdf)
  describes raster attributes and the sixel background parameter used by strips.
