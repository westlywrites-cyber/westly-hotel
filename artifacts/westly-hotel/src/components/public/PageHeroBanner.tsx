import { Link } from "wouter";
import { useDocument } from "@/hooks/useFirebase";
import { Button } from "@/components/ui/button";
import { EMPTY_PAGE_HERO, type PageHeroContent } from "@/lib/pageHero";

interface Props {
  /** Firestore doc id under cms_content/, matching a PAGE_HERO_SECTIONS entry */
  docId: string;
  /** Shown if the CMS title is still empty — keeps the page from looking broken pre-setup */
  fallbackTitle: string;
  fallbackSubtitle?: string;
  fallbackDescription?: string;
  heightClass?: string;
  /** "image" = photo banner with dark overlay (pages), "style" = used as a CSS backgroundImage (e.g. FAQ/Testimonials) */
  variant?: "banner" | "backdrop";
}

/**
 * Public-facing counterpart to PageHeroEditor — renders whatever is
 * currently published for this section, live. No prototype/stock image
 * fallback: an unset image renders a brand-colored gradient instead, so
 * the page still looks intentional before an image is uploaded.
 */
export default function PageHeroBanner({
  docId,
  fallbackTitle,
  fallbackSubtitle,
  fallbackDescription,
  heightClass = "h-72",
  variant = "banner",
}: Props) {
  const { data } = useDocument("cms_content", docId);
  const content: PageHeroContent = { ...EMPTY_PAGE_HERO, ...(((data as any)?.data) || {}) };

  const title = content.title || fallbackTitle;
  const subtitle = content.subtitle || fallbackSubtitle;
  const description = content.description || fallbackDescription;

  return (
    <div className={`relative ${heightClass} overflow-hidden flex items-center justify-center`}>
      {content.image ? (
        <img
          src={content.image}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--secondary)) 100%)" }}
        />
      )}
      <div className={variant === "banner" ? "absolute inset-0 bg-black/55" : "absolute inset-0 bg-black/50"} />
      <div className="relative z-10 flex flex-col items-center justify-center text-white text-center px-4 max-w-2xl">
        {subtitle && <p className="text-sm uppercase tracking-widest text-white/70 mb-2">{subtitle}</p>}
        <h1 className="font-serif text-4xl md:text-5xl font-bold">{title}</h1>
        {description && (
          <p className="text-white/80 mt-3 max-w-xl">{description}</p>
        )}
        {content.buttonText && content.buttonLink && (
          <Link href={content.buttonLink}>
            <Button size="lg" className="mt-6 bg-secondary hover:bg-secondary/90 text-foreground rounded-full px-8">
              {content.buttonText}
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}
