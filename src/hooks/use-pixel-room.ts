"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import PartySocket from "partysocket";
import {
  EVENTS,
  DEFAULT_CANVAS_SIZE,
  CLEAR_VOTE_TIMEOUT_MS,
  type CanvasSize,
  type PixelColor,
  type PixelUpdate,
  type Player,
  type Role,
  type ChatMessage,
} from "@/lib/pixel-party/constants";

const REALTIME_PORT = 3004;
const REALTIME_URL = process.env.NEXT_PUBLIC_REALTIME_URL?.trim() || "";
const PARTYKIT_HOST = process.env.NEXT_PUBLIC_PARTYKIT_HOST?.trim() || "";

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

/** Transport-agnostic send function: (type, payload) → void. */
type SendFn = (type: string, data?: Record<string, unknown>) => void;

export interface PixelRoomApi {
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

function isDeployedHost(): boolean {
  if (typeof window === "undefined") return false;
  return !window.location.host.startsWith("localhost:81");
}

/**
 * Manages the realtime connection + in-memory pixel state.
 *
 * Three modes:
 *  1. PartyKit — if NEXT_PUBLIC_PARTYKIT_HOST is set (production).
 *  2. Socket.io — sandbox gateway (localhost:81 → ?XTransformPort=3004).
 *  3. Solo — local-only fallback (no server reachable).
 *
 * Both PartyKit and socket.io use the same wire protocol (event names as JSON
 * `type` fields), so message handling is unified via `handleMessage`.
 */
export function usePixelRoom(roomId: string, username: string): PixelRoomApi {
  const [mode, setMode] = useState<"connecting" | "solo" | "connected">("connecting");
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

  const pixelsRef = useRef<PixelColor[]>(
    new Array(DEFAULT_CANVAS_SIZE * DEFAULT_CANVAS_SIZE).fill(null)
  );
  const dirtyRef = useRef<Set<number> | "all">("all");
  const undoStackRef = useRef<HistoryEntry[]>([]);
  const redoStackRef = useRef<HistoryEntry[]>([]);
  const outboxRef = useRef<PixelUpdate[]>([]);
  const outboxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadPendingRef = useRef<{ size: CanvasSize; pixels: PixelColor[] } | null>(null);
  const sendRef = useRef<SendFn>(() => {});

  const markDirty = useCallback((indices: number[] | "all") => {
    if (indices === "all") {
      dirtyRef.current = "all";
    } else if (dirtyRef.current !== "all") {
      for (const i of indices) dirtyRef.current.add(i);
    }
  }, []);

  const syncHistoryFlags = useCallback(() => {
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  }, []);

  // myId ref so handleMessage can read the latest value without re-binding.
  const myIdRef = useRef<string | null>(null);
  useEffect(() => {
    myIdRef.current = myId;
  }, [myId]);

  const applyPixels = useCallback(
    (px: PixelUpdate[]) => {
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
    },
    [markDirty]
  );

  const flushOutbox = useCallback(() => {
    outboxTimerRef.current = null;
    if (outboxRef.current.length === 0) return;
    sendRef.current(EVENTS.PLACE, { pixels: outboxRef.current });
    outboxRef.current = [];
  }, []);

  const applyAndSend = useCallback(
    (pixels: PixelUpdate[]) => {
      if (pixels.length === 0) return;
      applyPixels(pixels);
      const socket = sendRef.current;
      outboxRef.current.push(...pixels);
      if (!outboxTimerRef.current) {
        outboxTimerRef.current = setTimeout(flushOutbox, 50);
      }
    },
    [applyPixels, flushOutbox]
  );

  /* ---------- Unified message handler (works for both transports) ---------- */
  const handleMessage = useCallback(
    (data: any) => {
      switch (data.type) {
        case EVENTS.SYNC:
          pixelsRef.current = data.pixels.slice();
          setSizeState(data.size);
          setPlayers(data.players);
          setPlayerCount(data.players.length);
          setHostId(data.hostId);
          {
            const me = data.players.find((p: Player) => p.id === data.yourId);
            setMyRole(me?.role ?? "drawer");
          }
          undoStackRef.current = [];
          redoStackRef.current = [];
          syncHistoryFlags();
          dirtyRef.current = "all";
          break;
        case EVENTS.PLACED:
          if (data.playerId === myIdRef.current) return;
          applyPixels(data.pixels);
          break;
        case EVENTS.PLAYER_JOINED:
          setPlayerCount(data.playerCount);
          setPlayers((prev) =>
            prev.some((p) => p.id === data.player.id) ? prev : [...prev, data.player]
          );
          break;
        case EVENTS.PLAYER_LEFT:
          setPlayerCount(data.playerCount);
          setPlayers((prev) => prev.filter((p) => p.id !== data.playerId));
          break;
        case EVENTS.SIZE_CHANGED:
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
          break;
        case EVENTS.CLEARED:
          {
            const s = sizeOf(pixelsRef.current);
            pixelsRef.current = new Array(s * s).fill(null);
            undoStackRef.current = [];
            redoStackRef.current = [];
            syncHistoryFlags();
            dirtyRef.current = "all";
          }
          break;
        case EVENTS.CHAT_BROADCAST:
          setChat((prev) => [...prev, data as ChatMessage].slice(-100));
          break;
        case EVENTS.ROLE_CHANGED:
          setPlayers((prev) =>
            prev.map((p) => (p.id === data.playerId ? { ...p, role: data.role } : p))
          );
          if (data.playerId === myIdRef.current) setMyRole(data.role);
          break;
        case EVENTS.HOST_CHANGED:
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
          if (data.hostId === myIdRef.current) setMyRole("host");
          break;
        case EVENTS.CLEAR_VOTE_REQUESTED:
          setClearVote({
            requesterId: data.requesterId,
            yes: 1,
            no: 0,
            votesNeeded: data.votesNeeded,
            expiresAt: Date.now() + data.timeoutMs,
          });
          break;
        case EVENTS.CLEAR_VOTE_CAST:
          setClearVote((prev) =>
            prev
              ? { ...prev, yes: data.yes, no: data.no, votesNeeded: data.votesNeeded }
              : prev
          );
          break;
        case EVENTS.CLEAR_VOTE_RESULT:
          setClearVote(null);
          if (!data.passed) setErrorMessage("Clear vote didn't pass.");
          break;
        case EVENTS.ERROR:
          setErrorMessage(data.message);
          break;
        case EVENTS.KICKED:
          setErrorMessage("You were kicked by the host.");
          setTimeout(() => {
            if (typeof window !== "undefined") window.location.href = "/";
          }, 2000);
          break;
      }
    },
    [applyPixels, syncHistoryFlags]
  );

  /* ---------- Decide mode + connect ---------- */
  useEffect(() => {
    let disposed = false;
    let connectTimeout: ReturnType<typeof setTimeout> | null = null;

    const goSolo = () => {
      if (disposed) return;
      setMode("solo");
      setPlayerCount(1);
      setMyId("solo");
      setMyRole("host");
      setHostId("solo");
      setPlayers([{ id: "solo", name: username, color: "#34d399", role: "host" }]);
      dirtyRef.current = "all";
      sendRef.current = () => {}; // no-op in solo
    };

    // Mode 1: PartyKit (production).
    if (PARTYKIT_HOST) {
      let connected = false;
      const socket = new PartySocket({
        host: PARTYKIT_HOST,
        room: roomId,
        party: "room",
        query: { name: username },
      });
      socket.onmessage = (e) => {
        try {
          handleMessage(JSON.parse(e.data));
        } catch {
          /* ignore malformed */
        }
      };
      sendRef.current = (type, data) => {
        socket.send(JSON.stringify({ type, ...data }));
      };
      socket.addEventListener("open", () => {
        if (disposed) return;
        connected = true;
        if (connectTimeout) clearTimeout(connectTimeout);
        setMode("connected");
        setMyId(socket.id ?? null);
      });
      // Fallback to solo if we can't connect in 6s.
      connectTimeout = setTimeout(() => {
        if (!disposed && !connected) {
          socket.close();
          goSolo();
        }
      }, 6000);
      return () => {
        disposed = true;
        if (connectTimeout) clearTimeout(connectTimeout);
        socket.close();
      };
    }

    // Mode 2: Solo fallback (deployed host with no server configured).
    if (!REALTIME_URL && isDeployedHost()) {
      goSolo();
      return;
    }

    // Mode 3: Socket.io (sandbox gateway or explicit REALTIME_URL).
    const socket: Socket = REALTIME_URL
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

    sendRef.current = (type, data) => {
      if (socket.connected) socket.emit(type, data ?? {});
    };

    connectTimeout = setTimeout(() => {
      if (!disposed && !socket.connected) goSolo();
    }, 4000);

    socket.on("connect", () => {
      if (disposed) return;
      if (connectTimeout) clearTimeout(connectTimeout);
      setMode("connected");
      setMyId(socket.id);
      socket.emit(EVENTS.JOIN, { roomId, name: username });
    });

    socket.on("disconnect", () => {
      if (!disposed) setMode("connecting");
    });

    // Wire all events through the unified handler.
    const events = [
      EVENTS.SYNC,
      EVENTS.PLACED,
      EVENTS.PLAYER_JOINED,
      EVENTS.PLAYER_LEFT,
      EVENTS.SIZE_CHANGED,
      EVENTS.CLEARED,
      EVENTS.CHAT_BROADCAST,
      EVENTS.ROLE_CHANGED,
      EVENTS.HOST_CHANGED,
      EVENTS.CLEAR_VOTE_REQUESTED,
      EVENTS.CLEAR_VOTE_CAST,
      EVENTS.CLEAR_VOTE_RESULT,
      EVENTS.ERROR,
      EVENTS.KICKED,
    ];
    for (const ev of events) {
      socket.on(ev, (d: any) => handleMessage({ type: ev, ...d }));
    }

    return () => {
      disposed = true;
      if (connectTimeout) clearTimeout(connectTimeout);
      socket.disconnect();
      sendRef.current = () => {};
    };
  }, [roomId, username, handleMessage]);

  /* ---------- Actions ---------- */

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
        undoStackRef.current.push({ next: pixels.slice(), prev, _ts: now });
        if (undoStackRef.current.length > MAX_HISTORY) undoStackRef.current.shift();
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
      const curSize = sizeOf(pixelsRef.current);
      pixelsRef.current = newPixels.slice();
      setSizeState(newSize);
      dirtyRef.current = "all";
      undoStackRef.current = [];
      redoStackRef.current = [];
      syncHistoryFlags();
      // If connected, broadcast size change + pixels.
      if (mode !== "solo" && (PARTYKIT_HOST || REALTIME_URL || !isDeployedHost())) {
        if (newSize !== curSize) {
          loadPendingRef.current = { size: newSize, pixels: newPixels.slice() };
          sendRef.current(EVENTS.SET_SIZE, { size: newSize });
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
        if (updates.length) sendRef.current(EVENTS.PLACE, { pixels: updates });
      }
    },
    [mode, syncHistoryFlags]
  );

