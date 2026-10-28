import Image from "next/image";
import type { PhotoSlot } from "@/lib/photos";

/**
 * A captioned photo, or nothing at all when the slot has no image yet, so the
 * public page never shows "coming soon" boxes. Fill slots in lib/photos.ts.
 */
export function Photo({ photo }: { photo: PhotoSlot }) {
  if (!photo.src) return null;

  return (
    <figure className="overflow-hidden rounded-lg border border-gray-800 bg-mia-dark/40">
      <Image
        src={photo.src}
        alt={photo.alt}
        width={photo.width}
        height={photo.height}
        sizes="(min-width: 768px) 720px, 100vw"
        className="h-auto w-full"
      />
      <figcaption className="px-3 py-2 text-xs text-gray-400">{photo.caption}</figcaption>
    </figure>
  );
}
