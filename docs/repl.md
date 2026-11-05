# Browsing Bluesky with Workman

`repl.wm` returns completed values. Query a feed, then use ordinary list
operations to select what to display. No `await`, `Task.map`, or `Task.andThen`
is needed for the default REPL API.

## Username → feed → filter → first image

Start `wm repl` from the atview directory and enter:

```wm
from "../repl.wm" import *;

profile("hotbloodedheroine.petplay.fi").did
  :> feed(30).posts
  :> List.findMap(post => post.image)
  :> match {
    Some(image) => image :> show(Image.source),
    None => print("No image posts in this page"),
  };
```

Replace the handle with the account you want to browse. `feed` already returns
full typed posts, including image metadata, so fetching every post URI again is
unnecessary. `show(Image)` downloads only the selected post's first image.

Feed entries can include reposts and replies. This selects the first
image-bearing entry in the requested page of 30 entries; it may be someone
else's post that this account reposted. It does not scan the entire history.
Filtering for images may skip a newer text-only post.

## Run the same composition once

WM's interactive prompt currently resolves imports from a temporary
subdirectory, hence `../repl.wm`. A script saved in atview's root imports
`./repl.wm` instead.

Save this as `browse.wm`, replace the handle, and run `wm run browse.wm`:

```wm
from "./repl.wm" import *;
let main = () => {
  profile("username.bsky.social").did
    :> feed(30).posts
    :> List.findMap(post => post.image)
    :> match {
      Some(image) => image :> show(Image.source),
      None => print("No image posts in this page"),
    }
};
```

`List.findMap` returns the first image it finds, and `show(Image.source)` draws it.
Use `List.mapPartial` instead if you want every image. Call-result selectors
also work after a pipe: `did :> feed(30).posts` gets the page's posts directly.
There are no special "newest post" or "image post" helpers.

## Exclude reposts

When you need the resolved DID again in a predicate, bind it once:

```wm
let did = profile("username.bsky.social").did;
did
  :> feed(30).posts
  :> List.filter(post => post.author.did == did)
  :> List.findMap(post => post.image)
  :> match {
    Some(image) => image :> show(Image.source),
    None => print("No authored image posts in this page"),
  };
```

Replies still count as authored posts. Pins are excluded by the feed query.
To select the newest authored post whether or not it has an image, use
`List.at(0)` and `show(Image)`, which takes a whole post. Rendering a text-only
post reports `post has no image`.

## Compose image steps

Each step works on its own, so you can stop at any point:

```wm
let post = "at://did:plc:ACTOR/app.bsky.feed.post/POST_KEY" :> fetchPost;
post.image :> Option.map(Image.load) :> Option.map(Image.draw);
```

- `Image.load` downloads a post's image and returns it.
- `Image.text` returns the terminal text for a loaded image without drawing it.
- `Image.draw` draws a loaded image.
- `Image.source` loads and draws, so `show(Image.source)` starts from `post.image`.
- `show(Image)` starts from a whole post.

## Inspect intermediate values

Bind an intermediate result when you want to inspect or reuse it:

```wm
let page = feed("username.bsky.social", 30);
page :> show(Text);
page.posts :> List.map((post) => { (post.uri, post.text) }) :> show(Text);
```

`profile` returns a profile record, `feed` returns a page with `posts` and
`cursor`, and `fetchPost` returns a single post. Optional fields are real
Workman `Option` values, and post collections are normal Workman lists.

Queries wait until their result is ready before returning. Errors stop the
current evaluation with a readable message. If you need typed error recovery
or concurrent queries, use the asynchronous API described below.

## Render a known post URL

```wm
"https://bsky.app/profile/HANDLE/post/POST_KEY" :> fetchPost :> show(Image);
"at://did:plc:ACTOR/app.bsky.feed.post/POST_KEY" :> fetchPost :> show(Image);
```

Replace the placeholders with a real URL. `fetchPost` accepts Bluesky web links
and AT post URIs, including links with a query string or fragment. Use
`show(Text)` to inspect the post instead of rendering it.

`show(Image)` renders the first image, including image media attached to a
quote. It does not render videos or all images in a multi-image post. Images
appear inline without clearing the screen or entering the TUI.

The renderer selects Kitty, sixel, or colored half blocks based on the terminal.
To force a backend:

```sh
ATVIEW_IMAGE_BACKEND=half wm run browse.wm
```

## Fetch another page

Pagination is explicit. Keep the returned cursor and request another page when
you want to scan further:

```wm
let first = feedPage("username.bsky.social", 30, None);
match(first.cursor) {
  Some(cursor) => {
    let second = feedPage("username.bsky.social", 30, Some(cursor));
    second.posts :> show(Text)
  },
  None => { print("No more pages") },
};
```

Apply your predicate to each page and decide whether to continue. This keeps
the amount of history you fetch under your control.

## Authentication

Public profiles, author feeds, and post queries do not require login. For your
Following feed or search, configure `.env` as described in the README:

```wm
let me = login();
let home = timeline(me, 30, None);
home.posts :> show(Text);
search(me, "workman", 10) :> show(Text);
```

`me` is a completed account value. Printing it displays the handle and DID,
with tokens held behind a function. `refresh(me)` returns a new account; keep
that returned value for later authenticated calls.

## When you want Tasks

The original asynchronous interface is available as `Async` or by importing
`repl-async.wm` directly. For example:

```wm
Async.feed("username.bsky.social", 30)
  :> Task.map((page) => { page.posts :> List.map((post) => { post.text }) })
  :> Async.show(Async.Text);
```

Use it for concurrent work or `Task.orElse`/`Task.recover` error handling. Keep
sync and async account values separate: `login()` returns an account, while
`Async.login()` returns a Task containing an async account.

## Execution and REPL replay

The default facade starts a Workman worker for each query, calls the existing
protocol API there, and waits with `Atomics`. Completed values cross a typed
wire boundary and are reconstructed with the existing Workman view decoders.
Image bytes are loaded by the existing image loader in the worker, then the
caller renders synchronously. No TypeScript shim or second implementation of
the Bluesky endpoints is involved. Each worker terminates before the call
returns.

WM still re-evaluates earlier interactive phrases on each new phrase. Queries,
logins, and image output can repeat, and earlier results can change. The
synchronous facade removes Task callbacks and asynchronous output from the
normal interaction; it does not make WM's session persistent. Use a script for
one-time execution. The async interface also retains WM's asynchronous replay
output limitation.

See the [API reference](../README.md#bluesky-in-the-wm-repl) for the available
queries. Offline checks:

```sh
wm run util/sync-rpc-probe.wm
ATVIEW_IMAGE_BACKEND=half wm run app/repl-sync-probe.wm
```
