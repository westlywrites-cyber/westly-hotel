import GuestMenuBrowser from "@/components/public/GuestMenuBrowser";

// Permanent QR target for browsing the menu AND placing an order. Orders
// are written straight to the same `orders` collection staff use, so they
// appear in the existing order-management workflow in real time.
export default function GuestOrderPage() {
  return <GuestMenuBrowser orderable={true} />;
}
