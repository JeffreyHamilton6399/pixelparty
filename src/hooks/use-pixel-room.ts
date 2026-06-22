"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  EVENTS,
  DEFAULT_CANVAS_SIZE,
  type CanvasSize,
  type PixelColor,
  type PixelUpdate,
  type Player,
  type SyncPayload,
  type PlacedPayload,
  type CursorBroadcastPayload,
  type PlayerJoinedPayload,
  type PlayerLeftPayload,
  type SizeChangedPayload,
} from "@/lib/pixel-party/constants";

/** Real-time server port (matches mini-services/pixel-server). */
const REALTIME_PORT = 3004;

/**
 * Deploy-configurable real-time server URL. In this sandbox we connect through
 * the Caddy gateway via `?XTransformPort=3004`. For production (Vercel +
 * separately-hosted socket.io server), set `NEXT_PUBLIC_REALTIME_URL` to the
 * deployed server origin (e.g. `https://rt.pixelparty.app`) and the client
 * connects directly to it with the default socket.io path.
 */
const REALTIME_URL = process.env.NEXT_PUBLIC_REALTIME_URL?.trim() || "";

export interface CursorState {
  x: number;
  y: number;
  color: string;
  lastSeen: number;
}

export interface FlashState {
  x: number;
  y: number;
  ts: number;
}

export interface PixelRoomApi {
  connected: boolean;
  size: CanvasSize;
  playerCount: number;
  myId: string | null;
  myColor: string;
  players: Player[];
  /** Source of truth — flat array, mutated in place. Do not read during render. */
  pixelsRef: React.MutableRefObject<PixelColor[]>;
  /** Indices changed since last canvas redraw; "all" => full redraw. */
  dirtyRef: React.MutableRefObject<Set<number> | "all">;
  /** Other players' cursors: id -> state. */
  cursorsRef: React.MutableRefObject<Map<string, CursorState>>;
  /** Recently-changed remote cells for the amber flash effect. */
  flashesRef: React.MutableRefObject<FlashState[]>;
  /** Place a batch of pixels (locally applied + sent to server). */
  place: (pixels: PixelUpdate[]) => void;
  /** Report local cursor (fractional grid coords). Throttled internally. */
  setCursor: (x: number, y: number) => void;
  /** Change canvas size (clears the canvas for everyone). */
  setSize: (size: CanvasSize) => void;
  /** Clear the whole canvas. */
  clear: () => void;
}

/** Derive the current square size from the pixel array length. */
function sizeOf(pixels: PixelColor[]): CanvasSize {
  const n = Math.round(Math.sqrt(pixels.length));
  return (n === 16 || n === 32 || n === 64 ? n : DEFAULT_CANVAS_SIZE) as CanvasSize;
}

/**
 * Manages the socket.io connection to the PixelParty real-time server and
 * keeps the pixel grid in mutable refs (NOT React state) so high-frequency
 * pixel/cursor updates never trigger React re-renders. Low-frequency events
 * (join/leave/connect/size) do update React state for the header UI.
 */
