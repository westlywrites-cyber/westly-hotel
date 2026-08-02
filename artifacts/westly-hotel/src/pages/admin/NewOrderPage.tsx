import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { runTransaction, doc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logAction } from "@/lib/audit";
import { notifyNewSale } from "@/lib/notifications";
import { useToast } from "@/hooks/use-toast";
import { usePinTaskComplete } from "@/hooks/usePinTaskComplete";
import { useDocument } from "@/hooks/useFirebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Coffee, Plus, Minus, Trash2, Loader2, CheckCircle, PencilLine, UtensilsCrossed } from "lucide-react";
import { formatCurrency, asArray } from "@/lib/utils";
import {
  MENU_CATEGORIES,
  CATEGORY_LABELS,
  type MenuItem,
} from "@/pages/admin/RestaurantManagementPage";

const CATEGORIES = ["all", ...MENU_CATEGORIES] as const;

interface CartItem { id: string; name: string; price: number; quantity: number; isManual?: boolean }

export default function NewOrderPage() {
  const { adminUser, role } = useAuth();
  const { toast } = useToast();
  const { isPinSession, endingSession, notifyTaskComplete } = usePinTaskComplete();
  const { data: menuDoc, loading: menuLoading } = useDocument("cms_content", "restaurant_menu");
  const menu = asArray<MenuItem>((menuDoc as any)?.data).filter(m => m.available);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("all");
  const [roomNumber, setRoomNumber] = useState("");
  const [tableNumber, setTableNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<any>(null);

  // ── Manual item entry (for purchases not on the menu) ──────────────────
  const [addMode, setAddMode] = useState<"menu" | "manual">("menu");
  const [manualName, setManualName] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [manualQty, setManualQty] = useState("1");
  const [manualErrors, setManualErrors] = useState<{ name?: string; price?: string; qty?: string }>({});

  const filtered = menu.filter(m => category === "all" || m.category === category);
  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);

  const addToCart = (item: MenuItem) => {
    const existing = cart.find(c => c.id === item.id);
    if (existing) {
      setCart(cart.map(c => c.id === item.id ? {...c, quantity: c.quantity + 1} : c));
    } else {
      setCart([...cart, { id: item.id, name: item.name, price: item.price, quantity: 1 }]);
    }
  };

  const updateQty = (id: string, delta: number) => {
    setCart(prev => prev.map(c => {
      if (c.id !== id) return c;
      const q = c.quantity + delta;
      if (q <= 0) return null as any;
      return {...c, quantity: q};
    }).filter(Boolean));
  };

  const addManualItem = () => {
    const name = manualName.trim();
    const priceNum = parseFloat(manualPrice);
    const qtyNum = parseInt(manualQty, 10);
    const errors: { name?: string; price?: string; qty?: string } = {};

    if (!name) errors.name = "Enter the item name or description.";
    if (manualPrice.trim() === "" || isNaN(priceNum) || priceNum <= 0) errors.price = "Enter a valid price greater than 0.";
    if (manualQty.trim() === "" || isNaN(qtyNum) || qtyNum < 1) errors.qty = "Quantity must be at least 1.";

    setManualErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setCart(prev => [
      ...prev,
      { id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, price: priceNum, quantity: qtyNum, isManual: true },
    ]);
    setManualName("");
    setManualPrice("");
    setManualQty("1");
    setManualErrors({});
    toast({ title: "Item added", description: `${name} added to order.` });
  };

  const handleOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminUser || cart.length === 0) return;
    setLoading(true);
    try {
      // ── Firestore Transaction ────────────────────────────────────────
      let orderId: string;
      await runTransaction(db, async (transaction) => {
        const orderRef = doc(collection(db, "orders"));
        orderId = orderRef.id;
        transaction.set(orderRef, {
          waiterId: adminUser.id,
          waiterName: adminUser.name,
          customerName: customerName || null,
          roomNumber: roomNumber || null,
          tableNumber: tableNumber || null,
          items: cart.map(c => ({ id: c.id, name: c.name, price: c.price, quantity: c.quantity, subtotal: c.price * c.quantity, isManual: !!c.isManual })),
          total,
          paymentMethod,
          notes: notes || null,
          hasManualItems: cart.some(c => c.isManual),
          status: "pending", // kitchen fulfillment status: pending → preparing → served
          // Financial approval status is tracked separately from kitchen
          // status above. Every order starts as Pending Approval — it only
          // counts as company revenue once the Accountant approves it.
          approvalStatus: "pending",
          approvedBy: null,
          approvedByName: null,
          approvedAt: null,
          rejectedReason: null,
          createdAt: serverTimestamp(),
          isDeleted: false,
        });
      });
      // ── Transaction complete ─────────────────────────────────────────

      logAction(adminUser.id, adminUser.name, "new_order", "orders", orderId!, null, { total }, role ?? undefined).catch(() => {});
      notifyNewSale(adminUser.name, total, "restaurant").catch(() => {});

      setSuccess({ items: cart, total });
      setCart([]); setRoomNumber(""); setTableNumber(""); setCustomerName(""); setNotes(""); setPaymentMethod("cash");
      toast({ title: "Order Placed!", description: `${formatCurrency(total)} order sent to kitchen.` });
      notifyTaskComplete();
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  };

  if (success) {
    return (
      <div className="max-w-md mx-auto pt-12 text-center space-y-5">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>
        <div><h2 className="font-serif text-2xl font-bold">Order Placed!</h2><p className="text-muted-foreground">{success.items.length} items · {formatCurrency(success.total)}</p></div>
        {isPinSession ? (
          <p className="text-sm text-muted-foreground">
            {endingSession ? "Ending session for security — enter your PIN again for another order." : "Order saved."}
          </p>
        ) : (
          <Button onClick={() => setSuccess(null)} className="w-full">New Order</Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div><h1 className="font-serif text-2xl font-bold">New Order</h1><p className="text-muted-foreground text-sm">Restaurant & Room Service</p></div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Menu or manual entry */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAddMode("menu")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${addMode === "menu" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
            >
              <UtensilsCrossed className="w-3.5 h-3.5" /> From Menu
            </button>
            <button
              type="button"
              onClick={() => setAddMode("manual")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${addMode === "manual" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
            >
              <PencilLine className="w-3.5 h-3.5" /> Manual Entry
            </button>
          </div>

          {addMode === "menu" ? (
            <>
              <div className="flex gap-2 flex-wrap">
                {CATEGORIES.map(cat => (
                  <button key={cat} onClick={() => setCategory(cat)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${category === cat ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>{cat === "all" ? "All" : CATEGORY_LABELS[cat]}</button>
                ))}
              </div>
              {menuLoading ? (
                <p className="text-sm text-muted-foreground text-center py-8">Loading menu…</p>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No available items in this category. Add items in Restaurant Management, or use Manual Entry.</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {filtered.map(item => (
                    <Card key={item.id} className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => addToCart(item)}>
                      <CardContent className="p-3">
                        <p className="font-medium text-sm">{item.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{CATEGORY_LABELS[item.category]}</p>
                        <p className="font-bold text-sm mt-2 text-primary">{formatCurrency(item.price)}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <PencilLine className="w-4 h-4" /> Manually Enter Purchase
                </CardTitle>
                <p className="text-xs text-muted-foreground">Use this for items that aren't on the menu. It's recorded and reported exactly like any other order.</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs">Item Name / Description</Label>
                  <Input value={manualName} onChange={e => setManualName(e.target.value)} placeholder="e.g. Off-menu special" className="h-9 text-sm" />
                  {manualErrors.name && <p className="text-xs text-destructive mt-1">{manualErrors.name}</p>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Price (each)</Label>
                    <Input type="number" min="0" step="0.01" value={manualPrice} onChange={e => setManualPrice(e.target.value)} placeholder="0.00" className="h-9 text-sm" />
                    {manualErrors.price && <p className="text-xs text-destructive mt-1">{manualErrors.price}</p>}
                  </div>
                  <div>
                    <Label className="text-xs">Quantity</Label>
                    <Input type="number" min="1" step="1" value={manualQty} onChange={e => setManualQty(e.target.value)} className="h-9 text-sm" />
                    {manualErrors.qty && <p className="text-xs text-destructive mt-1">{manualErrors.qty}</p>}
                  </div>
                </div>
                <Button type="button" variant="secondary" className="w-full gap-2" onClick={addManualItem}>
                  <Plus className="w-4 h-4" /> Add to Order
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Order form */}
        <div>
          <Card className="sticky top-4">
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Coffee className="w-4 h-4" />Order ({cart.length})</CardTitle></CardHeader>
            <CardContent>
              {cart.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No items added</p>
              ) : (
                <div className="space-y-2 mb-4">
                  {cart.map(item => (
                    <div key={item.id} className="flex items-center gap-2 text-sm">
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-xs flex items-center gap-1">
                          {item.name}
                          {item.isManual && <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">Manual</Badge>}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateQty(item.id, -1)} className="w-5 h-5 rounded-full bg-muted flex items-center justify-center"><Minus className="w-2.5 h-2.5" /></button>
                        <span className="w-4 text-center text-xs">{item.quantity}</span>
                        <button onClick={() => updateQty(item.id, 1)} className="w-5 h-5 rounded-full bg-muted flex items-center justify-center"><Plus className="w-2.5 h-2.5" /></button>
                      </div>
                      <span className="w-12 text-right text-xs">{formatCurrency(item.price * item.quantity)}</span>
                    </div>
                  ))}
                  <div className="border-t border-border pt-2 flex justify-between font-bold text-sm">
                    <span>Total</span><span>{formatCurrency(total)}</span>
                  </div>
                </div>
              )}

              <form onSubmit={handleOrder} className="space-y-2">
                <div>
                  <Label className="text-xs">Room Number</Label>
                  <Input value={roomNumber} onChange={e => setRoomNumber(e.target.value)} placeholder="e.g. 201" className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Table Number</Label>
                  <Input value={tableNumber} onChange={e => setTableNumber(e.target.value)} placeholder="e.g. T-05" className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Guest Name</Label>
                  <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Optional" className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Notes</Label>
                  <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Allergies, preferences…" className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Payment Method</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="pos">POS Terminal</SelectItem>
                      <SelectItem value="room_charge">Charge to Room</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full gap-2" disabled={loading || cart.length === 0} size="sm">
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? "Placing…" : `Place Order · ${formatCurrency(total)}`}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
