import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow, parse } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a number as Nigerian Naira (₦).
 * Uses a manual ₦ prefix instead of Intl's `currency: "NGN"` style because
 * ICU data in some browsers/environments renders "NGN" instead of the ₦ glyph.
 */
export function formatCurrency(amount: number | null | undefined): string {
  const value = typeof amount === "number" && !isNaN(amount) ? amount : 0;
  const hasFraction = Math.round(value * 100) % 100 !== 0;
  return "₦" + value.toLocaleString("en-NG", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

export function formatDate(date: Date | string | null | undefined, pattern = "MMM d, yyyy"): string {
  if (!date) return "—";
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    return format(d, pattern);
  } catch {
    return "—";
  }
}

export function formatDateTime(date: Date | string | null | undefined): string {
  return formatDate(date, "MMM d, yyyy h:mm a");
}

export function timeAgo(date: Date | number | null | undefined): string {
  if (!date) return "—";
  try {
    const d = typeof date === "number" ? new Date(date) : date as Date;
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return "—";
  }
}

export function toFirestoreDate(timestamp: any): Date | null {
  if (!timestamp) return null;
  if (timestamp?.toDate) return timestamp.toDate();
  if (timestamp instanceof Date) return timestamp;
  return new Date(timestamp);
}

/**
 * Format a Date for use as the value of an <input type="datetime-local">.
 */
export function toDateTimeLocalValue(date: Date | null | undefined): string {
  if (!date) return "";
  try {
    return format(date, "yyyy-MM-dd'T'HH:mm");
  } catch {
    return "";
  }
}

/**
 * Parse the value of an <input type="datetime-local"> (format
 * "yyyy-MM-dd'T'HH:mm") back into a local Date. Returns an Invalid Date
 * if the string is empty/malformed — callers should check with isNaN.
 */
export function parseDateTimeLocal(value: string): Date {
  if (!value) return new Date(NaN);
  return parse(value, "yyyy-MM-dd'T'HH:mm", new Date());
}

/**
 * Combine a date-only string ("yyyy-MM-dd") with a "HH:mm" time-of-day
 * string into a single local Date. Used to apply the hotel's official
 * check-out time policy (set by the Super Admin in Settings) onto a
 * date the Receptionist picked.
 */
export function combineDateAndTime(dateStr: string, timeStr: string): Date {
  const base = parse(dateStr, "yyyy-MM-dd", new Date());
  const [h, m] = (timeStr || "00:00").split(":").map((n) => parseInt(n, 10));
  base.setHours(isNaN(h) ? 0 : h, isNaN(m) ? 0 : m, 0, 0);
  return base;
}

export function nightsBetween(checkIn: Date | string, checkOut: Date | string): number {
  const a = typeof checkIn === "string" ? new Date(checkIn) : checkIn;
  const b = typeof checkOut === "string" ? new Date(checkOut) : checkOut;
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)));
}

export function generateBookingId(): string {
  return "BK-" + Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function truncate(str: string, maxLength: number): string {
  if (!str) return "";
  return str.length > maxLength ? str.slice(0, maxLength) + "…" : str;
}

export function capitalize(str: string): string {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, " ");
}

/**
 * Safely coerce a Firestore doc's loosely-typed `data` field into an array.
 * Firestore documents are schemaless — a doc written by hand, an older code
 * path, or a partial migration can leave `data` as an object, string, or
 * missing entirely. Without this guard, calling `.map()`/`.filter()` on a
 * non-array throws during render and (absent an error boundary) blanks the
 * whole page. Always route array-shaped CMS content through this.
 */
export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}