  const setSize = useCallback(
    (newSize: CanvasSize) => {
      if (mode === "solo") {
        pixelsRef.current = new Array(newSize * newSize).fill(null);
        setSizeState(newSize);
        dirtyRef.current = "all";
      } else {
        sendRef.current(EVENTS.SET_SIZE, { size: newSize });
      }
    },
    [mode]
  );

  const clear = useCallback(() => {
    if (mode === "solo") {
      const s = sizeOf(pixelsRef.current);
      pixelsRef.current = new Array(s * s).fill(null);
      dirtyRef.current = "all";
    } else {
      sendRef.current(EVENTS.CLEAR, {});
    }
  }, [mode]);

  const voteClear = useCallback((vote: boolean) => {
    sendRef.current(EVENTS.VOTE_CLEAR, { vote });
    setClearVote(null);
  }, []);

  const sendChat = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t) return;
      if (mode === "solo") {
        setChat((prev) =>
          [
            ...prev,
            {
              id: Math.random().toString(36).slice(2),
              playerId: "solo",
              playerName: username,
              color: "#34d399",
              text: t,
              ts: Date.now(),
            },
          ].slice(-100)
        );
      } else {
        sendRef.current(EVENTS.CHAT, { text: t });
      }
    },
    [mode, username]
  );

  const kick = useCallback((targetId: string) => {
    sendRef.current(EVENTS.KICK, { targetId });
  }, []);

  const setRole = useCallback((targetId: string, role: "drawer" | "viewer") => {
    sendRef.current(EVENTS.SET_ROLE, { targetId, role });
  }, []);

  const dismissError = useCallback(() => setErrorMessage(null), []);

  // Clear-vote expiry safety timer.
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
