import { Suspense } from "react";
import { PixelPartyApp } from "@/components/pixel-party/pixel-party-app";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <PixelPartyApp />
    </Suspense>
  );
}
