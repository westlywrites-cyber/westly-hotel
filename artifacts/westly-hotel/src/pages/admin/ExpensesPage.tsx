import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCollection } from "@/hooks/useFirebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logAction } from "@/lib/audit";
import { notifyLargeExpense } from "@/lib/notifications";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Receipt, Plus, TrendingDown, Loader2, Search, Download } from "lucide-react";
import { formatCurrency, formatDate, toFirestoreDate } from "@/lib/utils";
import { DataError } from "@/components/ui/data-error";
import { startOfMonth, endOfMonth, format } from "date-fns";

const CATEGORIES = ["utilities", "maintenance", "supplies", "payroll", "marketing", "food_beverage", "equipment", "other"];

export default function ExpensesPage() {
  const { adminUser, role } = useAuth();
  const { toast } = useToast();
  const { data: expenses, loading, error } = useCollection("expenses");
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState(format(new Date(), "yyyy-MM"));
  const [form, setForm] = useState({ title: "", amount: "", category: "other", date: format(new Date(), "yyyy-MM-dd"), description: "", paymentMethod: "cash" });

  const filtered = useMemo(() => {
    return expenses.filter((e: any) => {
      const d = toFirestoreDate(e.date);
      const matchMonth = !monthFilter || (d && format(d, "yyyy-MM") === monthFilter);
      const matchSearch = !search || e.title?.toLowerCase().includes(search.toLowerCase()) || e.category?.includes(search.toLowerCase());
      return matchMonth && matchSearch && !e.isDeleted;
    }).sort((a: any, b: any) => {
      const ta = toFirestoreDate(a.date)?.getTime() ?? 0;
      const tb = toFirestoreDate(b.date)?.getTime() ?? 0;
      return tb - ta;
    });
  }, [expenses, monthFilter, search]);

  const total = filtered.reduce((sum, e: any) => sum + (e.amount || 0), 0);

  const byCategory = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach((e: any) => {
      map[e.category] = (map[e.category] || 0) + (e.amount || 0);
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const handleAdd = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!adminUser) return;
    setSaving(true);
    try {
      const amount = parseFloat(form.amount);
      const ref = await addDoc(collection(db, "expenses"), {
        title: form.title,
        amount,
        category: form.category,
        date: new Date(form.date),
        description: form.description || null,
        paymentMethod: form.paymentMethod,
        recordedBy: adminUser.id,
        recordedByName: adminUser.name,
        createdAt: serverTimestamp(),
        isDeleted: false,
      });
      await logAction(adminUser.id, adminUser.name, "expense_recorded", "expenses", ref.id, null, { amount, title: form.title }, role ?? undefined);
      if (amount >= 1000) {
        notifyLargeExpense(form.title, amount, adminUser.name).catch(() => {});
      }
      toast({ title: "Expense Recorded", description: `${formatCurrency(amount)} saved.` });
      setShowAdd(false);
      setForm({ title: "", amount: "", category: "other", date: format(new Date(), "yyyy-MM-dd"), description: "", paymentMethod: "cash" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const exportCSV = () => {
    const csv = [
      ["Date","Title","Category","Amount","Payment Method","Recorded By"],
      ...filtered.map((e: any) => [
        formatDate(toFirestoreDate(e.date)), e.title, e.category, e.amount, e.paymentMethod, e.recordedByName
      ])
    ].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], {type:"text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `expenses-${monthFilter}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold">Expenses</h1>
          <p className="text-muted-foreground text-sm">Total: {formatCurrency(total)}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={exportCSV}><Download className="w-4 h-4" /> Export</Button>
          <Button className="gap-2" onClick={() => setShowAdd(true)}><Plus className="w-4 h-4" /> Add Expense</Button>
        </div>
      </div>

      {/* Category breakdown */}
      {byCategory.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {byCategory.slice(0, 4).map(([cat, amt]) => (
            <Card key={cat}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground capitalize">{cat.replace("_"," ")}</p>
                <p className="text-lg font-bold text-destructive mt-1">{formatCurrency(amt)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search expenses…" value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Input type="month" value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className="w-44" />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-40"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : error ? (
            <DataError message="We couldn't load expenses." />
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground"><Receipt className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>No expenses found</p></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Date</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Title</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Category</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Amount</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Payment</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Recorded By</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e: any) => (
                    <tr key={e.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="py-2.5 px-4">{formatDate(toFirestoreDate(e.date))}</td>
                      <td className="py-2.5 px-4 font-medium">{e.title}</td>
                      <td className="py-2.5 px-4 capitalize text-muted-foreground">{e.category?.replace("_"," ")}</td>
                      <td className="py-2.5 px-4 font-bold text-destructive">{formatCurrency(e.amount || 0)}</td>
                      <td className="py-2.5 px-4 capitalize text-muted-foreground">{e.paymentMethod?.replace("_"," ")}</td>
                      <td className="py-2.5 px-4 text-muted-foreground">{e.recordedByName}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/40">
                    <td colSpan={3} className="py-3 px-4 font-bold text-right">Total</td>
                    <td className="py-3 px-4 font-bold text-destructive">{formatCurrency(total)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Expense</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2"><Label>Title *</Label><Input required value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Electricity bill, Supplies…" /></div>
              <div className="space-y-1.5"><Label>Amount (₦) *</Label><Input required type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} /></div>
              <div className="space-y-1.5"><Label>Date *</Label><Input required type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} /></div>
              <div className="space-y-1.5"><Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm({...form, category: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c.replace("_"," ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Payment Method</Label>
                <Select value={form.paymentMethod} onValueChange={v => setForm({...form, paymentMethod: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="check">Check</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2"><Label>Notes</Label><Input value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Optional" /></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button type="submit" disabled={saving} className="gap-2">{saving && <Loader2 className="w-4 h-4 animate-spin" />}Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
