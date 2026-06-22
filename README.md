# PixelParty

> Draw pixel art together, in real time. Create a room, share the link, and make
> something with your friends. No sign-up, no install, free forever.

PixelParty is a real-time collaborative pixel art canvas. Open the page, agree to
the terms, create a room, share the URL, and draw together live — seeing each
other's pixels and cursors appear as you go.

**V1 · Jeffrey Hamilton** · [Donate](https://buymeacoffee.com/jeffreyscof)

---

## What it does

- **Land on the page → agree to Terms & Privacy → start.** A one-time consent
  gate (stored in `localStorage`) covers the no-data, no-tracking promise.
- **Unique room URLs** like `/?room=ABC123` — share the link, friends join and
  draw together in real time.
- **Live cursors & pixels** from everyone in the room.
- **Tools:** pencil, line, rectangle (with drag preview), fill bucket, eraser,
  eyedropper.
- **Full color picker** — any color via the native picker or hex entry.
- **Adjustable canvas:** 16×16, 32×32, 64×64 (selector in the toolbar).
- **Clear canvas** button in the toolbar.
- **Export PNG** of the finished art.
- **Theme-aware** — light/dark mode changes the whole UI including the canvas
  area (no flat dark box in light mode).
- **Rooms are ephemeral** — state lives in server memory and is garbage-collected
  after 24h of inactivity. No accounts, no stored user data, no tracking.

---

## Tech stack

| Layer | Choice |
|------|--------|
| Framework | Next.js 16 (App Router) + TypeScript |
| Styling | Tailwind CSS 4 + shadcn/ui (New York) |
| Real-time | socket.io (see *Architecture* below) |
| State | React refs + `requestAnimationFrame` (hot path bypasses React state) |
| Icons | lucide-react |
| Package manager | `bun` |

### Architecture

```
Browser A  ◄──WebSocket──►  socket.io server (port 3004)  ◄──WebSocket──►  Browser B
                                 (ephemeral in-memory
                                  per-room canvas state)
```

- One socket.io **room** per PixelParty room (room ID = the URL code).
- Canvas state = a flat array of hex colors (or `null`), held in server memory
  and broadcast as diffs.
- On join: the server sends the full current canvas (`sync`).
- On pixel place: the client sends a batched `place`; the server updates state
  and broadcasts only the diff to others.
- 24h GC of inactive rooms.

The wire protocol (event names + payloads) is defined once in
[`src/lib/pixel-party/constants.ts`](src/lib/pixel-party/constants.ts) and shared
by the frontend and the server, so the real-time layer is portable: in this
sandbox it's a socket.io mini-service reachable through a Caddy gateway
(`?XTransformPort=3004`); in production you can deploy the same server anywhere
or port the handlers to PartyKit with no client changes.

---

## Project structure

```
src/
  app/
    layout.tsx              # metadata, favicon, ThemeProvider (dark default)
    page.tsx                # Suspense + <PixelPartyApp/> router
  components/
    pixel-party/
      pixel-party-app.tsx   # terms gate + routes Landing vs Room by ?room=
      terms-modal.tsx       # Terms & Privacy gate (gate mode) / viewer (view mode)
      landing.tsx           # create / join screen
      room.tsx              # header + sidebar/bottom bar + canvas + footer
      header.tsx            # logo, room code, player count, export, share, settings
      pixel-canvas.tsx      # canvas (rAF rendering, 6 tools, shape preview, cursors)
      toolbar.tsx           # pencil / line / rectangle / fill / eraser / eyedropper
      color-picker.tsx      # full native color picker + hex input
      size-selector.tsx     # 16 / 32 / 64 segmented control
      room-code.tsx         # click-to-copy room code
      share-button.tsx      # copies the full room URL
      settings-dropdown.tsx # theme toggle, donate, privacy, terms
      footer.tsx            # centered "V1 · Jeffrey Hamilton"
      logo.tsx              # flat SVG pixel-grid mark
      theme-provider.tsx    # next-themes wrapper
  hooks/
    use-pixel-room.ts       # socket.io connection + in-memory pixel state (refs)
  lib/
    pixel-party/
      constants.ts          # protocol types & event names (shared), room-code gen
mini-services/
  pixel-server/
    index.ts                # socket.io real-time server (port 3004)
    package.json
public/
  favicon.svg               # pixel-grid icon
```

---

## Run locally (sandbox)

```bash
# 1. Install dependencies
bun install

# 2. Start the real-time server (port 3004)
cd mini-services/pixel-server
setsid --fork bun index.ts        # detach so it survives the shell exiting
cd ../..

# 3. Start the Next.js app (port 3000)
bun run dev
```

Open the app through the gateway at **`http://localhost:81/`** (Caddy routes
`?XTransformPort=3004` → the real-time server, everything else → Next.js).

> The mini-service must be started with `setsid --fork` (or equivalent) so it
> reparents to init and survives across shell calls; plain `&` backgrounding gets
> reaped when the spawning shell exits.

---

## Deploy (GitHub → Vercel + real-time host)

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "PixelParty v1"
# create an empty repo on GitHub, then:
git remote add origin https://github.com/<you>/pixelparty.git
git branch -M main
git push -u origin main
```

`.gitignore` is already configured (ignores `node_modules`, `.next`, `*.log`,
`.env*`, `.vercel`, `db/*.db`, etc.).

### 2. Frontend → Vercel

1. Import the repo at [vercel.com/new](https://vercel.com/new).
2. Framework preset: **Next.js**. No build overrides needed —
   `package.json` `build` is `next build`, `next.config.ts` has no
   `output: "standalone"`.
3. Add the environment variable:
   - `NEXT_PUBLIC_REALTIME_URL` = the origin of your deployed real-time server
     (e.g. `https://pixelparty-rt.onrender.com`).
4. Deploy. Vercel builds the frontend; the client connects to your real-time
   server via `NEXT_PUBLIC_REALTIME_URL` (falls back to the sandbox
   `?XTransformPort=3004` gateway pattern when unset).

### 3. Real-time server → any Node/Bun host

`mini-services/pixel-server/` is a standalone socket.io server. Deploy it to any
host that supports persistent processes + WebSockets (Render, Railway, Fly.io, a
VPS, etc.):

```bash
cd mini-services/pixel-server
bun install
bun index.ts        # listens on process.env.PORT (defaults to 3004)
```

> **Root directory:** on Render/Railway set the service's root directory to
> `mini-services/pixel-server`. The full repo is checked out, so the server's
> `../../src/lib/pixel-party/constants` import resolves. The host injects `PORT`
> automatically — the server reads `process.env.PORT` (falls back to 3004).

Make sure CORS allows your Vercel origin (the server already sets
`cors: { origin: "*" }` — tighten this for production).

Set the deployed server origin as `NEXT_PUBLIC_REALTIME_URL` on Vercel and
redeploy the frontend.

> **PartyKit alternative:** the event handlers in
> [`mini-services/pixel-server/index.ts`](mini-services/pixel-server/index.ts)
> map 1:1 to PartyKit's `onConnect`/`onMessage`. You can port them to a
> `partykit/server.ts` and `npx partykit deploy` with no client changes — the
> protocol in `src/lib/pixel-party/constants.ts` is identical.

---

## Performance notes

- **Dirty-cell rendering:** the canvas redraws only changed cells each frame via
  a `requestAnimationFrame` loop — never a full repaint per pixel.
- **Refs over state on the hot path:** pixel and cursor updates mutate refs and
  drive the canvas directly; only low-frequency events (join/leave/size/connect)
  touch React state.
- **Shape previews** (line/rectangle) render on a dedicated overlay canvas,
  committed only on pointer-up.
- **Batched sends:** rapid placements are buffered and flushed every 50ms.
- **Cursor throttle:** outgoing cursor moves are throttled to 30fps.
- **Mobile:** canvas is width-constrained; `touch-action: none` keeps drawing
  smooth; bottom bar holds picker + size + clear + scrollable tools.

---

## Author

**Jeffrey Hamilton** — [Donate](https://buymeacoffee.com/jeffreyscof)

PixelParty stores no user data and tracks nothing. Rooms expire after 24h of
inactivity.
