"use client";

interface ColorPickerProps {
  color: string;
  onChange: (hex: string) => void;
  /** Size class for the swatch. */
  className?: string;
}

/**
 * Minimal color picker: just a swatch. Click to open the native OS color
 * picker (any color, works on mobile + desktop). No hex field, no shades row.
 */
export function ColorPicker({ color, onChange, className }: ColorPickerProps) {
  return (
    <div className={className ?? "h-9 w-full"}>
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
    </div>
  );
}
