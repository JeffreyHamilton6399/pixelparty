/**
 * PixelParty shared constants & protocol types.
 *
 * Imported by BOTH the Next.js frontend and the socket.io mini-service.
 */

/** Supported canvas sizes (square, N x N). */
export const CANVAS_SIZES = [16, 32, 64] as const;
export type CanvasSize = (typeof CANVAS_SIZES)[number];

export const DEFAULT_CANVAS_SIZE: CanvasSize = 32;

/** Distinct colors assigned to players (avatar + cursor accent). */
export const CURSOR_COLORS: string[] = [
  "#f87171", "#fb923c", "#facc15", "#a3e635", "#34d399", "#22d3ee",
  "#60a5fa", "#a78bfa", "#f472b6", "#fb7185", "#fcd34d", "#4ade80",
];

/** A pixel value is a hex string, or null for empty (erased). */
export type PixelColor = string | null;

/** A single cell update. */
export interface PixelUpdate {
  x: number;
  y: number;
  color: PixelColor;
}

/** Player role in a room. */
export type Role = "host" | "drawer" | "viewer";

/** Player descriptor shared with clients. */
export interface Player {
  id: string;
  name: string;
  color: string;
  role: Role;
}

/* ----------------------------- Client -> Server ---------------------------- */

export interface JoinPayload {
  roomId: string;
  name: string;
}

export interface SetSizePayload {
  size: CanvasSize;
}

export interface PlacePayload {
  pixels: PixelUpdate[];
}

export interface ChatPayload {
  text: string;
}

export interface KickPayload {
  targetId: string;
}

export interface SetRolePayload {
  targetId: string;
  role: "drawer" | "viewer";
}

/* ----------------------------- Server -> Client ---------------------------- */

export interface SyncPayload {
  size: CanvasSize;
  /** Flat array length size*size, row-major (y*size + x). null = empty. */
  pixels: PixelColor[];
  players: Player[];
  yourId: string;
  hostId: string;
}

export interface PlacedPayload {
  playerId: string;
  pixels: PixelUpdate[];
}

export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  color: string;
  text: string;
  ts: number;
  system?: boolean;
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

export interface RoleChangedPayload {
  playerId: string;
  role: Role;
}

export interface HostChangedPayload {
  hostId: string;
}

export interface KickedPayload {
  /** If you receive this, you were kicked. */
  reason: string;
}

export interface ClearVoteRequestedPayload {
  /** Who requested the clear. */
  requesterId: string;
  /** Total votes needed to pass (excludes requester, who auto-votes yes). */
  votesNeeded: number;
  /** ms until the vote auto-expires. */
  timeoutMs: number;
}

export interface ClearVoteCastPayload {
  voterId: string;
  yes: number;
  no: number;
  votesNeeded: number;
}

export interface ClearVoteResultPayload {
  passed: boolean;
  yes: number;
  no: number;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

/** Event names — single source of truth. */
export const EVENTS = {
  // c2s
  JOIN: "join",
  SET_SIZE: "set-size",
  PLACE: "place",
  CLEAR: "clear",
  CHAT: "chat",
  KICK: "kick",
  SET_ROLE: "set-role",
  VOTE_CLEAR: "vote-clear",
  // s2c
  SYNC: "sync",
  PLACED: "placed",
  PLAYER_JOINED: "player-joined",
  PLAYER_LEFT: "player-left",
  SIZE_CHANGED: "size-changed",
  CLEARED: "cleared",
  CHAT_BROADCAST: "chat-broadcast",
  ROLE_CHANGED: "role-changed",
  HOST_CHANGED: "host-changed",
  KICKED: "kicked",
  CLEAR_VOTE_REQUESTED: "clear-vote-requested",
  CLEAR_VOTE_CAST: "clear-vote-cast",
  CLEAR_VOTE_RESULT: "clear-vote-result",
  ERROR: "error",
} as const;

/** Room GC: delete rooms inactive for this long. */
export const ROOM_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/** How long a clear-canvas vote stays open. */
export const CLEAR_VOTE_TIMEOUT_MS = 20 * 1000; // 20s

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

/** Sanitize a display name. */
export function sanitizeName(raw: string): string {
  const clean = raw.trim().replace(/\s+/g, " ").slice(0, 16);
  return clean || "Anon";
}
