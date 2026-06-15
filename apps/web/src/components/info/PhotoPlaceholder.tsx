interface PhotoPlaceholderProps {
  /** Short description of the photo the user will drop in here later. */
  caption: string;
  /** Optional aspect hint; defaults to a 16:9-ish slot. */
  className?: string;
}

/**
 * A styled, empty slot the site owner fills with a real photo later. Keeps the
 * page looking intentional before the tutorial images exist. Swap the inner
 * markup for an <Image> once a file is available.
 */
export function PhotoPlaceholder({ caption, className }: PhotoPlaceholderProps) {
  return (
    <div
      role="img"
      aria-label={`Photo placeholder: ${caption}`}
      className={`flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-700 bg-mia-dark/40 p-6 text-center ${className ?? ""}`}
    >
      <span className="text-3xl" aria-hidden="true">
        📷
      </span>
      <p className="text-sm font-medium text-gray-300">Photo coming soon</p>
      <p className="max-w-md text-xs text-gray-500">{caption}</p>
    </div>
  );
}
