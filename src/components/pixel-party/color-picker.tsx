"use client";

import { useRef } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ColorPickerProps {
  color: string;
  onChange: (hex: string) => void;
  /**
   * "stacked" — swatch on top, hex below (desktop sidebar).
   * "inline"  — swatch + hex side by side (mobile bottom bar).
   */
  layout?: "stacked" | "inline";
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * Full color picker (replaces the fixed 24-swatch palette). Uses the native
 * `<input type="color">` picker so the user can choose ANY color, plus a hex
 * text field for precise entry. Works on mobile (native OS picker) and desktop.
 */
export function ColorPicker({ color, onChange, layout = "stacked" }: ColorPickerProps) {
  const hexRef = useRef<HTMLInputElement>(null);

  const commitHex = (val: string) => {
    let v = val.trim();
    if (!v.startsWith("#")) v = "#" + v;
    if (HEX_RE.test(v)) onChange(v.toLowerCase());
  };

  const swatch = (
    <div className="relative h-full w-full">
      <div
        className="h-full w-full rounded-md border border-border"
        style={{ backgroundColor: color }}
      />
      <input
        type="color"
        value={color}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        aria-label="Open color picker"
      />
    </div>
  );

  if (layout === "inline") {
    return (
      <div className="flex items-center gap-1.5">
        <div className="h-8 w-8 shrink-0">{swatch}</div>
        <Input
          ref={hexRef}
          key={color}
          defaultValue={color}
          onBlur={(e) => commitHex(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commitHex((e.target as HTMLInputElement).value);
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="h-8 w-[5.5rem] text-center font-mono text-xs"
          aria-label="Hex color"
          maxLength={7}
          spellCheck={false}
        />
      </div>
    );
  }

  return (
    <div className={cn("flex w-full flex-col gap-1.5")}>
      <div className="h-9 w-full">{swatch}</div>
      <Input
        ref={hexRef}
        key={color}
        defaultValue={color}
        onBlur={(e) => commitHex(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commitHex((e.target as HTMLInputElement).value);
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="h-7 text-center font-mono text-xs"
        aria-label="Hex color"
        maxLength={7}
        spellCheck={false}
      />
    </div>
  );
}
