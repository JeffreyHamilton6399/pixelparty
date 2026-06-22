/**
 * PixelParty real-time server.
 *
 * One socket.io room per PixelParty room. Canvas state lives in process
 * memory (ephemeral, GC'd after ROOM_TTL_MS). Supports: host role (first
 * joiner), kick, viewer/mute roles, clear-canvas voting, and chat.
 *
 * Connect from the browser with:
 *   io("/?XTransformPort=3004", { path: "/" })   (sandbox / Caddy gateway)
 *   io(REALTIME_URL, { ... })                     (production, direct)
 */

import { createServer } from "http";
import { Server, type Socket } from "socket.io";
import {
  EVENTS,
  DEFAULT_CANVAS_SIZE,
  ROOM_TTL_MS,
  CLEAR_VOTE_TIMEOUT_MS,
  colorForPlayer,
  sanitizeName,
  type CanvasSize,
  type JoinPayload,
  type SetSizePayload,
  type PlacePayload,
  type ChatPayload,
  type KickPayload,
  type SetRolePayload,
  type PixelColor,
  type Player,
  type Role,
  type ChatMessage,
} from "../../src/lib/pixel-party/constants";

const PORT = Number(process.env.PORT) || 3004;

interface RoomState {
  size: CanvasSize;
  pixels: PixelColor[];
  players: Map<string, Player>;
  hostId: string;
  lastActivity: number;
  // Clear-canvas vote state.
  clearVote: {
    requesterId: string;
    yes: Set<string>;
    no: Set<string>;
    expiresAt: number;
    timer: ReturnType<typeof setTimeout> | null;
  } | null;
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
      hostId: "",
      lastActivity: Date.now(),
      clearVote: null,
    };
    rooms.set(roomId, room);
    console.log(`[room] created ${roomId}`);
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
    hostId: room.hostId,
  };
  if (socketId) {
    io.to(socketId).emit(EVENTS.SYNC, payload);
  } else {
    io.to(roomId).emit(EVENTS.SYNC, payload);
  }
}

function systemMessage(room: RoomState, text: string): ChatMessage {
  return {
    id: Math.random().toString(36).slice(2, 10),
    playerId: "system",
    playerName: "PixelParty",
    color: "#34d399",
    text,
    ts: Date.now(),
    system: true,
  };
}

/** Garbage-collect inactive rooms every 5 minutes. */
setInterval(() => {
  const now = Date.now();
  for (const [id, room] of rooms) {
    if (room.players.size === 0 && now - room.lastActivity > ROOM_TTL_MS) {
      rooms.delete(id);
      console.log(`[room] gc'd ${id}`);
    }
  }
}, 5 * 60 * 1000);

// Minimal HTTP handler so Render's health check (GET /) gets a 200 OK.
// socket.io (default path /socket.io) doesn't intercept plain "/" requests.
const httpServer = createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("PixelParty realtime server OK");
});

const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 5 * 1024 * 1024,
});

/* ---------- Clear-canvas voting ---------- */

function startClearVote(
  io: Server,
  socket: Socket,
  roomId: string,
  room: RoomState
) {
  // Cancel any existing vote.
  if (room.clearVote?.timer) clearTimeout(room.clearVote.timer);

  const voters = Array.from(room.players.values()).filter(
    (p) => p.id !== socket.id
  );
  // Need majority of other players. If alone or only viewers, host force-clears.
  const votesNeeded = Math.max(1, Math.ceil(voters.length / 2));

  room.clearVote = {
    requesterId: socket.id,
    yes: new Set([socket.id]),
    no: new Set(),
    expiresAt: Date.now() + CLEAR_VOTE_TIMEOUT_MS,
    timer: null,
  };

  io.to(roomId).emit(EVENTS.CLEAR_VOTE_REQUESTED, {
    requesterId: socket.id,
    votesNeeded,
    timeoutMs: CLEAR_VOTE_TIMEOUT_MS,
  });
  io.to(roomId).emit(
    EVENTS.CHAT_BROADCAST,
    systemMessage(room, `Clear requested — ${votesNeeded - 1} more vote(s) needed`)
  );

  room.clearVote.timer = setTimeout(() => {
    resolveClearVote(io, roomId, room);
  }, CLEAR_VOTE_TIMEOUT_MS);
}

function resolveClearVote(io: Server, roomId: string, room: RoomState) {
  if (!room.clearVote) return;
  const { yes, no, timer } = room.clearVote;
  if (timer) clearTimeout(timer);
  const voters = Array.from(room.players.values());
  const votesNeeded = Math.max(1, Math.ceil((voters.length - 1) / 2));
  const passed = yes.size > no.size && yes.size >= votesNeeded + 1;
  room.clearVote = null;

  io.to(roomId).emit(EVENTS.CLEAR_VOTE_RESULT, {
    passed,
    yes: yes.size,
    no: no.size,
  });

  if (passed) {
    room.pixels = emptyPixels(room.size);
    room.lastActivity = Date.now();
    io.to(roomId).emit(EVENTS.CLEARED, { size: room.size });
    io.to(roomId).emit(
      EVENTS.CHAT_BROADCAST,
      systemMessage(room, "Canvas cleared")
    );
    console.log(`[clear] ${roomId} passed`);
  } else {
    io.to(roomId).emit(
      EVENTS.CHAT_BROADCAST,
      systemMessage(room, "Clear vote failed")
    );
    console.log(`[clear] ${roomId} failed`);
  }
}

