import { PublicImageWithFallback } from "@/components/public-image-with-fallback";
import type { MarketplaceSpaceImage } from "@/lib/public-marketplace";

export interface SpaceGalleryProps {
  spaceName: string;
  heroImage: MarketplaceSpaceImage | null;
  galleryImages: MarketplaceSpaceImage[];
}

export function SpaceGallery({ spaceName, heroImage, galleryImages }: SpaceGalleryProps) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-pop">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="overflow-hidden rounded-2xl bg-surface-2">
          <PublicImageWithFallback
            src={heroImage?.image_url}
            alt={spaceName}
            className="h-full min-h-[340px] w-full object-cover"
            fallbackClassName="flex min-h-[340px] items-center justify-center bg-[linear-gradient(135deg,var(--ps-violet-100),var(--ps-mint-100))] text-sm font-semibold uppercase tracking-[0.24em] text-text-2"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {galleryImages.length > 0 ? (
            galleryImages.map((image) => (
              <div key={image.public_id} className="overflow-hidden rounded-xl bg-surface-2">
                <PublicImageWithFallback
                  src={image.image_url}
                  alt={spaceName}
                  className="h-full min-h-[164px] w-full object-cover"
                  fallbackClassName="flex min-h-[164px] items-center justify-center bg-surface-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-text-3"
                />
              </div>
            ))
          ) : (
            Array.from({ length: 4 }).map((_, index) => (
              <div
                key={`placeholder-${index}`}
                className="flex min-h-[164px] items-center justify-center rounded-xl bg-surface-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-4"
              >
                Gallery
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
