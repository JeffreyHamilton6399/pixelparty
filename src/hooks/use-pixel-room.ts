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
 * deployed server origin.
 */
const REALTIME_URL = process.env.NEXT_PUBLIC_REALTIME_URL?.trim() || "";

const MAX_HISTORY = 60;

interface HistoryEntry {
  /** What the user changed pixels TO. */
  next: PixelUpdate[];
  /** What those pixels were BEFORE (for undo). */
  prev: PixelUpdate[];
}

export interface PixelRoomApi {
  connected: boolean;
  size: CanvasSize;
  playerCount: number;
  myId: string | null;
  players: Player[];
  /** Source of truth — flat array, mutated in place. Do not read during render. */
  pixelsRef: React.MutableRefObject<PixelColor[]>;
  /** Indices changed since last canvas redraw; "all" => full redraw. */
  dirtyRef: React.MutableRefObject<Set<number> | "all">;
  /** Whether the local undo stack has anything. */
  canUndo: boolean;
  /** Whether the local redo stack has anything. */
  canRedo: boolean;
  /** Place a batch of pixels (locally applied + sent to server + recorded for undo). */
  place: (pixels: PixelUpdate[]) => void;
  /** Undo the user's most recent local batch. */
  undo: () => void;
  /** Redo a previously undone batch. */
  redo: () => void;
  /** Load an arbitrary pixel array into the canvas + broadcast it (gallery load). */
  loadPixels: (size: CanvasSize, pixels: PixelColor[]) => void;
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
 * Manages the socket.io connection to the PixelParty real-time server and keeps
 * the pixel grid in mutable refs (NOT React state) so high-frequency updates
 * never trigger React re-renders.
 *
 * Cursor sync + amber flash were removed for a cleaner, more minimal UI — the
 * pixels appearing live is the only real-time signal. Local undo/redo tracks
 * the user's own batches.
 */
export function usePixelRoom(roomId: string): PixelRoomApi {
  const [connected, setConnected] = useState(false);
  const [size, setSizeState] = useState<CanvasSize>(DEFAULT_CANVAS_SIZE);
  const [playerCount, setPlayerCount] = useState(0);
  const [myId, setMyId] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const pixelsRef = useRef<PixelColor[]>(
    new Array(DEFAULT_CANVAS_SIZE * DEFAULT_CANVAS_SIZE).fill(null)
  );
  const dirtyRef = useRef<Set<number> | "all">("all");

  // Local undo/redo stacks (the user's own actions only).
  const undoStackRef = useRef<HistoryEntry[]>([]);
  const redoStackRef = useRef<HistoryEntry[]>([]);

  // Outgoing pixel batch buffer (flushed on a 50ms debounce).
  const outboxRef = useRef<PixelUpdate[]>([]);
  const outboxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When loading from the gallery with a size change, the server's
  // SIZE_CHANGED echo would wipe our just-applied pixels. This pending flag
  // lets the SIZE_CHANGED handler re-apply the loaded pixels instead.
  const loadPendingRef = useRef<{ size: CanvasSize; pixels: PixelColor[] } | null>(null);

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

  const syncHistoryFlags = useCallback(() => {
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  }, []);

  /** Apply pixels to the local array + mark dirty + buffer for server send. */
  const applyAndSend = useCallback(
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

    const applyRemotePixels = (px: PixelUpdate[]) => {
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
    });

    socket.on(EVENTS.SYNC, (data: SyncPayload) => {
      pixelsRef.current = data.pixels.slice();
      setSizeState(data.size);
      setPlayers(data.players);
      setPlayerCount(data.players.length);
      if (data.yourId) setMyId(data.yourId);
      // Fresh room state — wipe local history.
      undoStackRef.current = [];
      redoStackRef.current = [];
      syncHistoryFlags();
      dirtyRef.current = "all";
    });

    socket.on(EVENTS.PLACED, (data: PlacedPayload) => {
      if (data.playerId === socket.id) return; // own echo
      applyRemotePixels(data.pixels);
    });

    socket.on(EVENTS.PLAYER_JOINED, (data: PlayerJoinedPayload) => {
      setPlayerCount(data.playerCount);
      setPlayers((prev) =>
        prev.some((p) => p.id === data.player.id) ? prev : [...prev, data.player]
      );
    });

    socket.on(EVENTS.PLAYER_LEFT, (data: PlayerLeftPayload) => {
      setPlayerCount(data.playerCount);
      setPlayers((prev) => prev.filter((p) => p.id !== data.playerId));
    });

    socket.on(EVENTS.SIZE_CHANGED, (data: SizeChangedPayload) => {
      if (loadPendingRef.current) {
        // Our own gallery load: override the server's cleared state with the
        // pixels we're loading. The follow-up PLACE emission applies them on
        // the server for everyone else.
        pixelsRef.current = loadPendingRef.current.pixels.slice();
        setSizeState(loadPendingRef.current.size);
        loadPendingRef.current = null;
      } else {
        pixelsRef.current = data.pixels.slice();
        setSizeState(data.size);
        undoStackRef.current = [];
        redoStackRef.current = [];
        syncHistoryFlags();
      }
      dirtyRef.current = "all";
    });

    socket.on(EVENTS.CLEARED, () => {
      const s = sizeOf(pixelsRef.current);
      pixelsRef.current = new Array(s * s).fill(null);
      undoStackRef.current = [];
      redoStackRef.current = [];
      syncHistoryFlags();
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
  }, [roomId, markDirty, syncHistoryFlags]);

  /**
   * Place a batch: record previous colors for undo, apply, send, push history.
   * Merges into a pending history entry if the user is mid-drag (debounced).
   */
  const place = useCallback(
    (pixels: PixelUpdate[]) => {
      if (pixels.length === 0) return;
      const cur = pixelsRef.current;
      const s = sizeOf(cur);
      // Snapshot previous colors for undo.
      const prev: PixelUpdate[] = [];
      const seen = new Set<number>();
      for (const p of pixels) {
        if (p.x < 0 || p.x >= s || p.y < 0 || p.y >= s) continue;
        const idx = p.y * s + p.x;
        if (seen.has(idx)) continue;
        seen.add(idx);
        prev.push({ x: p.x, y: p.y, color: cur[idx] });
      }
      applyAndSend(pixels);

      // Merge into the top of the undo stack if it's very recent (< 400ms) and
      // still part of the same drag — this makes a brush stroke one undo step.
      const now = Date.now();
      const top = undoStackRef.current[undoStackRef.current.length - 1];
      if (top && top._ts && now - top._ts < 400) {
        // Merge: update prev for newly-touched cells, append next.
        const prevMap = new Map<string, PixelUpdate>();
        for (const p of top.prev) prevMap.set(`${p.x},${p.y}`, p);
        for (const p of prev) {
          const key = `${p.x},${p.y}`;
          if (!prevMap.has(key)) prevMap.set(key, p);
        }
        top.prev = Array.from(prevMap.values());
        top.next.push(...pixels);
        top._ts = now;
      } else {
        undoStackRef.current.push({
          next: pixels.slice(),
          prev,
          _ts: now,
        } as HistoryEntry & { _ts: number });
        if (undoStackRef.current.length > MAX_HISTORY) {
          undoStackRef.current.shift();
        }
      }
      redoStackRef.current = [];
      syncHistoryFlags();
    },
    [applyAndSend, syncHistoryFlags]
  );

  const undo = useCallback(() => {
    const entry = undoStackRef.current.pop();
    if (!entry) return;
    // Revert to prev colors.
    applyAndSend(entry.prev);
    redoStackRef.current.push(entry);
    syncHistoryFlags();
  }, [applyAndSend, syncHistoryFlags]);

  const redo = useCallback(() => {
    const entry = redoStackRef.current.pop();
    if (!entry) return;
    applyAndSend(entry.next);
    undoStackRef.current.push(entry);
    syncHistoryFlags();
  }, [applyAndSend, syncHistoryFlags]);

  const loadPixels = useCallback(
    (newSize: CanvasSize, newPixels: PixelColor[]) => {
      const socket = socketRef.current;
      const curSize = sizeOf(pixelsRef.current);
      // Apply locally for instant visual.
      pixelsRef.current = newPixels.slice();
      setSizeState(newSize);
      dirtyRef.current = "all";
      undoStackRef.current = [];
      redoStackRef.current = [];
      syncHistoryFlags();
      if (socket?.connected) {
        if (newSize !== curSize) {
          // The size change triggers a SIZE_CHANGED echo that clears the
          // canvas; set a pending load so that echo re-applies our pixels.
          loadPendingRef.current = { size: newSize, pixels: newPixels.slice() };
          socket.emit(EVENTS.SET_SIZE, { size: newSize });
        }
        // Broadcast all non-null pixels so collaborators see the loaded art.
        const updates: PixelUpdate[] = [];
        for (let i = 0; i < newPixels.length; i++) {
          if (newPixels[i]) {
            updates.push({ x: i % newSize, y: Math.floor(i / newSize), color: newPixels[i] });
          }
        }
        if (updates.length) socket.emit(EVENTS.PLACE, { pixels: updates });
      }
    },
    [syncHistoryFlags]
  );

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
    players,
    pixelsRef,
    dirtyRef,
    canUndo,
    canRedo,
    place,
    undo,
    redo,
    loadPixels,
    setSize,
    clear,
  };
}
