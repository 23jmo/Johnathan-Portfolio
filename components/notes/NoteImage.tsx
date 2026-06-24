import Image from "next/image";
import type { ComponentPropsWithoutRef } from "react";

type NoteImageProps = ComponentPropsWithoutRef<"img">;

/**
 * Figure with optional caption for markdown images. We render through next/image
 * for automatic optimization. Markdown carries no intrinsic dimensions, so we use
 * the width=0/height=0 + `sizes` pattern and let CSS drive the displayed size
 * (`w-full h-auto`), preserving the source aspect ratio.
 */
export default function NoteImage({ src, alt }: NoteImageProps) {
  if (typeof src !== "string" || src.length === 0) return null;

  return (
    <figure className="not-prose my-6">
      <Image
        src={src}
        alt={alt ?? ""}
        width={0}
        height={0}
        sizes="(max-width: 768px) 100vw, 672px"
        className="h-auto w-full rounded-xl border border-border"
      />
      {alt && (
        <figcaption className="mt-2 text-center text-sm text-muted">
          {alt}
        </figcaption>
      )}
    </figure>
  );
}
