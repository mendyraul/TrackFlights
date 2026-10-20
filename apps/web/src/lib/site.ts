/**
 * Site identity in one place: name, author and outbound links.
 *
 * linkedinUrl and resumeUrl are intentionally empty until filled in; the
 * footer hides any link that is empty rather than rendering a dead one.
 */
export const site = {
  name: "MIA Flight Tracker",
  url: "https://track-flights-web.vercel.app",
  description:
    "Live aircraft around Miami International, decoded from ADS-B by a Raspberry Pi receiver on my roof.",
  author: "Raul Mendy",
  repoUrl: "https://github.com/mendyraul/TrackFlights",
  githubUrl: "https://github.com/mendyraul",
  linkedinUrl: "",
  resumeUrl: "",
} as const;

const OG_ALT =
  "Map of South Florida with aircraft decoded by the MIA Flight Tracker ADS-B receiver";

/** Per-page metadata with matching Open Graph / Twitter fields (Next doesn't derive them). */
export function pageMetadata(path: string, title: string, description: string) {
  const full = path === "/" ? title : `${title} · ${site.name}`;
  // A page-level openGraph object replaces (not merges) the root's
  // file-based opengraph-image, so list the image explicitly.
  const image = { url: "/opengraph-image.png", width: 1200, height: 630, alt: OG_ALT };
  return {
    title: path === "/" ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: full,
      description,
      url: path,
      siteName: site.name,
      type: "website" as const,
      images: [image],
    },
    twitter: {
      card: "summary_large_image" as const,
      title: full,
      description,
      images: [{ ...image, url: "/twitter-image.png" }],
    },
  };
}
