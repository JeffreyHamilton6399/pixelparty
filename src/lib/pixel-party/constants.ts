/**
 * PixelParty shared constants & protocol types.
 *
 * These are imported by BOTH the Next.js frontend and the socket.io
 * mini-service so the wire protocol stays in sync. The mini-service
 * imports this file directly (it lives outside src/ but resolves via
 * the project root).
 */

/** The fixed 24-color palette — forces creativity (r/place style). */
export const PALETTE: string[] = [
  "#000000", "#1a1a2e", "#16213e", "#0f3460", "#533483", "#e94560",
  "#f38ba8", "#f5c2e7", "#89b4fa", "#94e2d5", "#a6e3a1", "#f9e2af",
  "#fab387", "#eba0ac", "#f77f00", "#fcbf49", "#eae2b7", "#d62828",
  "#003049", "#2a9d8f", "#e76f51", "#264653", "#e9c46a", "#f4f1de",
];

/** Supported canvas sizes (square, N x N). Mobile capped at 64 for perf. */
export const CANVAS_SIZES = [16, 32, 64] as const;
export type CanvasSize = (typeof CANVAS_SIZES)[number];

export const DEFAULT_CANVAS_SIZE: CanvasSize = 32;
export const MAX_CANVAS_SIZE_MOBILE: CanvasSize = 64;

/**
 * Distinct cursor colors assigned to players by the server.
 * Hash socket.id -> index for a stable per-session color.
 */
export const CURSOR_COLORS: string[] = [
  "#f87171", "#fb923c", "#facc15", "#a3e635", "#34d399", "#22d3ee",
  "#60a5fa", "#a78bfa", "#f472b6", "#fb7185", "#fcd34d", "#4ade80",
];

/** A pixel value is a palette hex string, or null for empty (erased). */
export type PixelColor = string | null;

/** A single cell update. */
export interface PixelUpdate {
  x: number;
  y: number;
  color: PixelColor;
}

/** Player descriptor shared with clients. */
export interface Player {
  id: string;
  color: string;
}

/* ----------------------------- Client -> Server ---------------------------- */

export interface JoinPayload {
  roomId: string;
}

export interface SetSizePayload {
  size: CanvasSize;
}

export interface PlacePayload {
  /** Batch of pixels placed by this client in one frame. */
  pixels: PixelUpdate[];
}

export interface CursorPayload {
  /** Fractional grid coordinates (0..size). */
  x: number;
  y: number;
}

/* ----------------------------- Server -> Client ---------------------------- */

export interface SyncPayload {
  size: CanvasSize;
  /** Flat array length size*size, row-major (y*size + x). null = empty. */
  pixels: PixelColor[];
  players: Player[];
  yourId: string;
}

export interface PlacedPayload {
  playerId: string;
  pixels: PixelUpdate[];
}

export interface CursorBroadcastPayload {
  playerId: string;
  x: number;
  y: number;
  color: string;
}

export interface PlayerJoinedPayload {
  player: Player;
  playerCount: number;
}

export interface PlayerLeftPayload {
  playerId: string;
  playerCount: number;
}

export interface SizeChangedPayload {
  size: CanvasSize;
  pixels: PixelColor[];
}

/** Event names — single source of truth. */
export const EVENTS = {
  // c2s
  JOIN: "join",
  SET_SIZE: "set-size",
  PLACE: "place",
  CURSOR: "cursor",
  CLEAR: "clear",
  // s2c
  SYNC: "sync",
  PLACED: "placed",
  CURSOR_BROADCAST: "cursor-broadcast",
  PLAYER_JOINED: "player-joined",
  PLAYER_LEFT: "player-left",
  SIZE_CHANGED: "size-changed",
  CLEARED: "cleared",
} as const;

/** Room GC: delete rooms inactive for this long. */
export const ROOM_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/** Character set for room codes (no ambiguous chars: 0/O, 1/I). */
const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 6;

/** Generate a human-friendly random room code. */
export function generateRoomCode(): string {
  let out = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    out += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }
  return out;
}

/** Normalize/sanitize a user-entered room code. */
export function normalizeRoomCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z2-9]/g, "")
    .slice(0, ROOM_CODE_LENGTH);
}

/** Assign a stable cursor color from an id. */
export function colorForPlayer(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return CURSOR_COLORS[hash % CURSOR_COLORS.length];
}
