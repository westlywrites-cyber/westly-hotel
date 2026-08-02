import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCollection } from "@/hooks/useFirebase";
import { addDoc, collection, doc, updateDoc, serverTimestamp, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logAction } from "@/lib/audit";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Wine, Plus, AlertTriangle, RefreshCw, Search, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { DataError } from "@/components/ui/data-error";

// Bar inventory shares the hotel's single `inventory` collection, scoped to
// the "drinks" category, so stock counts stay consistent with the general
// Inventory page (super_admin/manager/accountant) instead of forking into a
// second source of truth.
export default function BarInventoryPage() {
  const { adminUser, role } = useAuth();
  const { toast } = useToast();
  const canManage = role === "super_admin" || role === "manager";
  const { data: inventory, loading, error } = useCollection("inventory", [where("category", "==", "drinks")]);

  const [showAdd, setShowAdd] = useState(false);
  const [showRestock, setShowRestock] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [restockAmount, setRestockAmount] = useState("");
  const [form, setForm] = useState({ name: "", quantity: "", minStock: "", unit: "bottles", costPerUnit: "", supplier: "" });

  const filtered = inventory.filter((i: any) => !i.isDeleted && (!search || i.name?.toLowerCase().includes(search.toLowerCase())));
  const lowStockItems = inventory.filter((i: any) => i.quantity <= i.minStock && !i.isDeleted);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminUser) return;
    setSaving(true);
    try {
      const ref = await addDoc(collection(db, "inventory"), {
        name: form.name,
        category: "drinks",
        quantity: parseInt(form.quantity),
        minStock: parseInt(form.minStock),
        unit: form.unit,
        costPerUnit: parseFloat(form.costPerUnit) || 0,
        supplier: form.supplier || null,
        isDeleted: false,
        lastRestocked: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
      await logAction(adminUser.id, adminUser.name, "bar_inventory_added", "inventory", ref.id, null, { name: form.name }, role ?? undefined);
      toast({ title: "Item Added" });
      setShowAdd(false);
      setForm({ name: "", quantity: "", minStock: "", unit: "bottles", costPerUnit: "", supplier: "" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const handleRestock = async () => {
    if (!adminUser || !showRestock || !restockAmount) return;
    const amount = parseInt(restockAmount);
    if (isNaN(amount) || amount <= 0) return;
    setSaving(true);
    try {
      const newQty = showRestock.quantity + amount;
      await updateDoc(doc(db, "inventory", showRestock.id), {
        quantity: newQty,
        lastRestocked: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await logAction(adminUser.id, adminUser.name, "bar_inventory_restocked", "inventory", showRestock.id, { quantity: showRestock.quantity }, { quantity: newQty }, role ?? undefined);
      toast({ title: "Restocked", description: `${showRestock.name}: ${showRestock.quantity} → ${newQty}` });
      setShowRestock(null);
      setRestockAmount("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold flex items-center gap-2"><Wine className="w-6 h-6" /> Bar Inventory</h1>
          <p className="text-muted-foreground text-sm">{inventory.length} drink stock items</p>
        </div>
        {canManage && <Button className="gap-2" onClick={() => setShowAdd(true)}><Plus className="w-4 h-4" /> Add Item</Button>}
      </div>

      {lowStockItems.length > 0 && (
        <div className="bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800 rounded-xl p-4">
          <p className="text-sm font-semibold text-orange-700 dark:text-orange-400 flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4" /> Low Stock Alert ({lowStockItems.length} items)
          </p>
          <div className="flex flex-wrap gap-2">
            {lowStockItems.map((item: any) => (
              <Badge key={item.id} variant="outline" className="border-orange-400 text-orange-700 text-xs">
                {item.name}: {item.quantity}/{item.minStock} {item.unit}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search drinks stock…" value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-40"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : error ? (
            <DataError message="We couldn't load bar inventory." />
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground"><Wine className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>No drink stock items found</p></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Item</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Stock</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Min. Stock</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Unit Cost</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Supplier</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item: any) => {
                    const isLow = item.quantity <= item.minStock;
                    return (
                      <tr key={item.id} className={`border-b border-border last:border-0 hover:bg-muted/20 ${isLow ? "bg-orange-50/50 dark:bg-orange-900/5" : ""}`}>
                        <td className="py-2.5 px-4 font-medium">{item.name}{isLow && <AlertTriangle className="w-3.5 h-3.5 text-orange-500 inline ml-1.5" />}</td>
                        <td className="py-2.5 px-4">
                          <span className={`font-semibold ${isLow ? "text-orange-600" : "text-foreground"}`}>{item.quantity}</span>
                          <span className="text-muted-foreground text-xs ml-1">{item.unit}</span>
                        </td>
                        <td className="py-2.5 px-4 text-muted-foreground">{item.minStock} {item.unit}</td>
                        <td className="py-2.5 px-4">{item.costPerUnit ? formatCurrency(item.costPerUnit) : "—"}</td>
                        <td className="py-2.5 px-4 text-muted-foreground">{item.supplier || "—"}</td>
                        <td className="py-2.5 px-4">
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowRestock(item)}>
                            <RefreshCw className="w-3 h-3" /> Restock
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add item dialog */}
      {canManage && (
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Bar Stock Item</DialogTitle></DialogHeader>
            <form onSubmit={handleAdd} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 col-span-2"><Label>Item Name *</Label><Input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Heineken (bottle)" /></div>
                <div className="space-y-1.5"><Label>Unit</Label><Input value={form.unit} onChange={e => setForm({...form, unit: e.target.value})} placeholder="bottles, cans, crates…" /></div>
                <div className="space-y-1.5"><Label>Initial Quantity *</Label><Input required type="number" min="0" value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})} /></div>
                <div className="space-y-1.5"><Label>Min. Stock Alert *</Label><Input required type="number" min="0" value={form.minStock} onChange={e => setForm({...form, minStock: e.target.value})} /></div>
                <div className="space-y-1.5"><Label>Cost per Unit (₦)</Label><Input type="number" min="0" step="0.01" value={form.costPerUnit} onChange={e => setForm({...form, costPerUnit: e.target.value})} /></div>
                <div className="space-y-1.5 col-span-2"><Label>Supplier</Label><Input value={form.supplier} onChange={e => setForm({...form, supplier: e.target.value})} /></div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
                <Button type="submit" disabled={saving} className="gap-2">{saving && <Loader2 className="w-4 h-4 animate-spin" />}Add Item</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Restock dialog */}
      <Dialog open={!!showRestock} onOpenChange={() => setShowRestock(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Restock: {showRestock?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Current stock: <strong>{showRestock?.quantity} {showRestock?.unit}</strong></p>
            <div className="space-y-1.5">
              <Label>Add Quantity</Label>
              <Input type="number" min="1" value={restockAmount} onChange={e => setRestockAmount(e.target.value)} placeholder="How many to add?" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRestock(null)}>Cancel</Button>
            <Button onClick={handleRestock} disabled={saving || !restockAmount} className="gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}Restock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
