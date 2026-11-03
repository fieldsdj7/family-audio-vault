"use client";

import { useEffect, useState } from "react";

type Photo = { id: string; caption: string | null };

export default function StoryPhotos({ recordingId }: { recordingId: string }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(
          `/api/cloudflare/photos?recordingId=${encodeURIComponent(recordingId)}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) throw new Error("Story photos could not be loaded.");
        const data: { photos: Photo[] } = await response.json();
        if (!controller.signal.aborted) setPhotos(data.photos);
      } catch {
        if (!controller.signal.aborted) setError("Story photos could not be loaded.");
      }
    }
    void load();
    return () => controller.abort();
  }, [recordingId]);

  if (!photos.length && !error) return null;
  return (
    <section aria-label="Story photos" className="mt-7 min-w-0 max-w-full border-t border-stone-200 pt-7">
      <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a66b27]">Story Photos</h3>
      {error && <p role="alert" className="mt-3 text-sm text-stone-600">{error}</p>}
      <div className="mt-4 grid min-w-0 grid-cols-1 gap-5 sm:grid-cols-2">
        {photos.map((photo) => (
          <figure key={photo.id} className="min-w-0 max-w-full">
            {/* Load directly through the authenticated route, without an image proxy. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/cloudflare/photos/${encodeURIComponent(photo.id)}`}
              alt={photo.caption?.trim() || "Family story photo"}
              loading="lazy"
              className="block h-auto w-full max-w-full rounded-2xl border border-stone-200"
            />
            {photo.caption && (
              <figcaption className="mt-2 whitespace-pre-line text-sm text-stone-600 [overflow-wrap:anywhere]">
                {photo.caption}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
    </section>
  );
}
