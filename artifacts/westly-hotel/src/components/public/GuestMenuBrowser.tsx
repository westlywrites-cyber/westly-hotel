import { useState } from "react";
import { useDocument } from "@/hooks/useFirebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { formatCurrency, asArray, cn } from "@/lib/utils";
import {
  MENU_CATEGORIES,
  CATEGORY_LABELS,
  type MenuItem,
} from "@/pages/admin/RestaurantManagementPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { DataError } from "@/components/ui/data-error";
import {
  Hotel,
  Plus,
  Minus,
  ShoppingBag,
  Loader2,
  CheckCircle,
  ImageOff,
} from "lucide-react";

interface CartLine {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export default function GuestMenuBrowser({ orderable }: { orderable: boolean }) {
  const { toast } = useToast();
  const { data: menuDoc, loading, error } = useDocument("cms_content", "restaurant_menu");
  const items = asArray<MenuItem>((menuDoc as any)?.data).filter((i) => i.available);

  const [category, setCategory] = useState<"all" | MenuItem["category"]>("all");
  const filtered = items.filter((i) => category === "all" || i.category === category);
  const sections = MENU_CATEGORIES.map((cat) => ({
    category: cat,
    items: filtered.filter((i) => i.category === cat),
  })).filter((s) => s.items.length > 0);

  // ── Cart (order mode only) ──────────────────────────────────────────────
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [placed, setPlaced] = useState(false);

  const [locationType, setLocationType] = useState<"room" | "table">("room");
  const [locationNumber, setLocationNumber] = useState("");
  const [guestName, setGuestName] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"room_charge" | "pay_on_delivery">("room_charge");
  const [locationError, setLocationError] = useState("");
  const [guestNameError, setGuestNameError] = useState("");
  const [verifyError, setVerifyError] = useState("");

  const total = cart.reduce((s, c) => s + c.price * c.quantity, 0);
  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);

