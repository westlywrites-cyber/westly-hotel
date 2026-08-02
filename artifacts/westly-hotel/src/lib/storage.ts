import { supabase, isSupabaseConfigured } from "./supabase";

// ══════════════════════════════════════════════════════════════════════════
// IMAGE UPLOADS — Supabase Storage, used ONLY by the features that used to
// require a pasted image URL:
//   Hotel rooms, Hotel facilities, Lost & Found, Restaurant menu,
//   CMS Hero section, CMS About section, Gallery page.
//
// Every uploaded file goes into the single public "westly-media" bucket
// (see supabase/storage.sql), under a folder named after the feature, and
// this returns the public URL — which is then stored in the exact same
// Firestore field that used to hold a manually-pasted URL (e.g. `image`,
// `images[]`, `photoUrl`, `imageUrl`, `backgroundImage`). Nothing about the
// Firestore data model changes; only how that URL gets there.
// ══════════════════════════════════════════════════════════════════════════

export type ImageFolder =
  | "rooms"
  | "facilities"
  | "lost-found"
  | "restaurant-menu"
  | "bar-menu"
  | "cms-hero"
  | "cms-about"
  | "gallery"
  | "venues"
  | "cms-contact-hero"
  | "cms-faq-hero"
  | "cms-facilities-hero"
  | "cms-rooms-hero"
  | "cms-restaurant-hero"
  | "cms-testimonials-hero"
  | "cms-venue-hero"
  | "cms-login-background";

const BUCKET = "westly-media";

const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8MB, matches the bucket's file_size_limit
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

export class ImageUploadError extends Error {}

function extensionFor(file: File): string {
  const fromName = file.name.split(".").pop();
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();
  return (file.type.split("/")[1] || "jpg").toLowerCase();
}

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Uploads an image file to Supabase Storage and returns its public URL.
 * Throws ImageUploadError with a user-friendly message on any failure —
 * callers should catch this and show it via toast rather than letting it
 * propagate as an unhandled rejection.
 */
export async function uploadImage(file: File, folder: ImageFolder): Promise<string> {
  if (!isSupabaseConfigured || !supabase) {
    throw new ImageUploadError(
      "Image uploads aren't connected yet. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
    );
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new ImageUploadError("Please choose a JPEG, PNG, WEBP, GIF, or AVIF image.");
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new ImageUploadError("That image is larger than 8MB. Please choose a smaller file.");
  }

  const path = `${folder}/${randomId()}.${extensionFor(file)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "31536000",
    upsert: false,
    contentType: file.type,
  });
  if (error) {
    throw new ImageUploadError(error.message || "Upload failed. Please try again.");
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Best-effort delete of a previously-uploaded image, given its public URL.
 * Safe to call on URLs that were never in our bucket (e.g. legacy pasted
 * URLs from before this feature existed) — those are simply skipped.
 */
export async function deleteImageByUrl(url: string | null | undefined): Promise<void> {
  if (!url || !isSupabaseConfigured || !supabase) return;
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return; // not one of our uploaded files — nothing to clean up
  const path = url.slice(idx + marker.length);
  if (!path) return;
  await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
}
