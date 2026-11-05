// Test worker only. Install before Workman's imported host functions initialize.
import { Buffer } from "node:buffer";
import { deflateSync } from "node:zlib";

function crc(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let i = 0; i < 8; i++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(kind: string, bytes: Buffer): Buffer {
  const type = Buffer.from(kind), output = Buffer.alloc(bytes.length + 12);
  output.writeUInt32BE(bytes.length); type.copy(output, 4); bytes.copy(output, 8);
  output.writeUInt32BE(crc(Buffer.concat([type, bytes])), output.length - 4);
  return output;
}
const header = Buffer.alloc(13);
header.writeUInt32BE(2); header.writeUInt32BE(2, 4); header[8] = 8; header[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header),
  chunk("IDAT", deflateSync(Buffer.from([0,255,0,0,255,255,0,0,255,0,255,0,0,255,255,0,0,255]))),
  chunk("IEND", Buffer.alloc(0)),
]);
const own = "did:plc:test";
const text = "hello \"quoted\" 🦋\nsecond line";
function post(key: string, author = own, image = true) {
  return {
    uri: `at://${author}/app.bsky.feed.post/${key}`, cid: `cid-${key}`,
    author: { did: author, handle: author === own ? "test.example" : "other.example", displayName: null },
    record: { text, createdAt: "2026-11-05T00:00:00Z" }, indexedAt: "2026-11-05T00:00:01Z",
    likeCount: 3, viewer: { like: null },
    ...(image ? { embed: { $type: "app.bsky.embed.images#view", images: [{
      thumb: "https://cdn.bsky.app/thumb@jpeg", fullsize: "https://cdn.bsky.app/full@jpeg",
      alt: "red 🦋", aspectRatio: { width: 2, height: 2 },
    }] } } : {}),
  };
}
const session = { handle: "test.example", did: own, accessJwt: "fake-access", refreshJwt: "fake-refresh" };
Deno.readTextFile = async (path: string | URL) => {
  if (path !== ".env") throw Error("fixture forbids file reads");
  return 'USER="test.example"\nAPPPASS="fake-password"\n';
};
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(String(input));
  if (url.hostname === "cdn.bsky.app") {
    if (!url.pathname.endsWith("@png")) throw Error("expected existing PNG URL conversion");
    return new Response(png, { headers: { "content-type": "image/png" } });
  }
  if (!["public.api.bsky.app", "bsky.social"].includes(url.hostname)) throw Error("fixture forbids network");
  const method = url.pathname.split("/").at(-1);
  const token = new Headers(options.headers).get("authorization");
  if (method === "com.atproto.server.createSession") {
    const credentials = JSON.parse(String(options.body));
    if (credentials.identifier !== "test.example" || credentials.password !== "fake-password") throw Error("unexpected credentials");
    return Response.json(session);
  }
  if (method === "com.atproto.server.refreshSession") {
    if (token !== "Bearer fake-refresh") throw Error("wrong refresh token");
    return Response.json(session);
  }
  if (url.hostname === "bsky.social" && token !== "Bearer fake-access") throw Error("missing access token");
  if (method === "com.atproto.identity.resolveHandle") return Response.json({ did: own });
  if (method === "app.bsky.actor.getProfile") {
    if (url.searchParams.get("actor") === "error.example") return Response.json({ error: "NotFound" }, { status: 404 });
    return Response.json({ handle: "test.example", did: own, displayName: null, followersCount: 0 });
  }
  if (method === "app.bsky.feed.getPostThread") {
    const uri = url.searchParams.get("uri") ?? "";
    if (uri.endsWith("/missing")) return Response.json({ thread: { $type: "app.bsky.feed.defs#notFoundPost", uri, notFound: true } });
    if (uri.endsWith("/blocked")) return Response.json({ thread: { $type: "app.bsky.feed.defs#blockedPost", uri, blocked: true } });
    return Response.json({ thread: { $type: "app.bsky.feed.defs#threadViewPost", post: post("image"), replies: [{
      $type: "app.bsky.feed.defs#threadViewPost", post: post("reply", own, false),
    }] } });
  }
  if (method === "app.bsky.feed.searchPosts") return Response.json({ posts: [post("image")], cursor: "search-next", hitsTotal: 1 });
  if (method === "app.bsky.actor.getPreferences") return Response.json({ preferences: [{
    $type: "app.bsky.actor.defs#savedFeedsPrefV2", items: [{ type: "feed", pinned: true, value: "at://feed" }],
  }] });
  if (method === "app.bsky.feed.getFeedGenerator") return Response.json({ view: { displayName: "Fixture feed" } });
  if (["app.bsky.feed.getAuthorFeed", "app.bsky.feed.getTimeline", "app.bsky.feed.getFeed", "app.bsky.feed.getListFeed"].includes(method ?? "")) {
    if (url.searchParams.has("cursor")) return Response.json({ feed: [] });
    return Response.json({ feed: [post("repost", "did:plc:other"), post("text", own, false), post("image")].map(post => ({ post })), cursor: "next-page" });
  }
  throw Error(`unhandled fixture request: ${method}`);
};
export function ready(): boolean { return true; }