function attachHandlers(server: Server) {
  server.on("connection", (socket: Socket) => {
  let currentRoomId: string | null = null;
  let currentPlayer: Player | null = null;

  socket.on(EVENTS.JOIN, (data: JoinPayload) => {
    const roomId = data?.roomId;
    if (!roomId || typeof roomId !== "string") return;
    const name = sanitizeName(data?.name ?? "");

    if (currentRoomId && currentRoomId !== roomId) {
      leaveRoom(socket, currentRoomId, io);
    }

    currentRoomId = roomId;
    const room = getOrCreateRoom(roomId);
    socket.join(roomId);

    const isFirst = room.players.size === 0;
    const role: Role = isFirst ? "host" : "drawer";
    currentPlayer = {
      id: socket.id,
      name,
      color: colorForPlayer(socket.id),
      role,
    };
    room.players.set(socket.id, currentPlayer);

    if (isFirst) {
      room.hostId = socket.id;
    }

    syncRoomTo(io, roomId, room, socket.id);

    server.to(roomId).emit(EVENTS.PLAYER_JOINED, {
      player: currentPlayer,
      playerCount: room.players.size,
    });
    server.to(roomId).emit(
      EVENTS.CHAT_BROADCAST,
      systemMessage(room, `${name} joined`)
    );
    console.log(
      `[join] ${socket.id} (${name}) -> ${roomId} as ${role} (${room.players.size} players)`
    );
  });

  socket.on(EVENTS.PLACE, (data: PlacePayload) => {
    if (!currentRoomId || !currentPlayer) return;
    const room = rooms.get(currentRoomId);
    if (!room || !Array.isArray(data?.pixels)) return;
    // Viewers cannot draw.
    if (currentPlayer.role === "viewer") {
      socket.emit(EVENTS.ERROR, {
        code: "view-only",
        message: "You're a viewer — the host made you read-only.",
      });
      return;
    }

    const size = room.size;
    const cleaned = [];
    for (const p of data.pixels) {
      if (
        typeof p?.x !== "number" ||
        typeof p?.y !== "number" ||
        p.x < 0 ||
        p.x >= size ||
        p.y < 0 ||
        p.y >= size
      )
        continue;
      room.pixels[p.y * size + p.x] = p.color;
      cleaned.push({ x: p.x, y: p.y, color: p.color });
    }
    room.lastActivity = Date.now();
    if (cleaned.length === 0) return;

    socket.to(currentRoomId).emit(EVENTS.PLACED, {
      playerId: socket.id,
      pixels: cleaned,
    });
  });

  socket.on(EVENTS.SET_SIZE, (data: SetSizePayload) => {
    if (!currentRoomId || !currentPlayer) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;
    // Only host can change canvas size.
    if (currentPlayer.role !== "host") {
      socket.emit(EVENTS.ERROR, {
        code: "host-only",
        message: "Only the host can change the canvas size.",
      });
      return;
    }
    const size = data?.size;
    if (![16, 32, 64].includes(size)) return;

    room.size = size;
    room.pixels = emptyPixels(size);
    room.lastActivity = Date.now();
    server.to(currentRoomId).emit(EVENTS.SIZE_CHANGED, {
      size: room.size,
      pixels: room.pixels,
    });
    server.to(currentRoomId).emit(
      EVENTS.CHAT_BROADCAST,
      systemMessage(room, `Canvas resized to ${size}×${size}`)
    );
    console.log(`[size] ${currentRoomId} -> ${size}x${size}`);
  });

  socket.on(EVENTS.CLEAR, () => {
    if (!currentRoomId || !currentPlayer) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;
    // Host alone, or host with only viewers → force clear.
    const others = Array.from(room.players.values()).filter(
      (p) => p.id !== socket.id && p.role !== "viewer"
    );
    if (currentPlayer.role === "host" && others.length === 0) {
      room.pixels = emptyPixels(room.size);
      room.lastActivity = Date.now();
      server.to(currentRoomId).emit(EVENTS.CLEARED, { size: room.size });
      server.to(currentRoomId).emit(
        EVENTS.CHAT_BROADCAST,
        systemMessage(room, "Canvas cleared by host")
      );
      console.log(`[clear] ${currentRoomId} host force`);
      return;
    }
    // Otherwise start a vote.
    startClearVote(io, socket, currentRoomId, room);
  });

  socket.on(EVENTS.VOTE_CLEAR, (data: { vote: boolean }) => {
    if (!currentRoomId || !currentPlayer) return;
    const room = rooms.get(currentRoomId);
    if (!room || !room.clearVote) return;
    if (currentPlayer.id === room.clearVote.requesterId) return; // requester auto-yes

    if (data?.vote) {
      room.clearVote.yes.add(socket.id);
      room.clearVote.no.delete(socket.id);
    } else {
      room.clearVote.no.add(socket.id);
      room.clearVote.yes.delete(socket.id);
    }
    server.to(currentRoomId).emit(EVENTS.CLEAR_VOTE_CAST, {
      voterId: socket.id,
      yes: room.clearVote.yes.size,
      no: room.clearVote.no.size,
      votesNeeded: Math.max(1, Math.ceil((room.players.size - 1) / 2)),
    });
    // Resolve early if everyone has voted.
    const voted = room.clearVote.yes.size + room.clearVote.no.size;
    if (voted >= room.players.size) {
      resolveClearVote(io, currentRoomId, room);
    }
  });

  socket.on(EVENTS.CHAT, (data: ChatPayload) => {
    if (!currentRoomId || !currentPlayer) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;
    const text = String(data?.text ?? "").slice(0, 280).trim();
    if (!text) return;
    const msg: ChatMessage = {
      id: Math.random().toString(36).slice(2, 10),
      playerId: currentPlayer.id,
      playerName: currentPlayer.name,
      color: currentPlayer.color,
      text,
      ts: Date.now(),
    };
    server.to(currentRoomId).emit(EVENTS.CHAT_BROADCAST, msg);
  });

  socket.on(EVENTS.KICK, (data: KickPayload) => {
    if (!currentRoomId || !currentPlayer) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;
    if (currentPlayer.role !== "host") {
      socket.emit(EVENTS.ERROR, {
        code: "host-only",
        message: "Only the host can kick.",
      });
      return;
    }
    const target = data?.targetId;
    if (!target || target === socket.id) return;
    const targetPlayer = room.players.get(target);
    server.to(target).emit(EVENTS.KICKED, {
      reason: "Kicked by the host",
    });
    server.sockets.sockets.get(target)?.disconnect(true);
    server.to(currentRoomId).emit(
      EVENTS.CHAT_BROADCAST,
      systemMessage(room, `${targetPlayer?.name ?? "Someone"} was kicked`)
    );
    console.log(`[kick] ${target} from ${currentRoomId}`);
  });

  socket.on(EVENTS.SET_ROLE, (data: SetRolePayload) => {
    if (!currentRoomId || !currentPlayer) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;
    if (currentPlayer.role !== "host") {
      socket.emit(EVENTS.ERROR, {
        code: "host-only",
        message: "Only the host can change roles.",
      });
      return;
    }
    const target = data?.targetId;
    const role = data?.role;
    if (!target || (role !== "drawer" && role !== "viewer")) return;
    const targetPlayer = room.players.get(target);
    if (!targetPlayer || targetPlayer.role === "host") return; // can't demote host
    targetPlayer.role = role;
    server.to(currentRoomId).emit(EVENTS.ROLE_CHANGED, {
      playerId: target,
      role,
    });
    server.to(currentRoomId).emit(
      EVENTS.CHAT_BROADCAST,
      systemMessage(
        room,
        `${targetPlayer.name} is now ${role === "viewer" ? "a viewer" : "a drawer"}`
      )
    );
    console.log(`[role] ${target} -> ${role} in ${currentRoomId}`);
  });

  socket.on("disconnect", () => {
    if (currentRoomId) leaveRoom(socket, currentRoomId, server);
    console.log(`[disconnect] ${socket.id}`);
  });

  socket.on("error", (err: unknown) => {
    console.error(`[socket error] ${socket.id}:`, err);
  });
  });
}

