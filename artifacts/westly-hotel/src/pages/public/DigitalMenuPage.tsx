import GuestMenuBrowser from "@/components/public/GuestMenuBrowser";

// Permanent QR target for browsing the menu only (no ordering).
// Content is loaded live from Firestore (cms_content/restaurant_menu), so
// this page never needs to change — only the data behind it does.
export default function DigitalMenuPage() {
  return <GuestMenuBrowser orderable={false} />;
}
