/**
 * PixelParty PartyKit server.
 *
 * One party instance = one room. State lives in-memory as class properties
 * (ephemeral — PartyKit keeps the instance alive while connections exist and
 * for a grace period after). This mirrors the socket.io server exactly; the
 * wire protocol (event names + payloads) is shared via constants.ts.
 *
 * Deploy: `npx partykit deploy` → gives you https://pixelparty.<user>.partykit.dev
 * Set that host as NEXT_PUBLIC_PARTYKIT_HOST on Vercel.
 */

import type * as Party from "partykit/server";
import {
  DEFAULT_CANVAS_SIZE,
  CLEAR_VOTE_TIMEOUT_MS,
  colorForPlayer,
  sanitizeName,
  type CanvasSize,
  type PixelColor,
  type PixelUpdate,
  type Player,
  type Role,
  type ChatMessage,
} from "../src/lib/pixel-party/constants";

interface ClearVote {
  requesterId: string;
  yes: Set<string>;
  no: Set<string>;
  expiresAt: number;
  timer: ReturnType<typeof setTimeout> | null;
}

export default class PixelPartyRoom implements Party.Server {
  constructor(readonly room: Party.Room) {}

  size: CanvasSize = DEFAULT_CANVAS_SIZE;
  pixels: PixelColor[] = new Array(DEFAULT_CANVAS_SIZE * DEFAULT_CANVAS_SIZE).fill(null);
  players: Map<string, Player> = new Map();
  hostId: string = "";
  clearVote: ClearVote | null = null;

  /* ----------------------------- Helpers ----------------------------- */

  emptyPixels(size: CanvasSize): PixelColor[] {
    return new Array(size * size).fill(null);
  }

  broadcast(msg: object, exclude?: string) {
    this.room.broadcast(JSON.stringify(msg), exclude ? [exclude] : undefined);
  }

  sendTo(conn: Party.Connection, msg: object) {
    conn.send(JSON.stringify(msg));
  }

  systemMessage(text: string): ChatMessage {
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

  syncTo(conn: Party.Connection) {
    this.sendTo(conn, {
      type: "sync",
      size: this.size,
      pixels: this.pixels,
      players: Array.from(this.players.values()),
      yourId: conn.id,
      hostId: this.hostId,
    });
  }

  /* ----------------------------- Connection lifecycle ----------------------------- */

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    // Extract username from query param.
    const url = new URL(ctx.request.url);
    const name = sanitizeName(url.searchParams.get("name") || "Anon");

    const isFirst = this.players.size === 0;
    const role: Role = isFirst ? "host" : "drawer";
    const player: Player = {
      id: conn.id,
      name,
      color: colorForPlayer(conn.id),
      role,
    };
    this.players.set(conn.id, player);
    if (isFirst) this.hostId = conn.id;

    // Send current state to the new connection.
    this.syncTo(conn);

    // Notify everyone else.
    this.broadcast(
      { type: "player-joined", player, playerCount: this.players.size },
      conn.id
    );
    this.broadcast(this.systemMessage(`${name} joined`));
    console.log(`[join] ${conn.id} (${name}) as ${role} (${this.players.size} players)`);
  }

  onClose(conn: Party.Connection) {
    const player = this.players.get(conn.id);
    this.players.delete(conn.id);

    // Reassign host if needed.
    if (this.hostId === conn.id && this.players.size > 0) {
      const nextHost = this.players.values().next().value;
      if (nextHost) {
        nextHost.role = "host";
        this.hostId = nextHost.id;
        this.broadcast({ type: "host-changed", hostId: nextHost.id });
        this.broadcast({ type: "role-changed", playerId: nextHost.id, role: "host" });
        this.broadcast(this.systemMessage(`${nextHost.name} is now the host`));
      }
    }

    // Cancel active clear vote if requester left.
    if (this.clearVote?.requesterId === conn.id) {
      if (this.clearVote.timer) clearTimeout(this.clearVote.timer);
      this.clearVote = null;
      this.broadcast({ type: "clear-vote-result", passed: false, yes: 0, no: 0 });
    }

    this.broadcast({ type: "player-left", playerId: conn.id, playerCount: this.players.size });
    if (player) {
      this.broadcast(this.systemMessage(`${player.name} left`));
    }
    console.log(`[leave] ${conn.id} (${this.players.size} players)`);
  }

