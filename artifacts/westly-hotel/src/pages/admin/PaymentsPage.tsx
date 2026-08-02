import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCollection } from "@/hooks/useFirebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logAction } from "@/lib/audit";
import { notifyPaymentReceived, notifyRefundIssued } from "@/lib/notifications";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { usePinTaskComplete } from "@/hooks/usePinTaskComplete";
import { PinSessionEndingOverlay } from "@/components/admin/PinSessionEndingOverlay";
import { Banknote, Plus, Search, Download, Loader2, Clock, CheckCircle2, XCircle } from "lucide-react";
import { formatCurrency, formatDate, toFirestoreDate } from "@/lib/utils";
import { format } from "date-fns";
import type { ApprovalStatus } from "@/lib/revenue";

const STATUS_BADGE: Record<ApprovalStatus, { label: string; className: string; icon: any }> = {
  pending: { label: "Pending Approval", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400", icon: Clock },
  approved: { label: "Approved", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", icon: CheckCircle2 },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: XCircle },
};

export default function PaymentsPage() {
  const { adminUser, role } = useAuth();
  const { toast } = useToast();
  const { isPinSession, endingSession, notifyTaskComplete } = usePinTaskComplete();
  const { data: payments, loading } = useCollection("payments");
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState(format(new Date(), "yyyy-MM"));
  const [form, setForm] = useState({ guestName: "", amount: "", paymentMethod: "cash", type: "room_payment", bookingId: "", notes: "" });

  const filtered = useMemo(() => {
    return payments.filter((p: any) => {
      const d = toFirestoreDate(p.createdAt);
      const matchMonth = !monthFilter || (d && format(d, "yyyy-MM") === monthFilter);
      const matchSearch = !search || p.guestName?.toLowerCase().includes(search.toLowerCase()) || p.type?.includes(search);
      return matchMonth && matchSearch && !p.isDeleted;
    }).sort((a: any, b: any) => {
      const ta = toFirestoreDate(a.createdAt)?.getTime() ?? 0;
      const tb = toFirestoreDate(b.createdAt)?.getTime() ?? 0;
      return tb - ta;
    });
  }, [payments, monthFilter, search]);

  // Only approved payments count toward "received" revenue — matches the
  // same rule used by the Revenue Dashboard and Financial Reports so this
  // total is never out of sync with those pages.
  const approvedTotal = filtered.filter((p: any) => (p.approvalStatus || "pending") === "approved").reduce((s: number, p: any) => s + (p.amount || 0), 0);
  const pendingTotal = filtered.filter((p: any) => (p.approvalStatus || "pending") === "pending").reduce((s: number, p: any) => s + (p.amount || 0), 0);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminUser) return;
    setSaving(true);
    try {
      const ref = await addDoc(collection(db, "payments"), {
        guestName: form.guestName,
        amount: parseFloat(form.amount),
        paymentMethod: form.paymentMethod,
        type: form.type,
        bookingId: form.bookingId || null,
        notes: form.notes || null,
        recordedBy: adminUser.id,
        recordedByName: adminUser.name,
        createdAt: serverTimestamp(),
        approvalStatus: "pending",
        approvedBy: null,
        approvedByName: null,
        approvedAt: null,
        rejectedReason: null,
        isDeleted: false,
      });
      await logAction(adminUser.id, adminUser.name, "payment_recorded", "payments", ref.id, null, { amount: parseFloat(form.amount) }, role ?? undefined);

      const amount = parseFloat(form.amount);
      if (form.type === "refund") {
        notifyRefundIssued(form.guestName, amount, adminUser.name, form.notes || undefined).catch(() => {});
      } else {
        notifyPaymentReceived(form.guestName, amount, form.paymentMethod, adminUser.name).catch(() => {});
      }

      toast({ title: "Payment Recorded", description: "Sent to the Accountant for approval." });
      setShowAdd(false);
      setForm({ guestName: "", amount: "", paymentMethod: "cash", type: "room_payment", bookingId: "", notes: "" });
      notifyTaskComplete();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const exportCSV = () => {
    const csv = [
      ["Date","Guest","Amount","Payment Method","Type","Status","Recorded By","Approved By"],
      ...filtered.map((p: any) => [
        formatDate(toFirestoreDate(p.createdAt)), p.guestName, p.amount, p.paymentMethod, p.type, p.approvalStatus || "pending", p.recordedByName, p.approvedByName || ""
      ])
    ].map(r => r.map((c: any) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], {type:"text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=`payments-${monthFilter}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const PAYMENT_TYPE_LABELS: Record<string, string> = {
    room_payment: "Room Payment", walk_in_payment: "Walk-In", deposit: "Deposit", refund: "Refund", other: "Other",
  };

  return (
    <div className="space-y-5">
      <PinSessionEndingOverlay visible={isPinSession && endingSession} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold">Payments</h1>
          <p className="text-muted-foreground text-sm">
            Approved: <span className="font-semibold text-green-600">{formatCurrency(approvedTotal)}</span>
            {pendingTotal > 0 && <> · Pending: <span className="font-semibold text-amber-600">{formatCurrency(pendingTotal)}</span></>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={exportCSV}><Download className="w-4 h-4" />Export</Button>
          <Button className="gap-2" onClick={() => setShowAdd(true)}><Plus className="w-4 h-4" />Record Payment</Button>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search guest, type…" value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Input type="month" value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className="w-44" />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-40"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground"><Banknote className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>No payments found</p></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Date</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Guest</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Type</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Amount</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Method</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Recorded By</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p: any) => {
                    const status: ApprovalStatus = p.approvalStatus || "pending";
                    const badge = STATUS_BADGE[status];
                    return (
                      <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                        <td className="py-2.5 px-4 text-muted-foreground">{formatDate(toFirestoreDate(p.createdAt))}</td>
                        <td className="py-2.5 px-4 font-medium">{p.guestName || "—"}</td>
                        <td className="py-2.5 px-4"><span className="text-xs text-muted-foreground">{PAYMENT_TYPE_LABELS[p.type] || p.type}</span></td>
                        <td className={`py-2.5 px-4 font-bold ${status === "approved" ? "text-green-600" : status === "rejected" ? "text-red-500 line-through" : "text-muted-foreground"}`}>{formatCurrency(p.amount || 0)}</td>
                        <td className="py-2.5 px-4 capitalize text-muted-foreground">{p.paymentMethod?.replace("_"," ")}</td>
                        <td className="py-2.5 px-4"><Badge variant="outline" className={`gap-1 ${badge.className}`}><badge.icon className="w-3 h-3" />{badge.label}</Badge></td>
                        <td className="py-2.5 px-4 text-muted-foreground">{p.recordedByName}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/40">
                    <td colSpan={3} className="py-3 px-4 font-bold text-right">Total (Approved)</td>
                    <td className="py-3 px-4 font-bold text-green-600">{formatCurrency(approvedTotal)}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2"><Label>Guest Name *</Label><Input required value={form.guestName} onChange={e => setForm({...form, guestName: e.target.value})} /></div>
              <div className="space-y-1.5"><Label>Amount (₦) *</Label><Input required type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} /></div>
              <div className="space-y-1.5"><Label>Payment Type</Label>
                <Select value={form.type} onValueChange={v => setForm({...form, type: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="room_payment">Room Payment</SelectItem>
                    <SelectItem value="walk_in_payment">Walk-In</SelectItem>
                    <SelectItem value="deposit">Deposit</SelectItem>
                    <SelectItem value="refund">Refund</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Payment Method</Label>
                <Select value={form.paymentMethod} onValueChange={v => setForm({...form, paymentMethod: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="credit_card">Credit Card</SelectItem>
                    <SelectItem value="debit_card">Debit Card</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="mobile_payment">Mobile Payment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Booking ID (optional)</Label><Input value={form.bookingId} onChange={e => setForm({...form, bookingId: e.target.value})} /></div>
              <div className="space-y-1.5 col-span-2"><Label>Notes</Label><Input value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>
            </div>
            <p className="text-xs text-muted-foreground">This payment will appear as <span className="font-medium">Pending Approval</span> until an Accountant reviews it.</p>
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
