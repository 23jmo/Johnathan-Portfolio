/**
 * Placeholder shown while the model is still writing a generative-UI surface.
 *
 * The route buffers tool arguments until the model stops talking, so a card can
 * be "in flight" for seconds with nothing on screen. This holds that space.
 *
 * Geometry deliberately mirrors the real `Card` primitive
 * (`rounded-2xl border border-white/10 bg-white/5 p-4`) so the swap to actual
 * content does not shift the page under the reader.
 */

/** One shimmering bar. Width is a Tailwind class so it stays purgeable. */
function SkeletonBar({ className }: { className: string }) {
  return <div className={`a2ui-skeleton-bar rounded-md ${className}`} />;
}

export default function A2UISkeleton() {
  return (
    <div
      className="rounded-2xl border border-white/10 bg-white/5 p-4"
      // The list already announces "Building the card…" via the thinking
      // indicator; re-announcing this decorative block would be noise.
      aria-hidden="true"
    >
      <div className="flex items-center gap-3">
        <SkeletonBar className="h-12 w-12 shrink-0 rounded-lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <SkeletonBar className="h-3.5 w-2/5" />
          <SkeletonBar className="h-3 w-3/5" />
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2">
        <SkeletonBar className="h-3 w-full" />
        <SkeletonBar className="h-3 w-11/12" />
        <SkeletonBar className="h-3 w-3/4" />
      </div>
    </div>
  );
}
