/**
 * Photos and measured numbers for the Behind the Scenes page.
 *
 * To add a photo: put the file in apps/web/public/behind-the-scenes/, set
 * `src` to "/behind-the-scenes/<file>", and set width/height to the image's
 * real pixel size (next/image uses them to reserve space and pick sizes).
 * A photo with an empty `src` is not rendered at all.
 */
export interface PhotoSlot {
  src: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
}

export const photos = {
  /** Step 1: the roof antenna, and the Pi + SDR in its case. */
  hardware: {
    src: "",
    alt: "The 1090 MHz antenna on the roof, and the Raspberry Pi with its SDR in a case",
    caption: "The antenna on my roof, and the Pi + SDR that decode it.",
    width: 1600,
    height: 1200,
  },
  /** Step 2: tar1090's range / polar plot. */
  rangePlot: {
    src: "",
    alt: "tar1090 polar range plot showing how far the receiver hears aircraft in each direction",
    caption: "Measured coverage: tar1090's range plot for my receiver.",
    width: 1600,
    height: 1200,
  },
  /** Step 3: tar1090 live view. */
  tar1090: {
    src: "",
    alt: "tar1090 live view with aircraft being decoded in real time",
    caption: "tar1090 on the Pi, decoding aircraft in real time.",
    width: 1600,
    height: 1000,
  },
  /** Step 8: this site's map with a flight selected. */
  liveMap: {
    src: "",
    alt: "The MIA Flight Tracker map with one aircraft selected and its details panel open",
    caption: "The finished map, with a flight selected.",
    width: 1600,
    height: 1000,
  },
} satisfies Record<string, PhotoSlot>;

/**
 * Farthest range measured from the receiver's tar1090 range plot, in km.
 * null until filled in; the page then describes typical range instead.
 */
export const measuredRangeKm: number | null = null;
