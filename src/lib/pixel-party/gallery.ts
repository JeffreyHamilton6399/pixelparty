"use client";

import type { CanvasSize, PixelColor } from "./constants";

/**
 * Local-only gallery backed by IndexedDB. No accounts, no server, no tracking —
 * saved art lives in the user's browser. This preserves PixelParty's "no
 * sign-up, free forever" promise while letting users keep their work.
 */

const DB_NAME = "pixelparty";
const DB_VERSION = 1;
const STORE = "artworks";

export interface Artwork {
  id: string;
  name: string;
  size: CanvasSize;
  pixels: PixelColor[];
  /** Small PNG thumbnail for the gallery grid. */
  thumbnail: string;
  createdAt: number;
  updatedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      })
  );
}

export function listArtworks(): Promise<Artwork[]> {
  return tx<IDBValidKey[]>("readonly", (s) => s.getAllKeys()).then(async (keys) => {
    const all = await tx<Artwork[]>("readonly", (s) => s.getAll());
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  });
}

export function saveArtwork(art: Artwork): Promise<void> {
  return tx("readwrite", (s) => s.put(art)).then(() => undefined);
}

export function deleteArtwork(id: string): Promise<void> {
  return tx("readwrite", (s) => s.delete(id)).then(() => undefined);
}

/** Generate a tiny PNG thumbnail from a pixel array. */
export function makeThumbnail(size: CanvasSize, pixels: PixelColor[]): string {
  const cp = 4;
  const c = document.createElement("canvas");
  c.width = size * cp;
  c.height = size * cp;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  ctx.imageSmoothingEnabled = false;
  for (let i = 0; i < pixels.length; i++) {
    if (!pixels[i]) continue;
    ctx.fillStyle = pixels[i];
    ctx.fillRect((i % size) * cp, Math.floor(i / size) * cp, cp, cp);
  }
  return c.toDataURL("image/png");
}

export function newArtworkId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
