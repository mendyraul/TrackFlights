"use client";

import { useState } from "react";
import { airlineInitials, airlineLogoPath } from "@/lib/airline-logos";

interface Props {
  iata: string | null | undefined;
  name: string | null | undefined;
  /** Rendered box size in px. */
  size?: number;
  className?: string;
}

/**
 * Airline mark: the vendored logo when we have one, otherwise an initials
 * badge. Most MIA carriers have no logo in the icon set, so the badge is the
 * common path, not an edge case — it has to look deliberate.
 */
export function AirlineLogo({ iata, name, size = 24, className = "" }: Props) {
  const src = airlineLogoPath(iata);
  const [failed, setFailed] = useState(false);
  const label = name || iata || "Unknown airline";

  if (!src || failed) {
    return (
      <span
        role="img"
        aria-label={label}
        title={label}
        className={`inline-flex shrink-0 items-center justify-center rounded border border-gray-700 bg-gray-800/70 font-semibold text-gray-400 ${className}`}
        style={{ width: size, height: size, fontSize: Math.max(9, size * 0.38) }}
      >
        {airlineInitials(iata, name)}
      </span>
    );
  }

  return (
    // Plain <img>: these are tiny vendored SVGs, so next/image's optimizer
    // would add a serverless round-trip for no payload win.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={label}
      title={label}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={`shrink-0 object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
