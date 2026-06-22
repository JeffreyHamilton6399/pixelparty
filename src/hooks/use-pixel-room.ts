"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  EVENTS,
  DEFAULT_CANVAS_SIZE,
  CLEAR_VOTE_TIMEOUT_MS,
  type CanvasSize,
  type PixelColor,
  type PixelUpdate,
  type Player,
  type Role,
  type SyncPayload,
  type PlacedPayload,
  type PlayerJoinedPayload,
  type PlayerLeftPayload,
  type SizeChangedPayload,
  type ChatMessage,
  type RoleChangedPayload,
  type HostChangedPayload,
  type ClearVoteRequestedPayload,
  type ClearVoteCastPayload,
  type ClearVoteResultPayload,
  type ErrorPayload,
} from "@/lib/pixel-party/constants";

const REALTIME_PORT = 3004;
const REALTIME_URL = process.env.NEXT_PUBLIC_REALTIME_URL?.trim() || "";

const MAX_HISTORY = 60;

interface HistoryEntry {
  next: PixelUpdate[];
  prev: PixelUpdate[];
  _ts?: number;
}

export interface ClearVoteState {
  requesterId: string;
  yes: number;
  no: number;
  votesNeeded: number;
  expiresAt: number;
}

export interface PixelRoomApi {
  /** "connected" = realtime server reachable; "solo" = local-only fallback. */
  mode: "connecting" | "solo" | "connected";
  size: CanvasSize;
  playerCount: number;
  myId: string | null;
  myRole: Role | null;
  hostId: string | null;
  players: Player[];
  chat: ChatMessage[];
  clearVote: ClearVoteState | null;
  errorMessage: string | null;
  pixelsRef: React.MutableRefObject<PixelColor[]>;
  dirtyRef: React.MutableRefObject<Set<number> | "all">;
  canUndo: boolean;
  canRedo: boolean;
  place: (pixels: PixelUpdate[]) => void;
  undo: () => void;
  redo: () => void;
  loadPixels: (size: CanvasSize, pixels: PixelColor[]) => void;
  setSize: (size: CanvasSize) => void;
  clear: () => void;
  voteClear: (vote: boolean) => void;
  sendChat: (text: string) => void;
  kick: (targetId: string) => void;
  setRole: (targetId: string, role: "drawer" | "viewer") => void;
  dismissError: () => void;
}

function sizeOf(pixels: PixelColor[]): CanvasSize {
  const n = Math.round(Math.sqrt(pixels.length));
  return (n === 16 || n === 32 || n === 64 ? n : DEFAULT_CANVAS_SIZE) as CanvasSize;
}

/** Are we running on a deployed host (not the sandbox gateway)? */
function isDeployedHost(): boolean {
  if (typeof window === "undefined") return false;
  // Sandbox gateway is localhost:81. Anything else (e.g. Vercel) is "deployed".
  const h = window.location.host;
  return !h.startsWith("localhost:81");
}

/**
 * Manages the socket.io connection + in-memory pixel state.
 *
 * SOLO FALLBACK: if NEXT_PUBLIC_REALTIME_URL is unset AND we're not on the
 * sandbox gateway, we run in "solo" mode — no socket, drawing is local-only
 * (still fully functional: draw, undo/redo, save to gallery, export PNG).
 * This makes the Vercel deploy work immediately; real-time sync requires
 * NEXT_PUBLIC_REALTIME_URL to point at a deployed realtime server.
 */