  /* ----------------------------- Message handling ----------------------------- */

  onMessage(raw: string, sender: Party.Connection) {
    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    const player = this.players.get(sender.id);
    if (!player) return;

    switch (data.type) {
      case "place":
        this.handlePlace(sender, player, data);
        break;
      case "set-size":
        this.handleSetSize(sender, player, data);
        break;
      case "clear":
        this.handleClear(sender, player);
        break;
      case "vote-clear":
        this.handleVoteClear(sender, player, data);
        break;
      case "chat":
        this.handleChat(sender, player, data);
        break;
      case "kick":
        this.handleKick(sender, player, data);
        break;
      case "set-role":
        this.handleSetRole(sender, player, data);
        break;
    }
  }

  handlePlace(sender: Party.Connection, player: Player, data: any) {
    if (player.role === "viewer") {
      this.sendTo(sender, {
        type: "error",
        code: "view-only",
        message: "You're a viewer — the host made you read-only.",
      });
      return;
    }
    const pixels: PixelUpdate[] = Array.isArray(data.pixels) ? data.pixels : [];
    const cleaned: PixelUpdate[] = [];
    for (const p of pixels) {
      if (p.x < 0 || p.x >= this.size || p.y < 0 || p.y >= this.size) continue;
      this.pixels[p.y * this.size + p.x] = p.color;
      cleaned.push({ x: p.x, y: p.y, color: p.color });
    }
    if (cleaned.length === 0) return;
    // Broadcast to everyone else.
    this.broadcast({ type: "placed", playerId: sender.id, pixels: cleaned }, sender.id);
  }

  handleSetSize(sender: Party.Connection, player: Player, data: any) {
    if (player.role !== "host") {
      this.sendTo(sender, {
        type: "error",
        code: "host-only",
        message: "Only the host can change the canvas size.",
      });
      return;
    }
    const size = data.size;
    if (![16, 32, 64].includes(size)) return;
    this.size = size;
    this.pixels = this.emptyPixels(size);
    this.broadcast({ type: "size-changed", size: this.size, pixels: this.pixels });
    this.broadcast(this.systemMessage(`Canvas resized to ${size}×${size}`));
    console.log(`[size] -> ${size}x${size}`);
  }

  handleClear(sender: Party.Connection, player: Player) {
    const others = Array.from(this.players.values()).filter(
      (p) => p.id !== sender.id && p.role !== "viewer"
    );
    // Host alone (or with only viewers) → force clear.
    if (player.role === "host" && others.length === 0) {
      this.pixels = this.emptyPixels(this.size);
      this.broadcast({ type: "cleared", size: this.size });
      this.broadcast(this.systemMessage("Canvas cleared by host"));
      console.log(`[clear] host force`);
      return;
    }
    // Otherwise start a vote.
    this.startClearVote(sender);
  }

  startClearVote(requester: Party.Connection) {
    if (this.clearVote?.timer) clearTimeout(this.clearVote.timer);

    const voters = Array.from(this.players.values()).filter(
      (p) => p.id !== requester.id
    );
    const votesNeeded = Math.max(1, Math.ceil(voters.length / 2));

    this.clearVote = {
      requesterId: requester.id,
      yes: new Set([requester.id]),
      no: new Set(),
      expiresAt: Date.now() + CLEAR_VOTE_TIMEOUT_MS,
      timer: null,
    };

    this.broadcast({
      type: "clear-vote-requested",
      requesterId: requester.id,
      votesNeeded,
      timeoutMs: CLEAR_VOTE_TIMEOUT_MS,
    });
    this.broadcast(
      this.systemMessage(`Clear requested — ${votesNeeded - 1} more vote(s) needed`)
    );

    this.clearVote.timer = setTimeout(() => this.resolveClearVote(), CLEAR_VOTE_TIMEOUT_MS);
  }

