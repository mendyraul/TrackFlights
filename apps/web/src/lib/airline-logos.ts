/**
 * Airline logo lookup.
 *
 * Logos are vendored into /public/airlines rather than hotlinked: the site's
 * CSP allows remote images, but a third-party CDN in the hot path of every
 * marker popup is a availability and egress risk we don't need. Source is the
 * selfh.st icon set (CC-BY-4.0) — see public/airlines/ATTRIBUTION.md.
 *
 * The set only covers eight carriers, none of them the Latin American or
 * European airlines that make up much of MIA's traffic, so the common case is
 * *no* logo. Callers must render the initials fallback, not an empty box.
 */

/** IATA airline code → file in /public/airlines. */
const LOGO_BY_IATA: Readonly<Record<string, string>> = {
  AA: "american-airlines",
  AS: "alaska-airlines",
  B6: "jetblue-airways",
  DL: "delta-air-lines",
  LH: "lufthansa",
  NK: "spirit-airlines",
  UA: "united-airlines",
  WN: "southwest-airlines",
};

/**
 * Path to an airline's logo, or null when we don't have one.
 * Codes are matched case-insensitively.
 */
export function airlineLogoPath(iata: string | null | undefined): string | null {
  if (!iata) return null;
  const slug = LOGO_BY_IATA[iata.trim().toUpperCase()];
  return slug ? `/airlines/${slug}.svg` : null;
}

/** True when a vendored logo exists for this airline code. */
export function hasAirlineLogo(iata: string | null | undefined): boolean {
  return airlineLogoPath(iata) !== null;
}

/**
 * Short text stand-in for airlines with no logo: the IATA code when we have
 * one, else initials from the airline name, else a dash.
 */
export function airlineInitials(
  iata: string | null | undefined,
  name: string | null | undefined
): string {
  const code = iata?.trim().toUpperCase();
  if (code) return code;

  const words = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (words.length === 0) return "—";

  return words
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");
}
