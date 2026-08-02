import { useEffect, useState, useCallback } from "react";
import { useDocument } from "@/hooks/useFirebase";
import { asArray } from "@/lib/utils";
import { X, ChevronLeft, ChevronRight, ImageOff, Camera } from "lucide-react";
import { DataError } from "@/components/ui/data-error";

interface GalleryItem {
  id: string;
  title: string;
  caption: string;
  imageUrl: string;
}

export default function GalleryPage() {
  const { data: galleryDoc, loading, error } = useDocument("cms_content", "gallery");
  const gallery = asArray<GalleryItem>((galleryDoc as any)?.data);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const close = useCallback(() => setLightboxIndex(null), []);
  const showPrev = useCallback(
    () => setLightboxIndex((i) => (i === null ? null : (i - 1 + gallery.length) % gallery.length)),
    [gallery.length]
  );
  const showNext = useCallback(
    () => setLightboxIndex((i) => (i === null ? null : (i + 1) % gallery.length)),
    [gallery.length]
  );

  // Keyboard navigation for the lightbox
  useEffect(() => {
    if (lightboxIndex === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") showPrev();
      if (e.key === "ArrowRight") showNext();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex, close, showPrev, showNext]);

  const active = lightboxIndex !== null ? gallery[lightboxIndex] : null;
  const heroImage = gallery[0]?.imageUrl;

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="relative h-72 md:h-80 overflow-hidden">
        <img
          src={heroImage || "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1920"}
          alt="Hotel gallery"
          className="w-full h-full object-cover scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/70" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-center px-4">
          <p className="text-sm uppercase tracking-[0.25em] text-white/70 mb-3 flex items-center gap-2">
            <Camera className="w-4 h-4" /> Explore
          </p>
          <h1 className="font-serif text-4xl md:text-5xl font-bold">Photo Gallery</h1>
          <p className="text-white/70 mt-3 max-w-lg">
            A closer look at our rooms, amenities, and moments worth remembering.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-14 md:py-16">
        {loading ? (
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <div
                key={i}
                className="break-inside-avoid rounded-xl bg-muted animate-pulse"
                style={{ height: `${180 + (i % 3) * 60}px` }}
              />
            ))}
          </div>
        ) : error ? (
          <DataError message="We couldn't load the gallery. Please check your connection and try again." />
        ) : gallery.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-20 gap-3">
            <ImageOff className="w-10 h-10 text-muted-foreground/50" />
            <p className="text-muted-foreground">
              Our gallery is being updated — please check back soon.
            </p>
          </div>
        ) : (
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4">
            {gallery.map((img, i) => (
              <button
                key={img.id}
                type="button"
                onClick={() => setLightboxIndex(i)}
                className="break-inside-avoid block w-full text-left cursor-zoom-in group relative overflow-hidden rounded-xl shadow-sm hover:shadow-xl transition-shadow duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <img
                  src={img.imageUrl}
                  alt={img.title}
                  loading="lazy"
                  className="w-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4">
                  <div className="translate-y-3 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-300">
                    <p className="text-white text-sm font-semibold font-serif">{img.title}</p>
                    {img.caption && (
                      <p className="text-white/75 text-xs mt-0.5 line-clamp-2">{img.caption}</p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {active && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={close}
          role="dialog"
          aria-modal="true"
        >
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors p-2"
            onClick={close}
            aria-label="Close"
          >
            <X className="w-7 h-7" />
          </button>

          {gallery.length > 1 && (
            <>
              <button
                className="absolute left-2 md:left-6 top-1/2 -translate-y-1/2 text-white/70 hover:text-white transition-colors p-2"
                onClick={(e) => {
                  e.stopPropagation();
                  showPrev();
                }}
                aria-label="Previous image"
              >
                <ChevronLeft className="w-8 h-8" />
              </button>
              <button
                className="absolute right-2 md:right-6 top-1/2 -translate-y-1/2 text-white/70 hover:text-white transition-colors p-2"
                onClick={(e) => {
                  e.stopPropagation();
                  showNext();
                }}
                aria-label="Next image"
              >
                <ChevronRight className="w-8 h-8" />
              </button>
            </>
          )}

          <div onClick={(e) => e.stopPropagation()} className="max-w-4xl w-full">
            <img
              src={active.imageUrl}
              alt={active.title}
              className="w-full rounded-xl max-h-[75vh] object-contain mx-auto"
            />
            <div className="text-center mt-4">
              <p className="text-white font-serif font-semibold">{active.title}</p>
              {active.caption && <p className="text-white/70 text-sm mt-1">{active.caption}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
