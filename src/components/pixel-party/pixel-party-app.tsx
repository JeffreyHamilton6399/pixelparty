"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Landing } from "@/components/pixel-party/landing";
import { Room } from "@/components/pixel-party/room";
import { TermsModal } from "@/components/pixel-party/terms-modal";
import { UsernameDialog } from "@/components/pixel-party/username-dialog";
import { normalizeRoomCode, sanitizeName } from "@/lib/pixel-party/constants";

const AGREED_KEY = "pixelparty:agreed-v1";
const NAME_KEY = "pixelparty:name";

/**
 * Top-level router. Rooms are addressed via `?room=ABC123`.
 *
 * Flow: Terms gate → (if room) Username → Room.
 * The username is remembered in localStorage for return visits.
 */
export function PixelPartyApp() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [agreed, setAgreed] = useState<boolean | null>(null);
  const [username, setUsername] = useState<string>("");

  useEffect(() => {
    let val = false;
    try {
      val = localStorage.getItem(AGREED_KEY) === "1";
    } catch {
      val = false;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAgreed(val);
    try {
      const saved = localStorage.getItem(NAME_KEY);
      if (saved) setUsername(sanitizeName(saved));
    } catch {
      /* ignore */
    }
  }, []);

  const accept = useCallback(() => {
    try {
      localStorage.setItem(AGREED_KEY, "1");
    } catch {
      /* ignore */
    }
    setAgreed(true);
  }, []);

  const decline = useCallback(() => {
    if (typeof window !== "undefined") {
      window.location.href = "https://www.google.com";
    }
  }, []);

  const enterRoom = useCallback(
    (code: string) => {
      const clean = normalizeRoomCode(code);
      if (clean.length < 4) return;
      router.push(`/?room=${clean}`);
    },
    [router]
  );

  const leaveRoom = useCallback(() => {
    router.push("/");
  }, [router]);

  const confirmName = useCallback(
    (name: string) => {
      const clean = sanitizeName(name);
      setUsername(clean);
      try {
        localStorage.setItem(NAME_KEY, clean);
      } catch {
        /* ignore */
      }
    },
    []
  );

  if (agreed === null) return null;

  const roomParam = searchParams.get("room");
  const roomId = roomParam ? normalizeRoomCode(roomParam) : null;
  const hasRoom = !!roomId && roomId.length >= 4;

  if (!agreed) {
    return (
      <>
        <Landing onCreate={enterRoom} onJoin={enterRoom} />
        <TermsModal open mode="gate" onAgree={accept} onDecline={decline} />
      </>
    );
  }

  if (!hasRoom) {
    return <Landing onCreate={enterRoom} onJoin={enterRoom} />;
  }

  // Have a room + agreed, but no username yet → prompt for name.
  if (!username) {
    return <UsernameDialog open onConfirm={confirmName} />;
  }

  return <Room roomId={roomId!} username={username} onLeave={leaveRoom} />;
}