export function usePixelRoom(roomId: string, username: string): PixelRoomApi {
  const [mode, setMode] = useState<"connecting" | "solo" | "connected">(
    "connecting"
  );
  const [size, setSizeState] = useState<CanvasSize>(DEFAULT_CANVAS_SIZE);
  const [playerCount, setPlayerCount] = useState(0);
  const [myId, setMyId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<Role | null>(null);
  const [hostId, setHostId] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [clearVote, setClearVote] = useState<ClearVoteState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const pixelsRef = useRef<PixelColor[]>(
    new Array(DEFAULT_CANVAS_SIZE * DEFAULT_CANVAS_SIZE).fill(null)
  );
  const dirtyRef = useRef<Set<number> | "all">("all");
  const undoStackRef = useRef<HistoryEntry[]>([]);
  const redoStackRef = useRef<HistoryEntry[]>([]);
  const outboxRef = useRef<PixelUpdate[]>([]);
  const outboxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadPendingRef = useRef<{ size: CanvasSize; pixels: PixelColor[] } | null>(null);
  const chatBoxRef = useRef<HTMLDivElement>(null);

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
      const socket = socketRef.current;
      if (socket?.connected) {
        outboxRef.current.push(...pixels);
        if (!outboxTimerRef.current) {
          outboxTimerRef.current = setTimeout(flushOutbox, 50);
        }
      }
    },
    [flushOutbox, markDirty]
  );

  /* ---------- Decide mode + connect ---------- */
  useEffect(() => {
    // Solo fallback: no realtime URL + not on sandbox gateway.
    if (!REALTIME_URL && isDeployedHost()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMode("solo");
      setPlayerCount(1);
      setMyId("solo");
      setMyRole("host");
      setHostId("solo");
      setPlayers([
        { id: "solo", name: username, color: "#34d399", role: "host" },
      ]);
      dirtyRef.current = "all";
      return;
    }

    const socket = REALTIME_URL
      ? io(REALTIME_URL, {
          transports: ["websocket"],
          reconnection: true,
          reconnectionAttempts: 8,
          reconnectionDelay: 1000,
          timeout: 6000,
        })
      : io(`/?XTransformPort=${REALTIME_PORT}`, {
          path: "/",
          transports: ["websocket"],
          forceNew: true,
          reconnection: true,
          reconnectionAttempts: 8,
          reconnectionDelay: 1000,
          timeout: 6000,
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

    let connectTimeout: ReturnType<typeof setTimeout> | null = null;
    // If we can't connect within 4s, fall back to solo so the app is usable.
    connectTimeout = setTimeout(() => {
      if (!socket.connected) {
        setMode("solo");
        setPlayerCount(1);
        setMyId("solo");
        setMyRole("host");
        setHostId("solo");
      }
    }, 4000);

    socket.on("connect", () => {
      if (connectTimeout) clearTimeout(connectTimeout);
      setMode("connected");
      setMyId(socket.id);
      socket.emit(EVENTS.JOIN, { roomId, name: username });
    });

    socket.on("connect_error", () => {
      // Don't immediately go solo; the timeout will handle it.
    });

    socket.on("disconnect", () => {
      setMode("connecting");
    });

    socket.on(EVENTS.SYNC, (data: SyncPayload) => {
      pixelsRef.current = data.pixels.slice();
      setSizeState(data.size);
      setPlayers(data.players);
      setPlayerCount(data.players.length);
      setHostId(data.hostId);
      const me = data.players.find((p) => p.id === data.yourId);
      setMyRole(me?.role ?? "drawer");
      undoStackRef.current = [];
      redoStackRef.current = [];
      syncHistoryFlags();
      dirtyRef.current = "all";
    });

    socket.on(EVENTS.PLACED, (data: PlacedPayload) => {
      if (data.playerId === socket.id) return;
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

    socket.on(EVENTS.CHAT_BROADCAST, (msg: ChatMessage) => {
      setChat((prev) => {
        const next = [...prev, msg].slice(-100);
        return next;
      });
    });

    socket.on(EVENTS.ROLE_CHANGED, (data: RoleChangedPayload) => {
      setPlayers((prev) =>
        prev.map((p) => (p.id === data.playerId ? { ...p, role: data.role } : p))
      );
      if (data.playerId === socket.id) setMyRole(data.role);
    });

    socket.on(EVENTS.HOST_CHANGED, (data: HostChangedPayload) => {
      setHostId(data.hostId);
      setPlayers((prev) =>
        prev.map((p) =>
          p.id === data.hostId
            ? { ...p, role: "host" }
            : p.role === "host"
            ? { ...p, role: "drawer" }
            : p
        )
      );
      if (data.hostId === socket.id) setMyRole("host");
    });

    socket.on(EVENTS.CLEAR_VOTE_REQUESTED, (data: ClearVoteRequestedPayload) => {
      setClearVote({
        requesterId: data.requesterId,
        yes: 1,
        no: 0,
        votesNeeded: data.votesNeeded,
        expiresAt: Date.now() + data.timeoutMs,
      });
    });

    socket.on(EVENTS.CLEAR_VOTE_CAST, (data: ClearVoteCastPayload) => {
      setClearVote((prev) =>
        prev
          ? { ...prev, yes: data.yes, no: data.no, votesNeeded: data.votesNeeded }
          : prev
      );
    });

    socket.on(EVENTS.CLEAR_VOTE_RESULT, (data: ClearVoteResultPayload) => {
      setClearVote(null);
      if (!data.passed) {
        setErrorMessage("Clear vote didn't pass.");
      }
    });

    socket.on(EVENTS.ERROR, (data: ErrorPayload) => {
      setErrorMessage(data.message);
    });

    socket.on(EVENTS.KICKED, () => {
      setErrorMessage("You were kicked by the host.");
      // Give the user a moment to read it, then bounce to landing.
      setTimeout(() => {
        if (typeof window !== "undefined") window.location.href = "/";
      }, 2000);
    });

    return () => {
      if (connectTimeout) clearTimeout(connectTimeout);
      socket.disconnect();
      socketRef.current = null;
      if (outboxTimerRef.current) {
        clearTimeout(outboxTimerRef.current);
        outboxTimerRef.current = null;
      }
    };
  }, [roomId, username, markDirty, syncHistoryFlags]);

  /* ---------- Actions (work in both solo + connected modes) ---------- */

  const place = useCallback(
    (pixels: PixelUpdate[]) => {
      if (pixels.length === 0) return;
      const cur = pixelsRef.current;
      const s = sizeOf(cur);
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

      const now = Date.now();
      const top = undoStackRef.current[undoStackRef.current.length - 1];
      if (top && top._ts && now - top._ts < 400) {
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
        });
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
      pixelsRef.current = newPixels.slice();
      setSizeState(newSize);
      dirtyRef.current = "all";
      undoStackRef.current = [];
      redoStackRef.current = [];
      syncHistoryFlags();
      if (socket?.connected) {
        if (newSize !== curSize) {
          loadPendingRef.current = { size: newSize, pixels: newPixels.slice() };
          socket.emit(EVENTS.SET_SIZE, { size: newSize });
        }
        const updates: PixelUpdate[] = [];
        for (let i = 0; i < newPixels.length; i++) {
          if (newPixels[i]) {
            updates.push({
              x: i % newSize,
              y: Math.floor(i / newSize),
              color: newPixels[i],
            });
          }
        }
        if (updates.length) socket.emit(EVENTS.PLACE, { pixels: updates });
      }
    },
    [syncHistoryFlags]
  );

  const setSize = useCallback((newSize: CanvasSize) => {
    const socket = socketRef.current;
    if (socket?.connected) {
      socket.emit(EVENTS.SET_SIZE, { size: newSize });
    } else {
      // Solo: apply locally.
      pixelsRef.current = new Array(newSize * newSize).fill(null);
      setSizeState(newSize);
      dirtyRef.current = "all";
    }
  }, []);

  const clear = useCallback(() => {
    const socket = socketRef.current;
    if (socket?.connected) {
      socket.emit(EVENTS.CLEAR, {});
    } else {
      // Solo: just clear.
      const s = sizeOf(pixelsRef.current);
      pixelsRef.current = new Array(s * s).fill(null);
      dirtyRef.current = "all";
    }
  }, []);

  const voteClear = useCallback((vote: boolean) => {
    const socket = socketRef.current;
    if (socket?.connected) socket.emit(EVENTS.VOTE_CLEAR, { vote });
    setClearVote(null);
  }, []);

  const sendChat = useCallback((text: string) => {
    const socket = socketRef.current;
    const t = text.trim();
    if (!t) return;
    if (socket?.connected) {
      socket.emit(EVENTS.CHAT, { text: t });
    } else {
      // Solo: echo locally.
      setChat((prev) => [
        ...prev,
        {
          id: Math.random().toString(36).slice(2),
          playerId: "solo",
          playerName: username,
          color: "#34d399",
          text: t,
          ts: Date.now(),
        },
      ].slice(-100));
    }
  }, [username]);

  const kick = useCallback((targetId: string) => {
    socketRef.current?.emit(EVENTS.KICK, { targetId });
  }, []);

  const setRole = useCallback(
    (targetId: string, role: "drawer" | "viewer") => {
      socketRef.current?.emit(EVENTS.SET_ROLE, { targetId, role });
    },
    []
  );

  const dismissError = useCallback(() => setErrorMessage(null), []);

  // Clear-vote expiry timer (client-side countdown safety).
  useEffect(() => {
    if (!clearVote) return;
    const ms = Math.max(0, clearVote.expiresAt - Date.now());
    const id = setTimeout(() => setClearVote(null), ms + 500);
    return () => clearTimeout(id);
  }, [clearVote]);

  return {
    mode,
    size,
    playerCount,
    myId,
    myRole,
    hostId,
    players,
    chat,
    clearVote,
    errorMessage,
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
    voteClear,
    sendChat,
    kick,
    setRole,
    dismissError,
  };
}
