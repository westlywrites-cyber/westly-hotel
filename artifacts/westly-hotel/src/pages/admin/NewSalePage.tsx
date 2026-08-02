import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCollection } from "@/hooks/useFirebase";
import { runTransaction, doc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logAction } from "@/lib/audit";
import { notifyNewSale, notifyLowInventory } from "@/lib/notifications";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { usePinTaskComplete } from "@/hooks/usePinTaskComplete";
import { ShoppingCart, Plus, Minus, Trash2, Loader2, CheckCircle, PencilLine, Boxes } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { where } from "firebase/firestore";

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  available: number;
  isManual?: boolean;
}

export default function NewSalePage() {
  const { adminUser, role } = useAuth();
  const { toast } = useToast();
  const { isPinSession, endingSession, notifyTaskComplete } = usePinTaskComplete();
  const { data: inventory } = useCollection("inventory", [where("isDeleted", "!=", true)]);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedItem, setSelectedItem] = useState("");
  const [category, setCategory] = useState("all");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<any>(null);

  // ── Manual item entry (for purchases not in the inventory catalog) ─────
  const [addMode, setAddMode] = useState<"catalog" | "manual">("catalog");
  const [manualName, setManualName] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [manualQty, setManualQty] = useState("1");
  const [manualErrors, setManualErrors] = useState<{ name?: string; price?: string; qty?: string }>({});

  const categories = useMemo(() => {
    const cats = new Set(inventory.map((i: any) => i.category).filter(Boolean));
    return ["all", ...Array.from(cats) as string[]];
  }, [inventory]);

  const filteredInventory = useMemo(() => {
    return inventory.filter((i: any) =>
      (category === "all" || i.category === category) &&
      i.quantity > 0
    );
  }, [inventory, category]);

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const addToCart = (item: any) => {
    const existing = cart.find(c => c.id === item.id);
    if (existing) {
      if (existing.quantity >= item.quantity) {
        toast({ title: "Stock limit", description: "Cannot add more than available stock.", variant: "destructive" });
        return;
      }
      setCart(cart.map(c => c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c));
    } else {
      setCart([...cart, { id: item.id, name: item.name, price: item.costPerUnit * 1.3, quantity: 1, available: item.quantity }]);
    }
  };

  const updateQty = (id: string, delta: number) => {
    setCart(prev => prev.map(c => {
      if (c.id !== id) return c;
      const newQty = c.quantity + delta;
      if (newQty <= 0) return null as any;
      if (newQty > c.available) return c;
      return { ...c, quantity: newQty };
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

    // Manual items aren't backed by an inventory document, so they get a
    // unique client-side id and no stock ceiling (available = Infinity).
    setCart(prev => [
      ...prev,
      { id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, price: priceNum, quantity: qtyNum, available: Infinity, isManual: true },
    ]);
    setManualName("");
    setManualPrice("");
    setManualQty("1");
    setManualErrors({});
    toast({ title: "Item added", description: `${name} added to cart.` });
  };

  const handleSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminUser || cart.length === 0) return;
    setLoading(true);

    try {
      // ── Firestore Transaction: deduct inventory + create sale atomically ─
      let saleId: string;
      // Manual items have no backing inventory document, so stock
      // verification/deduction only applies to catalog-sourced items.
      const inventoryCartItems = cart.filter(c => !c.isManual);

      await runTransaction(db, async (transaction) => {
        // Verify inventory has sufficient stock for all catalog items
        for (const cartItem of inventoryCartItems) {
          const invRef = doc(db, "inventory", cartItem.id);
          const invSnap = await transaction.get(invRef);
          if (!invSnap.exists()) throw new Error(`Item "${cartItem.name}" not found in inventory.`);
          const currentQty = invSnap.data()!.quantity;
          if (currentQty < cartItem.quantity) {
            throw new Error(`Insufficient stock for "${cartItem.name}": only ${currentQty} left.`);
          }
        }

        // Deduct inventory for each catalog item
        for (const cartItem of inventoryCartItems) {
          const invRef = doc(db, "inventory", cartItem.id);
          const invSnap = await transaction.get(invRef);
          const currentQty = invSnap.data()!.quantity;
          transaction.update(invRef, { quantity: currentQty - cartItem.quantity, updatedAt: serverTimestamp() });
        }

        // Create sale record — manual and catalog items are recorded
        // identically so they flow through reports/revenue/history the same way.
        const saleRef = doc(collection(db, "sales"));
        saleId = saleRef.id;
        transaction.set(saleRef, {
          staffId: adminUser.id,
          staffName: adminUser.name,
          customerName: customerName || null,
          items: cart.map(c => ({ id: c.id, name: c.name, price: c.price, quantity: c.quantity, subtotal: c.price * c.quantity, isManual: !!c.isManual })),
          total,
          paymentMethod,
          notes: notes || null,
          createdAt: serverTimestamp(),
          category: "merchandise",
          hasManualItems: cart.some(c => c.isManual),
          // Every sale starts as Pending Approval — it only counts as
          // company revenue once the Accountant reviews and approves it.
          approvalStatus: "pending",
          approvedBy: null,
          approvedByName: null,
          approvedAt: null,
          rejectedReason: null,
          isDeleted: false,
        });
      });
      // ── Transaction complete ─────────────────────────────────────────────

      logAction(adminUser.id, adminUser.name, "new_sale", "sales", saleId!, null, { total }, role ?? undefined).catch(() => {});
      notifyNewSale(adminUser.name, total, "merchandise").catch(() => {});

      // A sale is the moment stock actually drops, so this is the right
      // place to check whether any catalog item just crossed its reorder
      // threshold (rather than re-checking on every unrelated inventory read).
      for (const cartItem of inventoryCartItems) {
        const invItem = inventory.find((i: any) => i.id === cartItem.id) as any;
        if (!invItem) continue;
        const newQty = invItem.quantity - cartItem.quantity;
        if (newQty <= (invItem.minStock ?? 0)) {
          notifyLowInventory(invItem.name, newQty, invItem.unit ?? "units").catch(() => {});
        }
      }

      setSuccess({ items: cart, total, time: new Date().toLocaleTimeString() });
      setCart([]);
      setCustomerName("");
      setNotes("");
      toast({ title: "Sale Recorded", description: `${formatCurrency(total)} sale saved.` });
      notifyTaskComplete();
    } catch (err: any) {
      toast({ title: "Sale Failed", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  };

  if (success) {
    return (
      <div className="max-w-md mx-auto pt-12 text-center space-y-5">
        <div className="w-20 h-20 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>
        <div>
          <h2 className="font-serif text-2xl font-bold">Sale Complete!</h2>
          <p className="text-muted-foreground">{success.items.length} item{success.items.length !== 1 ? "s" : ""} sold · {success.time}</p>
        </div>
        <div className="bg-muted rounded-xl p-4 text-left space-y-2 text-sm">
          {success.items.map((item: CartItem) => (
            <div key={item.id} className="flex justify-between">
              <span>{item.name} ×{item.quantity}</span>
              <span>{formatCurrency(item.price * item.quantity)}</span>
            </div>
          ))}
          <div className="border-t border-border pt-2 flex justify-between font-bold">
            <span>Total</span><span>{formatCurrency(success.total)}</span>
          </div>
        </div>
        {isPinSession ? (
          <p className="text-sm text-muted-foreground">
            {endingSession ? "Ending session for security — enter your PIN again for another sale." : "Sale saved."}
          </p>
        ) : (
          <Button onClick={() => setSuccess(null)} className="w-full">New Sale</Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-2xl font-bold">New Sale</h1>
        <p className="text-muted-foreground text-sm">Point of Sale — select items and complete transaction</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Item browser: catalog or manual entry */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAddMode("catalog")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${addMode === "catalog" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
            >
              <Boxes className="w-3.5 h-3.5" /> From Inventory
            </button>
            <button
              type="button"
              onClick={() => setAddMode("manual")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${addMode === "manual" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
            >
              <PencilLine className="w-3.5 h-3.5" /> Manual Entry
            </button>
          </div>

          {addMode === "catalog" ? (
            <>
              <div className="flex gap-2 flex-wrap">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${category === cat ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {filteredInventory.map((item: any) => (
                  <Card key={item.id} className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => addToCart(item)}>
                    <CardContent className="p-3">
                      <p className="font-medium text-sm leading-tight">{item.name}</p>
                      <p className="text-xs text-muted-foreground capitalize mt-1">{item.category}</p>
                      <div className="flex justify-between items-center mt-2">
                        <span className="font-bold text-sm">{formatCurrency(item.costPerUnit * 1.3)}</span>
                        <Badge variant="outline" className="text-[10px]">{item.quantity} left</Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <PencilLine className="w-4 h-4" /> Manually Enter Purchase
                </CardTitle>
                <p className="text-xs text-muted-foreground">Use this for items that aren't in the inventory catalog. It's recorded and reported exactly like any other sale.</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs">Item Name / Description</Label>
                  <Input value={manualName} onChange={e => setManualName(e.target.value)} placeholder="e.g. Custom gift basket" className="h-9 text-sm" />
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
                  <Plus className="w-4 h-4" /> Add to Cart
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Cart & checkout */}
        <div>
          <Card className="sticky top-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ShoppingCart className="w-4 h-4" /> Cart ({cart.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {cart.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Cart is empty</p>
              ) : (
                <div className="space-y-2 mb-4">
                  {cart.map(item => (
                    <div key={item.id} className="flex items-center gap-2 text-sm">
                      <div className="flex-1 min-w-0">
                        <p className="truncate flex items-center gap-1.5">
                          {item.name}
                          {item.isManual && <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">Manual</Badge>}
                        </p>
                        <p className="text-xs text-muted-foreground">{formatCurrency(item.price)} each</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateQty(item.id, -1)} className="w-6 h-6 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80">
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-5 text-center text-xs font-medium">{item.quantity}</span>
                        <button onClick={() => updateQty(item.id, 1)} className="w-6 h-6 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80">
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      <span className="w-14 text-right text-xs font-medium">{formatCurrency(item.price * item.quantity)}</span>
                    </div>
                  ))}
                  <div className="border-t border-border pt-2 flex justify-between font-bold">
                    <span>Total</span><span>{formatCurrency(total)}</span>
                  </div>
                </div>
              )}

              <form onSubmit={handleSale} className="space-y-3">
                <div>
                  <Label className="text-xs">Customer Name (optional)</Label>
                  <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Guest name" className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Payment</Label>
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
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {loading ? "Processing…" : `Complete Sale · ${formatCurrency(total)}`}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