export function usePixelRoom(roomId: string): PixelRoomApi {
  const [connected, setConnected] = useState(false);
  const [size, setSizeState] = useState<CanvasSize>(DEFAULT_CANVAS_SIZE);
  const [playerCount, setPlayerCount] = useState(0);
  const [myId, setMyId] = useState<string | null>(null);
  const [myColor, setMyColor] = useState("#34d399");
  const [players, setPlayers] = useState<Player[]>([]);

  const socketRef = useRef<Socket | null>(null);
  const pixelsRef = useRef<PixelColor[]>(
    new Array(DEFAULT_CANVAS_SIZE * DEFAULT_CANVAS_SIZE).fill(null)
  );
  const dirtyRef = useRef<Set<number> | "all">("all");
  const cursorsRef = useRef<Map<string, CursorState>>(new Map());
  const flashesRef = useRef<FlashState[]>([]);

  // Outgoing pixel batch buffer (flushed on a 50ms debounce).
  const outboxRef = useRef<PixelUpdate[]>([]);
  const outboxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Outgoing cursor throttle (30fps).
  const lastCursorSendRef = useRef(0);
  const pendingCursorRef = useRef<{ x: number; y: number } | null>(null);

  const markDirty = useCallback((indices: number[] | "all") => {
    if (indices === "all") {
      dirtyRef.current = "all";
    } else if (dirtyRef.current !== "all") {
      for (const i of indices) dirtyRef.current.add(i);
    }
  }, []);

  const flushOutbox = useCallback(() => {
    outboxTimerRef.current = null;
    const socket = socketRef.current;
    if (!socket || !socket.connected) {
      outboxRef.current = [];
      return;
    }
    if (outboxRef.current.length === 0) return;
    socket.emit(EVENTS.PLACE, { pixels: outboxRef.current });
    outboxRef.current = [];
  }, []);

  useEffect(() => {
    const socket = REALTIME_URL
      ? io(REALTIME_URL, {
          transports: ["websocket"],
          reconnection: true,
          reconnectionAttempts: 10,
          reconnectionDelay: 1000,
          timeout: 10000,
        })
      : io(`/?XTransformPort=${REALTIME_PORT}`, {
          path: "/",
          transports: ["websocket"],
          forceNew: true,
          reconnection: true,
          reconnectionAttempts: 10,
          reconnectionDelay: 1000,
          timeout: 10000,
        });
    socketRef.current = socket;

    const applyPixels = (px: PixelUpdate[]) => {
      const cur = pixelsRef.current;
      const s = sizeOf(cur);
      const indices: number[] = [];
      for (const p of px) {
        if (p.x < 0 || p.x >= s || p.y < 0 || p.y >= s) continue;
        const idx = p.y * s + p.x;
        cur[idx] = p.color;
        indices.push(idx);
      }
      if (indices.length) markDirty(indices);
    };

    socket.on("connect", () => {
      setConnected(true);
      setMyId(socket.id ?? null);
      socket.emit(EVENTS.JOIN, { roomId });
    });

    socket.on("disconnect", () => {
      setConnected(false);
      cursorsRef.current.clear();
    });

    socket.on(EVENTS.SYNC, (data: SyncPayload) => {
      pixelsRef.current = data.pixels.slice();
      setSizeState(data.size);
      setPlayers(data.players);
      setPlayerCount(data.players.length);
      cursorsRef.current.clear();
      for (const p of data.players) {
        if (p.id !== data.yourId) {
          cursorsRef.current.set(p.id, {
            x: -10,
            y: -10,
            color: p.color,
            lastSeen: Date.now(),
          });
        }
      }
      if (data.yourId) {
        setMyId(data.yourId);
        const me = data.players.find((p) => p.id === data.yourId);
        if (me) setMyColor(me.color);
      }
      dirtyRef.current = "all";
    });

    socket.on(EVENTS.PLACED, (data: PlacedPayload) => {
      if (data.playerId === socket.id) return; // own echo
      applyPixels(data.pixels);
      const now = Date.now();
      const flashes = flashesRef.current;
      for (const p of data.pixels) {
        flashes.push({ x: p.x, y: p.y, ts: now });
        if (flashes.length > 256) flashes.shift();
      }
    });

    socket.on(EVENTS.CURSOR_BROADCAST, (data: CursorBroadcastPayload) => {
      if (data.playerId === socket.id) return;
      cursorsRef.current.set(data.playerId, {
        x: data.x,
        y: data.y,
        color: data.color,
        lastSeen: Date.now(),
      });
    });

    socket.on(EVENTS.PLAYER_JOINED, (data: PlayerJoinedPayload) => {
      setPlayerCount(data.playerCount);
      setPlayers((prev) =>
        prev.some((p) => p.id === data.player.id) ? prev : [...prev, data.player]
      );
      if (data.player.id !== socket.id) {
        cursorsRef.current.set(data.player.id, {
          x: -10,
          y: -10,
          color: data.player.color,
          lastSeen: Date.now(),
        });
      }
    });

    socket.on(EVENTS.PLAYER_LEFT, (data: PlayerLeftPayload) => {
      setPlayerCount(data.playerCount);
      setPlayers((prev) => prev.filter((p) => p.id !== data.playerId));
      cursorsRef.current.delete(data.playerId);
    });

    socket.on(EVENTS.SIZE_CHANGED, (data: SizeChangedPayload) => {
      pixelsRef.current = data.pixels.slice();
      setSizeState(data.size);
      cursorsRef.current.clear();
      dirtyRef.current = "all";
    });

    socket.on(EVENTS.CLEARED, () => {
      const s = sizeOf(pixelsRef.current);
      pixelsRef.current = new Array(s * s).fill(null);
      dirtyRef.current = "all";
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      if (outboxTimerRef.current) {
        clearTimeout(outboxTimerRef.current);
        outboxTimerRef.current = null;
      }
    };
  }, [roomId, markDirty]);

  const place = useCallback(
    (pixels: PixelUpdate[]) => {
      if (pixels.length === 0) return;
      const cur = pixelsRef.current;
      const s = sizeOf(cur);
      const indices: number[] = [];
      for (const p of pixels) {
        if (p.x < 0 || p.x >= s || p.y < 0 || p.y >= s) continue;
        const idx = p.y * s + p.x;
        cur[idx] = p.color;
        indices.push(idx);
      }
      if (indices.length) markDirty(indices);

      outboxRef.current.push(...pixels);
      if (!outboxTimerRef.current) {
        outboxTimerRef.current = setTimeout(flushOutbox, 50);
      }
    },
    [flushOutbox, markDirty]
  );

  const setCursor = useCallback((x: number, y: number) => {
    pendingCursorRef.current = { x, y };
    const now = performance.now();
    if (now - lastCursorSendRef.current >= 1000 / 30) {
      lastCursorSendRef.current = now;
      const socket = socketRef.current;
      if (socket?.connected) {
        socket.emit(EVENTS.CURSOR, pendingCursorRef.current);
        pendingCursorRef.current = null;
      }
    }
  }, []);

  // Flush any pending cursor on idle.
  useEffect(() => {
    const id = setInterval(() => {
      const socket = socketRef.current;
      if (socket?.connected && pendingCursorRef.current) {
        socket.emit(EVENTS.CURSOR, pendingCursorRef.current);
        pendingCursorRef.current = null;
        lastCursorSendRef.current = performance.now();
      }
    }, 120);
    return () => clearInterval(id);
  }, []);

  const setSize = useCallback((newSize: CanvasSize) => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    socket.emit(EVENTS.SET_SIZE, { size: newSize });
  }, []);

  const clear = useCallback(() => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    socket.emit(EVENTS.CLEAR, {});
  }, []);

  return {
    connected,
    size,
    playerCount,
    myId,
    myColor,
    players,
    pixelsRef,
    dirtyRef,
    cursorsRef,
    flashesRef,
    place,
    setCursor,
    setSize,
    clear,
  };
}