  resolveClearVote() {
    if (!this.clearVote) return;
    const { yes, no, timer } = this.clearVote;
    if (timer) clearTimeout(timer);
    const votesNeeded = Math.max(1, Math.ceil((this.players.size - 1) / 2));
    const passed = yes.size > no.size && yes.size >= votesNeeded + 1;
    this.clearVote = null;

    this.broadcast({ type: "clear-vote-result", passed, yes: yes.size, no: no.size });

    if (passed) {
      this.pixels = this.emptyPixels(this.size);
      this.broadcast({ type: "cleared", size: this.size });
      this.broadcast(this.systemMessage("Canvas cleared"));
      console.log(`[clear] passed`);
    } else {
      this.broadcast(this.systemMessage("Clear vote failed"));
      console.log(`[clear] failed`);
    }
  }

  handleVoteClear(sender: Party.Connection, player: Player, data: any) {
    if (!this.clearVote) return;
    if (player.id === this.clearVote.requesterId) return;

    if (data.vote) {
      this.clearVote.yes.add(sender.id);
      this.clearVote.no.delete(sender.id);
    } else {
      this.clearVote.no.add(sender.id);
      this.clearVote.yes.delete(sender.id);
    }
    this.broadcast({
      type: "clear-vote-cast",
      voterId: sender.id,
      yes: this.clearVote.yes.size,
      no: this.clearVote.no.size,
      votesNeeded: Math.max(1, Math.ceil((this.players.size - 1) / 2)),
    });
    // Resolve early if everyone has voted.
    const voted = this.clearVote.yes.size + this.clearVote.no.size;
    if (voted >= this.players.size) {
      this.resolveClearVote();
    }
  }

  handleChat(sender: Party.Connection, player: Player, data: any) {
    const text = String(data.text || "").slice(0, 280).trim();
    if (!text) return;
    const msg: ChatMessage = {
      id: Math.random().toString(36).slice(2, 10),
      playerId: player.id,
      playerName: player.name,
      color: player.color,
      text,
      ts: Date.now(),
    };
    this.broadcast({ type: "chat-broadcast", ...msg });
  }

  handleKick(sender: Party.Connection, player: Player, data: any) {
    if (player.role !== "host") {
      this.sendTo(sender, {
        type: "error",
        code: "host-only",
        message: "Only the host can kick.",
      });
      return;
    }
    const target = data.targetId;
    if (!target || target === sender.id) return;
    const targetPlayer = this.players.get(target);
    const targetConn = this.room.getConnection(target);
    if (targetConn) {
      this.sendTo(targetConn, { type: "kicked", reason: "Kicked by the host" });
      targetConn.close();
    }
    this.broadcast(this.systemMessage(`${targetPlayer?.name ?? "Someone"} was kicked`));
    console.log(`[kick] ${target}`);
  }

  handleSetRole(sender: Party.Connection, player: Player, data: any) {
    if (player.role !== "host") {
      this.sendTo(sender, {
        type: "error",
        code: "host-only",
        message: "Only the host can change roles.",
      });
      return;
    }
    const target = data.targetId;
    const role = data.role;
    if (!target || (role !== "drawer" && role !== "viewer")) return;
    const targetPlayer = this.players.get(target);
    if (!targetPlayer || targetPlayer.role === "host") return;
    targetPlayer.role = role;
    this.broadcast({ type: "role-changed", playerId: target, role });
    this.broadcast(
      this.systemMessage(
        `${targetPlayer.name} is now ${role === "viewer" ? "a viewer" : "a drawer"}`
      )
    );
    console.log(`[role] ${target} -> ${role}`);
  }
}

PixelPartyRoom satisfies Party.Worker;
