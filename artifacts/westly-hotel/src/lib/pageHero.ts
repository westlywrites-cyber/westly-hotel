import type { ImageFolder } from "./storage";

// ══════════════════════════════════════════════════════════════════════════
// PAGE HERO / BACKGROUND SECTIONS
//
// Each entry here is one Firestore document at cms_content/{docId}, editable
// from Admin → Website CMS → Page Banners, and read live by the matching
// public (or shared-login) page. Adding a new page banner in the future is
// just: add an entry here, then read it on the target page the same way the
// others below do (see ContactPage.tsx / FAQPage.tsx / etc. for the pattern).
// ══════════════════════════════════════════════════════════════════════════

export interface PageHeroContent {
  title: string;
  subtitle: string;
  description: string;
  buttonText: string;
  buttonLink: string;
  image: string;
}

export const EMPTY_PAGE_HERO: PageHeroContent = {
  title: "",
  subtitle: "",
  description: "",
  buttonText: "",
  buttonLink: "",
  image: "",
};

export interface PageHeroSectionDef {
  /** Firestore doc id under cms_content/ */
  docId: string;
  /** Shown in the CMS Page Banners list */
  label: string;
  /** Where this appears on the live site */
  usedOn: string;
  /** Supabase Storage folder this section's image uploads into */
  folder: ImageFolder;
  /** Whether the button fields make sense for this section (some are pure backgrounds) */
  supportsButton: boolean;
}

export const PAGE_HERO_SECTIONS: PageHeroSectionDef[] = [
  {
    docId: "contact_hero",
    label: "Contact Page Hero Banner",
    usedOn: "/contact",
    folder: "cms-contact-hero",
    supportsButton: true,
  },
  {
    docId: "faq_hero",
    label: "FAQ Page Background",
    usedOn: "/faq",
    folder: "cms-faq-hero",
    supportsButton: false,
  },
  {
    docId: "facilities_hero",
    label: "Facilities Page Hero Banner",
    usedOn: "/facilities",
    folder: "cms-facilities-hero",
    supportsButton: true,
  },
  {
    docId: "rooms_hero",
    label: "Room List Page Hero Banner",
    usedOn: "/rooms",
    folder: "cms-rooms-hero",
    supportsButton: true,
  },
  {
    docId: "restaurant_hero",
    label: "Restaurant Menu Page Hero Banner",
    usedOn: "/restaurant",
    folder: "cms-restaurant-hero",
    supportsButton: true,
  },
  {
    docId: "venue_hero",
    label: "Venue Page Hero Banner",
    usedOn: "/venues",
    folder: "cms-venue-hero",
    supportsButton: true,
  },
  {
    docId: "testimonials_hero",
    label: "Testimonials Section Background",
    usedOn: "/testimonials",
    folder: "cms-testimonials-hero",
    supportsButton: false,
  },
  {
    docId: "login_background",
    label: "Admin / Shared PIN Login Page Background",
    usedOn: "/admin/login and /admin/pin",
    folder: "cms-login-background",
    supportsButton: false,
  },
];
