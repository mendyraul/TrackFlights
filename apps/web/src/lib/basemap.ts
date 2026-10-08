/**
 * Basemap tile source.
 *
 * CARTO's keyless basemap tiles stopped serving map data — every request now
 * returns the same 2.5 KB "API KEY REQUIRED" placeholder at any zoom, so the
 * map rendered as a watermark grid. The default below is Esri's World Dark
 * Gray Canvas, which needs no key and suits the dark theme.
 *
 * To go back to CARTO, set NEXT_PUBLIC_CARTO_API_KEY. To use anything else,
 * set NEXT_PUBLIC_BASEMAP_URL (and NEXT_PUBLIC_BASEMAP_ATTRIBUTION).
 */

export interface Basemap {
  url: string;
  attribution: string;
}

const ESRI_DARK_GRAY: Basemap = {
  url: "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
  attribution: '&copy; <a href="https://www.esri.com/">Esri</a>',
};

const CARTO_ATTRIBUTION = '&copy; <a href="https://carto.com/">CARTO</a>';

export function resolveBasemap(env: Record<string, string | undefined>): Basemap {
  const customUrl = env.NEXT_PUBLIC_BASEMAP_URL?.trim();
  if (customUrl) {
    return {
      url: customUrl,
      attribution: env.NEXT_PUBLIC_BASEMAP_ATTRIBUTION?.trim() || "",
    };
  }

  const cartoKey = env.NEXT_PUBLIC_CARTO_API_KEY?.trim();
  if (cartoKey) {
    return {
      url: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?api_key=${encodeURIComponent(cartoKey)}`,
      attribution: CARTO_ATTRIBUTION,
    };
  }

  return ESRI_DARK_GRAY;
}

// Read through an explicit object: Next inlines NEXT_PUBLIC_* at build time
// only for statically analysable `process.env.X` member accesses.
export const basemap: Basemap = resolveBasemap({
  NEXT_PUBLIC_BASEMAP_URL: process.env.NEXT_PUBLIC_BASEMAP_URL,
  NEXT_PUBLIC_BASEMAP_ATTRIBUTION: process.env.NEXT_PUBLIC_BASEMAP_ATTRIBUTION,
  NEXT_PUBLIC_CARTO_API_KEY: process.env.NEXT_PUBLIC_CARTO_API_KEY,
});
