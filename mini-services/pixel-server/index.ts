/**
 * PixelParty real-time server.
 *
 * Architecture (adapted from the PartyKit design for this single-port
 * sandbox): one socket.io room per PixelParty room. Canvas state lives
 * entirely in process memory and is ephemeral — rooms are GC'd after
 * ROOM_TTL_MS of inactivity.
 *
 *   Browser A  <—WebSocket—>  this server  <—WebSocket—>  Browser B
 *                       (real-time canvas state)
 *
 * Connect from the browser with:
 *   io("/?XTransformPort=3004", { transports: ["websocket"] })
 *
 * The Caddy gateway inspects the XTransformPort query param and
 * reverse-proxies to localhost:3004 (path "/" preserved).
 */

import { createServer } from "http";
import { Server } from "socket.io";
import {
  EVENTS,
  DEFAULT_CANVAS_SIZE,
  ROOM_TTL_MS,
  colorForPlayer,
  type CanvasSize,
  type JoinPayload,
  type SetSizePayload,
  type PlacePayload,
  type CursorPayload,
  type PixelColor,
  type Player,
} from "../../src/lib/pixel-party/constants";

// Sandbox uses 3004; hosting platforms (Render/Railway/Fly) inject PORT.
const PORT = Number(process.env.PORT) || 3004;

interface RoomState {
  size: CanvasSize;
  /** Flat array length size*size, row-major (y*size + x). null = empty. */
  pixels: PixelColor[];
  /** socket.id -> Player */
  players: Map<string, Player>;
  lastActivity: number;
}

const rooms = new Map<string, RoomState>();

function emptyPixels(size: CanvasSize): PixelColor[] {
  return new Array(size * size).fill(null);
}

function getOrCreateRoom(roomId: string): RoomState {
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      size: DEFAULT_CANVAS_SIZE,
      pixels: emptyPixels(DEFAULT_CANVAS_SIZE),
      players: new Map(),
      lastActivity: Date.now(),
    };
    rooms.set(roomId, room);
    console.log(`[room] created ${roomId} (${DEFAULT_CANVAS_SIZE}x${DEFAULT_CANVAS_SIZE})`);
  }
  room.lastActivity = Date.now();
  return room;
}

function syncRoomTo(io: Server, roomId: string, room: RoomState, socketId?: string) {
  const payload = {
    size: room.size,
    pixels: room.pixels,
    players: Array.from(room.players.values()),
    yourId: socketId ?? "",
  };
  if (socketId) {
    io.to(socketId).emit(EVENTS.SYNC, payload);
  } else {
    io.to(roomId).emit(EVENTS.SYNC, payload);
  }
}

/** Garbage-collect inactive rooms every 5 minutes. */
setInterval(() => {
  const now = Date.now();
  let removed = 0;
  for (const [id, room] of rooms) {
    if (room.players.size === 0 && now - room.lastActivity > ROOM_TTL_MS) {
      rooms.delete(id);
      removed++;
      console.log(`[room] gc'd ${id} (inactive)`);
    }
  }
  if (removed > 0) console.log(`[gc] removed ${removed} rooms, ${rooms.size} active`);
}, 5 * 60 * 1000);

const httpServer = createServer();
const io = new Server(httpServer, {
  path: "/",
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 5 * 1024 * 1024, // 5MB — large enough for a 64x64 full sync
});

io.on("connection", (socket) => {
  let currentRoomId: string | null = null;
  const player: Player = { id: socket.id, color: colorForPlayer(socket.id) };

  socket.on(EVENTS.JOIN, (data: JoinPayload) => {
    const roomId = data?.roomId;
    if (!roomId || typeof roomId !== "string") return;

    // Leave any previous room first.
    if (currentRoomId && currentRoomId !== roomId) {
      leaveRoom(socket, currentRoomId, player, io);
    }

    currentRoomId = roomId;
    const room = getOrCreateRoom(roomId);
    socket.join(roomId);
    room.players.set(socket.id, player);

    // Send the new client the full current state.
    syncRoomTo(io, roomId, room, socket.id);

    // Tell everyone else a player joined.
    io.to(roomId).emit(EVENTS.PLAYER_JOINED, {
      player,
      playerCount: room.players.size,
    });

    console.log(`[join] ${socket.id} -> ${roomId} (${room.players.size} players)`);
  });

  socket.on(EVENTS.PLACE, (data: PlacePayload) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room || !Array.isArray(data?.pixels)) return;

    const size = room.size;
    const cleaned = [];
    for (const p of data.pixels) {
      if (
        typeof p?.x !== "number" ||
        typeof p?.y !== "number" ||
        p.x < 0 || p.x >= size ||
        p.y < 0 || p.y >= size
      )
        continue;
      room.pixels[p.y * size + p.x] = p.color;
      cleaned.push({ x: p.x, y: p.y, color: p.color });
    }
    room.lastActivity = Date.now();
    if (cleaned.length === 0) return;

    // Broadcast only the diff to everyone else in the room.
    socket.to(currentRoomId).emit(EVENTS.PLACED, {
      playerId: socket.id,
      pixels: cleaned,
    });
  });

  socket.on(EVENTS.CURSOR, (data: CursorPayload) => {
    if (!currentRoomId) return;
    if (typeof data?.x !== "number" || typeof data?.y !== "number") return;
    // Throttle is the client's job; just relay.
    socket.to(currentRoomId).emit(EVENTS.CURSOR_BROADCAST, {
      playerId: socket.id,
      x: data.x,
      y: data.y,
      color: player.color,
    });
  });

  socket.on(EVENTS.SET_SIZE, (data: SetSizePayload) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;
    const size = data?.size;
    if (![16, 32, 64].includes(size)) return;

    room.size = size;
    room.pixels = emptyPixels(size);
    room.lastActivity = Date.now();

    io.to(currentRoomId).emit(EVENTS.SIZE_CHANGED, {
      size: room.size,
      pixels: room.pixels,
    });
    console.log(`[size] ${currentRoomId} -> ${size}x${size}`);
  });

  socket.on(EVENTS.CLEAR, () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;
    room.pixels = emptyPixels(room.size);
    room.lastActivity = Date.now();
    io.to(currentRoomId).emit(EVENTS.CLEARED, { size: room.size });
    console.log(`[clear] ${currentRoomId}`);
  });

  socket.on("disconnect", () => {
    if (currentRoomId) leaveRoom(socket, currentRoomId, player, io);
    console.log(`[disconnect] ${socket.id}`);
  });

  socket.on("error", (err: unknown) => {
    console.error(`[socket error] ${socket.id}:`, err);
  });
});

function leaveRoom(
  socket: import("socket.io").Socket,
  roomId: string,
  player: Player,
  io: Server
) {
  const room = rooms.get(roomId);
  socket.leave(roomId);
  if (room) {
    room.players.delete(socket.id);
    room.lastActivity = Date.now();
    io.to(roomId).emit(EVENTS.PLAYER_LEFT, {
      playerId: socket.id,
      playerCount: room.players.size,
    });
    // Note: we keep the room in memory so art persists; GC handles removal.
  }
}

httpServer.listen(PORT, () => {
  console.log(`PixelParty real-time server running on port ${PORT}`);
});

process.on("SIGTERM", () => {
  console.log("[shutdown] SIGTERM");
  httpServer.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  console.log("[shutdown] SIGINT");
  httpServer.close(() => process.exit(0));
});
