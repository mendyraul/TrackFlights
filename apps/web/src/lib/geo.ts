/**
 * Formats a latitude/longitude pair with hemisphere suffixes.
 *
 * The sidebar used to render a hardcoded "°N, °W", so a negative longitude
 * came out as "-80.2036°W" — a double negative that reads as 80° east. The
 * hemisphere comes from the sign; the printed number is always positive.
 */
export function formatCoords(
  lat: number | null | undefined,
  lon: number | null | undefined,
  digits = 4
): string {
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return "--";
  }

  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";

  return `${Math.abs(lat).toFixed(digits)}°${ns}, ${Math.abs(lon).toFixed(digits)}°${ew}`;
}

/**
 * Vertical-speed indicator: climbing, descending, or level. A rate of exactly
 * zero is level flight, not a descent.
 */
export function formatVerticalSpeed(fpm: number | null | undefined): string | null {
  if (fpm == null || !Number.isFinite(fpm)) return null;
  if (fpm === 0) return "level";
  return `${fpm > 0 ? "↑" : "↓"} ${Math.abs(fpm).toLocaleString()} fpm`;
}