// Attach the same handlers to both socket.io instances (production path
// /socket.io and sandbox path /).
attachHandlers(io);

function leaveRoom(socket: Socket, roomId: string, io: Server) {
  const room = rooms.get(roomId);
  socket.leave(roomId);
  if (room) {
    const player = room.players.get(socket.id);
    room.players.delete(socket.id);
    room.lastActivity = Date.now();

    // Reassign host if the host left.
    if (room.hostId === socket.id && room.players.size > 0) {
      const nextHost = room.players.values().next().value;
      if (nextHost) {
        nextHost.role = "host";
        room.hostId = nextHost.id;
        io.to(roomId).emit(EVENTS.HOST_CHANGED, { hostId: nextHost.id });
        io.to(roomId).emit(EVENTS.ROLE_CHANGED, {
          playerId: nextHost.id,
          role: "host",
        });
        io.to(roomId).emit(
          EVENTS.CHAT_BROADCAST,
          systemMessage(room, `${nextHost.name} is now the host`)
        );
      }
    }

    // Cancel an active clear vote if the requester left.
    if (room.clearVote?.requesterId === socket.id) {
      if (room.clearVote.timer) clearTimeout(room.clearVote.timer);
      room.clearVote = null;
      io.to(roomId).emit(EVENTS.CLEAR_VOTE_RESULT, {
        passed: false,
        yes: 0,
        no: 0,
      });
    }

    io.to(roomId).emit(EVENTS.PLAYER_LEFT, {
      playerId: socket.id,
      playerCount: room.players.size,
    });
    if (player) {
      io.to(roomId).emit(
        EVENTS.CHAT_BROADCAST,
        systemMessage(room, `${player.name} left`)
      );
    }
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
