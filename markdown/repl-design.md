# REPL design

The atview REPL should feel like a classical functional session, such as SML's. You get values, apply
functions to them, and combine the results. There's no command language, and nothing to learn beyond
a few names and the standard library.

`markdown/repl-sync.md` covers how the worker and transport are built. `docs/repl.md` is the user
guide. This document covers how the API should feel, and how to decide what belongs in it.

## Principles

### Everything is a value

A query returns a finished typed value that you can bind, pass around and take apart.

```wm
let page = readFeed(author("username.bsky.social"), 3);
page.posts :> map(post => post.text);
```

A bare expression binds `it`, as it does in SML, so the next phrase can use it. Task plumbing is
behind `Async` for people who need concurrency or typed recovery.

### Use the common names first

`map` and `filter` are pervasive, and they're what someone from an SML session reaches for first.
Examples use them before anything more precise.

```wm
posts :> map(post => post :> show(Post));
```

`forEach` is the more correct choice when only the effect matters, because `map` also produces a
result, here `[void, void, void]`. We accept that noise, and examples still start with `map`. WM's
`forEach` plays the role of SML's top-level `app`, which WM doesn't have as a bare name. `List.app`
exists too.

### Sources are values too

A feed is a `Feed` value that reads itself, so you choose one from a list like anything else and
pass it along a pipeline. Signed-in feeds keep their session inside, the way `Account` does, so the
account doesn't have to travel with them. `author(handle)` makes one for a person, and `feeds(me)`
lists Following and your pinned feeds.

```wm
login() :> feeds
  :> List.find(feed => feed.title == "For You")
  :> Option.valOf :> Result.debug
  :> readFeed(3).posts
  :> map(post => post :> show(Post));
```

### Selection is composition

There are no helpers like `newestImagePost` or `postsWithImages`. Picking things out of a list is the
job of ordinary list functions, and if an example is awkward, that's a reason to improve the general
functions. `List.findMap` was added to WM for this reason, rather than a feed-specific query.

```wm
posts :> List.findMap(post => post.image) :> Option.app(show(_, Image.source));
```

### `show` takes a value and something that can show it

`value :> show(Renderer)` is the one way to display something. A renderer is an ordinary module whose
`carrier` is a function from the value, so `Post`, `Image` and `Text` all work the same way, and
`show` knows nothing about any of them.

| Renderer | Takes | Does |
|---|---|---|
| `Text` | anything | prints the value |
| `Post` | a post | prints it as text, with `<image>` for an image, and loads nothing |
| `Image` | a post | loads and draws its image |
| `Image.source` | `post.image` | loads and draws that image |

Don't add option flags or variants like `Post.withImage`, and don't add list versions of a renderer.
Say what you want in a lambda, and let `map` handle lists:

```wm
posts :> map(post => {
  post :> show(Post);
  post.image :> Option.app(show(_, Image.source))
});
```

### Each step works alone

Anything a renderer does in several steps should also be available one step at a time, so that you can
stop partway and keep the value. An image goes `post.image`, `Image.load`, `Image.text`, `Image.draw`.
Each one has a useful result without the steps after it.

### Effects stay where you can see them

Printing and drawing happen in `show` and `draw`. Anything else returns a value and doesn't write to
the terminal. Network use should be obvious from the call too, which is why `Post` downloads nothing
and images are something you ask for.

### Data comes first

Functions take their main value first, so pipelines read left to right. A field can be read from any
expression, and in a pipeline the input goes into the first call:

```wm
"username.bsky.social" :> profile :> show(Text);
profile("username.bsky.social").did :> author :> readFeed(30).posts;
```

These correspond directly to SML, so the API should stay easy to explain in those terms:
`profile(handle).did` is `#did (profile handle)`.

### Sync and async have the same shape

`repl.wm` and `repl-async.wm` use the same names: `show`, `Post`, `Image`, `Image.load`. The async
versions return Tasks. `show` is the one real difference: its sync version takes a value, and its
async version takes a Task and also reports the Task's errors. Anything added to one should be added
to the other.

## Trust

Post content, display names and handles are written by other people, so they're untrusted.

- Anything printed raw goes through `PostText.clean`, which removes control characters, because
  escape sequences could otherwise clear the screen, fake output or, on some terminals, set the
  clipboard.
- The REPL quotes and escapes the strings it shows. Don't work around that to display something.
- Credentials stay behind a function in the `Account` value, so printing an account can't show them.

## Testing a new addition

- Can you write it with `map`, `filter` and a lambda instead? If so, don't add it, unless the general
  version is awkward. In that case improve the general function.
- Is it a value, or does it need a new way of working? It should be a value.
- Does it print or use the network without that being clear from the call?
- If it displays something, is it a renderer that works through `show`?
- Is it the same in `repl.wm` and `repl-async.wm`?
- Would an SML programmer read the example without having it explained?

## Known gaps

- **No custom printing of values:** typing `it;` can't redraw an image, because the REPL has one fixed
  way to print. Some SML implementations let you register a printer per type. This is
  `repl-lacks-custom-pretty-printers.md` in `../wm-mini/markdown/issues/`.
- **`Async.Text`:** a namespace re-exported from `repl-async.wm` can't be reached through
  `import * as Async`, so `Async.show(Async.Text)` in `docs/repl.md` doesn't compile. This is
  `reexported-namespace-unreachable-through-namespace-import.md` in the same place.
- **Replay:** the WM REPL replays earlier phrases, so reads, logins and image output can repeat. See
  `markdown/repl-sync.md`.
- **Missing pervasives:** SML's bare `app`, `foldl`, `rev` and `hd` aren't available. WM has `forEach`
  and `foldLeft` as bare names, and `List.hd` and `List.reverse` when qualified.
- **Function composition:** `o` isn't shown in examples yet, because `o(print, Text.of)` doesn't
  type-check. Finding out why is still to do.