  const addToCart = (item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.id === item.id);
      if (existing) {
        return prev.map((c) => (c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c));
      }
      return [...prev, { id: item.id, name: item.name, price: item.price, quantity: 1 }];
    });
  };

  const updateQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => (c.id === id ? { ...c, quantity: c.quantity + delta } : c))
        .filter((c) => c.quantity > 0)
    );
  };

  const submitOrder = async () => {
    if (cart.length === 0) return;
    const number = locationNumber.trim();
    if (!number) {
      setLocationError(`Enter your ${locationType === "room" ? "room" : "table"} number.`);
      return;
    }
    setLocationError("");

    // Room-billed orders are delivered to (and possibly charged to) a
    // hotel room, so we require and verify the guest's identity server-side
    // before anything is sent to staff. Table orders are walk-in restaurant
    // diners — there's no guest/room record to check them against, so that
    // flow is unchanged.
    if (locationType === "room" && !guestName.trim()) {
      setGuestNameError("Enter your name as it appears on your reservation.");
      return;
    }
    setGuestNameError("");
    setVerifyError("");

    setSubmitting(true);
    try {
      if (locationType === "room") {
        const res = await fetch("/api/verify-guest-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            guestName: guestName.trim(),
            roomNumber: number,
            items: cart.map((c) => ({ id: c.id, quantity: c.quantity })),
            notes,
            paymentMethod,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          // Server already returns a professional, non-revealing message
          // ("Invalid guest name or room number.") — surface it as-is.
          setVerifyError(data.error || "We couldn't verify your details. Please try again.");
          setSubmitting(false);
          return;
        }
      } else {
        await addDoc(collection(db, "orders"), {
          waiterId: "unassigned",
          waiterName: "Guest (QR Order)",
          customerName: guestName.trim() || null,
          roomNumber: null,
          tableNumber: number,
          items: cart.map((c) => ({
            id: c.id,
            name: c.name,
            price: c.price,
            quantity: c.quantity,
            subtotal: c.price * c.quantity,
            isManual: false,
          })),
          total,
          paymentMethod,
          notes: notes.trim() || null,
          hasManualItems: false,
          status: "pending",
          approvalStatus: "pending",
          approvedBy: null,
          approvedByName: null,
          approvedAt: null,
          rejectedReason: null,
          createdAt: serverTimestamp(),
          isDeleted: false,
          source: "qr_menu",
        });
      }
      setPlaced(true);
      setCart([]);
    } catch (err: any) {
      toast({ title: "Couldn't place order", description: err.message, variant: "destructive" });
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Minimal header — no site nav, this is a QR landing page */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-sm flex items-center justify-center shrink-0">
            <Hotel className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <p className="font-serif font-bold leading-tight">Westly Hotel</p>
            <p className="text-xs text-muted-foreground leading-tight">
              {orderable ? "Order from your room or table" : "Digital Menu"}
            </p>
          </div>
        </div>
        {/* Category tabs */}
        <div className="max-w-lg mx-auto px-4 pb-3 flex gap-2 overflow-x-auto">
          <button
            onClick={() => setCategory("all")}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
              category === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            )}
          >
            All
          </button>
          {MENU_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
                category === cat ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p className="text-sm">Loading menu…</p>
          </div>
        ) : error ? (
          <DataError message="We couldn't load the menu. Please check your connection and try again." />
        ) : sections.length === 0 ? (
          <p className="text-center text-muted-foreground py-16">
            Our menu is being updated — please check back soon.
          </p>
        ) : (
          <div className="space-y-8">
            {sections.map((section) => (
              <div key={section.category}>
                <h2 className="font-serif text-lg font-bold mb-3 text-primary border-b border-border pb-2">
                  {CATEGORY_LABELS[section.category]}
                </h2>
                <div className="space-y-3">
                  {section.items.map((item) => {
                    const inCart = cart.find((c) => c.id === item.id);
                    return (
                      <div key={item.id} className="flex items-center gap-3 bg-card rounded-xl p-3 border border-border">
                        <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-muted flex items-center justify-center">
                          {item.image ? (
                            <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                          ) : (
                            <ImageOff className="w-5 h-5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{item.name}</p>
                          {item.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
                          )}
                          <p className="font-bold text-sm text-primary mt-1">{formatCurrency(item.price)}</p>
                        </div>
                        {orderable && (
                          inCart ? (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button onClick={() => updateQty(item.id, -1)} className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="w-4 text-center text-sm font-medium">{inCart.quantity}</span>
                              <button onClick={() => updateQty(item.id, 1)} className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <Button size="sm" variant="outline" className="shrink-0 h-8 gap-1" onClick={() => addToCart(item)}>
                              <Plus className="w-3.5 h-3.5" /> Add
                            </Button>
                          )
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Floating cart bar */}
      {orderable && cartCount > 0 && (
        <div className="fixed bottom-4 left-4 right-4 max-w-lg mx-auto z-40">
          <Button className="w-full h-12 rounded-full shadow-lg gap-2" onClick={() => setCartOpen(true)}>
            <ShoppingBag className="w-4 h-4" />
            {cartCount} item{cartCount > 1 ? "s" : ""} · {formatCurrency(total)}
          </Button>
        </div>
      )}

      {/* Checkout sheet */}
      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="bottom" className="max-w-lg mx-auto rounded-t-2xl max-h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Your Order</SheetTitle>
          </SheetHeader>

          {placed ? (
            <div className="text-center py-8 space-y-3">
              <CheckCircle className="w-12 h-12 text-green-600 mx-auto" />
              <p className="font-serif text-xl font-bold">Order Sent!</p>
              <p className="text-sm text-muted-foreground">
                Our staff have received your order and will bring it to you shortly.
              </p>
              <Button
                className="w-full"
                onClick={() => {
                  setPlaced(false);
                  setCartOpen(false);
                  setLocationNumber("");
                  setGuestName("");
                  setNotes("");
                  setGuestNameError("");
                  setVerifyError("");
                }}
              >
                Order Something Else
              </Button>
            </div>
          ) : (
            <div className="space-y-4 pb-4">
              <div className="space-y-2">
                {cart.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 text-sm">
                    <div className="flex-1 min-w-0 truncate">{c.name}</div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => updateQty(c.id, -1)} className="w-5 h-5 rounded-full bg-muted flex items-center justify-center">
                        <Minus className="w-2.5 h-2.5" />
                      </button>
                      <span className="w-4 text-center text-xs">{c.quantity}</span>
                      <button onClick={() => updateQty(c.id, 1)} className="w-5 h-5 rounded-full bg-muted flex items-center justify-center">
                        <Plus className="w-2.5 h-2.5" />
                      </button>
                    </div>
                    <span className="w-16 text-right text-xs">{formatCurrency(c.price * c.quantity)}</span>
                  </div>
                ))}
                <div className="border-t border-border pt-2 flex justify-between font-bold text-sm">
                  <span>Total</span>
                  <span>{formatCurrency(total)}</span>
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t border-border">
                <div>
                  <Label className="text-xs">Deliver to</Label>
                  <div className="flex gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => { setLocationType("room"); setVerifyError(""); setGuestNameError(""); }}
                      className={cn(
                        "flex-1 h-9 rounded-md text-sm font-medium border",
                        locationType === "room" ? "bg-primary text-primary-foreground border-primary" : "border-input"
                      )}
                    >
                      Room
                    </button>
                    <button
                      type="button"
                      onClick={() => { setLocationType("table"); setVerifyError(""); setGuestNameError(""); }}
                      className={cn(
                        "flex-1 h-9 rounded-md text-sm font-medium border",
                        locationType === "table" ? "bg-primary text-primary-foreground border-primary" : "border-input"
                      )}
                    >
                      Table
                    </button>
                  </div>
                  {locationType === "room" && (
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Room orders are verified against our guest records — please use the same name and room number as your reservation.
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-xs">{locationType === "room" ? "Room Number" : "Table Number"}</Label>
                  <Input
                    value={locationNumber}
                    onChange={(e) => { setLocationNumber(e.target.value); setLocationError(""); setVerifyError(""); }}
                    placeholder={locationType === "room" ? "e.g. 204" : "e.g. T-05"}
                    className="h-9 text-sm"
                  />
                  {locationError && <p className="text-xs text-destructive mt-1">{locationError}</p>}
                </div>
                <div>
                  <Label className="text-xs">{locationType === "room" ? "Your Name (as on your reservation)" : "Your Name (optional)"}</Label>
                  <Input
                    value={guestName}
                    onChange={(e) => { setGuestName(e.target.value); setGuestNameError(""); setVerifyError(""); }}
                    className="h-9 text-sm"
                  />
                  {guestNameError && <p className="text-xs text-destructive mt-1">{guestNameError}</p>}
                </div>
                <div>
                  <Label className="text-xs">Notes (optional)</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Allergies, preferences…" className="text-sm min-h-[60px]" />
                </div>
                <div>
                  <Label className="text-xs">Payment</Label>
                  <RadioGroup value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as any)} className="mt-1">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="room_charge" id="pm-room" />
                      <Label htmlFor="pm-room" className="text-sm font-normal">Charge to my room</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="pay_on_delivery" id="pm-delivery" />
                      <Label htmlFor="pm-delivery" className="text-sm font-normal">Pay on delivery (cash/card)</Label>
                    </div>
                  </RadioGroup>
                </div>

                {verifyError && (
                  <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{verifyError}</p>
                )}

                <Button className="w-full gap-2" disabled={submitting || cart.length === 0} onClick={submitOrder}>
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {submitting ? "Placing…" : `Place Order · ${formatCurrency(total)}`}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
