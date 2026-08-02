import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCollection } from "@/hooks/useFirebase";
import { addDoc, collection, doc, updateDoc, serverTimestamp, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logAction } from "@/lib/audit";
import { notifyNewLaundryRequest, notifyLaundryReady } from "@/lib/notifications";
import { useToast } from "@/hooks/use-toast";
import { usePinTaskComplete } from "@/hooks/usePinTaskComplete";
import { PinSessionEndingOverlay } from "@/components/admin/PinSessionEndingOverlay";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Shirt, Plus, Loader2, Clock, Droplets, Wind, Sparkles,
  PackageCheck, Truck, CheckCircle, Banknote,
} from "lucide-react";
import { formatCurrency, formatDateTime, toFirestoreDate } from "@/lib/utils";
import { DataError } from "@/components/ui/data-error";

// ── Status workflow ──────────────────────────────────────────────────────
export const LAUNDRY_STATUSES = ["received", "washing", "drying", "ironing", "ready", "delivered"] as const;
export type LaundryStatus = (typeof LAUNDRY_STATUSES)[number];

export const STATUS_LABELS: Record<LaundryStatus, string> = {
  received: "Received",
  washing: "Washing",
  drying: "Drying",
  ironing: "Ironing",
  ready: "Ready for Collection",
  delivered: "Delivered",
};

const STATUS_ICONS: Record<LaundryStatus, any> = {
  received: PackageCheck,
  washing: Droplets,
  drying: Wind,
  ironing: Sparkles,
  ready: Clock,
  delivered: Truck,
};

const STATUS_COLORS: Record<string, string> = {
  received: "bg-slate-100 text-slate-800 dark:bg-slate-800/40 dark:text-slate-300",
  washing: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  drying: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400",
  ironing: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  ready: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  delivered: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

function nextStatus(status: LaundryStatus): LaundryStatus | null {
  const i = LAUNDRY_STATUSES.indexOf(status);
  return i >= 0 && i < LAUNDRY_STATUSES.length - 1 ? LAUNDRY_STATUSES[i + 1] : null;
}

function emptyForm() {
  return {
    guestName: "",
    roomNumber: "",
    itemsDescription: "",
    itemCount: "1",
    charge: "",
    paymentMethod: "room_charge",
    notes: "",
  };
}

export default function LaundryPage() {
  const { adminUser, role } = useAuth();
  const { toast } = useToast();
  const { isPinSession, endingSession, notifyTaskComplete } = usePinTaskComplete();
  const { data: requests, loading, error } = useCollection("laundry_requests", [where("isDeleted", "!=", true)]);

  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [chargeTarget, setChargeTarget] = useState<any>(null);
  const [chargeValue, setChargeValue] = useState("");

  const active = useMemo(
    () => requests.filter((r: any) => r.status !== "delivered" && r.status !== "cancelled")
      .sort((a: any, b: any) => (toFirestoreDate(a.createdAt)?.getTime() ?? 0) - (toFirestoreDate(b.createdAt)?.getTime() ?? 0)),
    [requests]
  );

  const grouped = useMemo(() => {
    const g: Record<LaundryStatus, any[]> = { received: [], washing: [], drying: [], ironing: [], ready: [], delivered: [] };
    for (const r of active) if (g[r.status as LaundryStatus]) g[r.status as LaundryStatus].push(r);
    return g;
  }, [active]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminUser) return;
    if (!form.guestName.trim() && !form.roomNumber.trim()) {
      toast({ title: "Missing guest info", description: "Enter a guest name or room number.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const ref = await addDoc(collection(db, "laundry_requests"), {
        guestName: form.guestName || null,
        roomNumber: form.roomNumber || null,
        itemsDescription: form.itemsDescription || null,
        itemCount: parseInt(form.itemCount) || 1,
        charge: parseFloat(form.charge) || 0,
        paymentMethod: form.paymentMethod,
        paymentStatus: "unpaid",
        notes: form.notes || null,
        status: "received",
        laundryValetId: adminUser.id,
        laundryValetName: adminUser.name,
        approvalStatus: "pending",
        approvedBy: null,
        approvedByName: null,
        approvedAt: null,
        rejectedReason: null,
        receivedAt: serverTimestamp(),
        collectedAt: null,
        deliveredAt: null,
        createdAt: serverTimestamp(),
        isDeleted: false,
      });
      await logAction(adminUser.id, adminUser.name, "laundry_request_created", "laundry_requests", ref.id, null, { guestName: form.guestName, roomNumber: form.roomNumber }, role ?? undefined);
      notifyNewLaundryRequest(form.guestName || `Room ${form.roomNumber}`, parseInt(form.itemCount) || 1, adminUser.name).catch(() => {});
      toast({ title: "Laundry Request Logged" });
      setShowNew(false);
      setForm(emptyForm());
      notifyTaskComplete();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const advanceStatus = async (request: any) => {
    if (!adminUser) return;
    const next = nextStatus(request.status);
    if (!next) return;
    setBusyId(request.id);
    try {
      const updates: any = { status: next, updatedAt: serverTimestamp(), updatedBy: adminUser.id };
      if (next === "delivered") updates.deliveredAt = serverTimestamp();
      await updateDoc(doc(db, "laundry_requests", request.id), updates);
      await logAction(adminUser.id, adminUser.name, "laundry_status_updated", "laundry_requests", request.id, { status: request.status }, { status: next }, role ?? undefined);
      if (next === "ready") {
        notifyLaundryReady(request.guestName || `Room ${request.roomNumber}`, adminUser.name).catch(() => {});
      }
      toast({ title: "Status Updated", description: `${STATUS_LABELS[next]}` });
      if (next === "delivered") notifyTaskComplete();
    } catch (err: any) {
      toast({ title: "Update Failed", description: err.message, variant: "destructive" });
    }
    setBusyId(null);
  };

  const openCharge = (request: any) => {
    setChargeTarget(request);
    setChargeValue(String(request.charge || ""));
  };

  const saveCharge = async () => {
    if (!chargeTarget || !adminUser) return;
    const amount = parseFloat(chargeValue);
    if (isNaN(amount) || amount < 0) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "laundry_requests", chargeTarget.id), { charge: amount, updatedAt: serverTimestamp() });
      await logAction(adminUser.id, adminUser.name, "laundry_charge_updated", "laundry_requests", chargeTarget.id, { charge: chargeTarget.charge }, { charge: amount }, role ?? undefined);
      toast({ title: "Charge Updated", description: formatCurrency(amount) });
      setChargeTarget(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const togglePaid = async (request: any) => {
    if (!adminUser) return;
    setBusyId(request.id);
    try {
      const newStatus = request.paymentStatus === "paid" ? "unpaid" : "paid";
      await updateDoc(doc(db, "laundry_requests", request.id), { paymentStatus: newStatus, updatedAt: serverTimestamp() });
      toast({ title: newStatus === "paid" ? "Marked Paid" : "Marked Unpaid" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setBusyId(null);
  };

  return (
    <div className="space-y-5">
      <PinSessionEndingOverlay visible={isPinSession && endingSession} />
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold flex items-center gap-2"><Shirt className="w-6 h-6" /> Laundry</h1>
          <p className="text-muted-foreground text-sm">{active.length} active request{active.length !== 1 ? "s" : ""}</p>
        </div>
        <Button className="gap-2" onClick={() => setShowNew(true)}><Plus className="w-4 h-4" /> New Request</Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {LAUNDRY_STATUSES.map(s => {
          const Icon = STATUS_ICONS[s];
          return (
            <Card key={s}>
              <CardContent className="p-3 text-center">
                <Icon className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                <p className="text-xl font-bold">{s === "delivered" ? requests.filter((r: any) => r.status === "delivered").length : grouped[s].length}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{STATUS_LABELS[s]}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <DataError message="We couldn't load laundry requests." />
      ) : active.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="font-semibold text-lg">No active laundry requests</h3>
          <p className="text-muted-foreground text-sm mt-1">Log a new request to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {active.map((r: any) => {
            const Icon = STATUS_ICONS[r.status as LaundryStatus];
            const next = nextStatus(r.status);
            return (
              <Card key={r.id}>
                <CardContent className="p-4 flex items-start gap-3 flex-wrap">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-[180px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{r.guestName || (r.roomNumber ? `Room ${r.roomNumber}` : "Guest")}</p>
                      {r.roomNumber && r.guestName && <span className="text-xs text-muted-foreground">Room {r.roomNumber}</span>}
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_COLORS[r.status]}`}>{STATUS_LABELS[r.status as LaundryStatus]}</span>
                      <Badge variant={r.paymentStatus === "paid" ? "default" : "outline"} className="text-[10px] cursor-pointer" onClick={() => togglePaid(r)}>
                        {r.paymentStatus === "paid" ? "Paid" : "Unpaid"}
                      </Badge>
                    </div>
                    {r.itemsDescription && <p className="text-xs text-muted-foreground mt-1">{r.itemsDescription} · {r.itemCount} item{r.itemCount !== 1 ? "s" : ""}</p>}
                    <p className="text-xs text-muted-foreground mt-0.5">Logged by {r.laundryValetName} · {formatDateTime(toFirestoreDate(r.createdAt))}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button className="text-sm font-bold text-primary flex items-center gap-1" onClick={() => openCharge(r)} title="Edit charge">
                      <Banknote className="w-3.5 h-3.5" />{formatCurrency(r.charge || 0)}
                    </button>
                    {next && (
                      <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => advanceStatus(r)} disabled={busyId === r.id}>
                        {busyId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                        Mark {STATUS_LABELS[next]}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* New request dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Laundry Request</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Guest Name</Label><Input value={form.guestName} onChange={e => setForm({...form, guestName: e.target.value})} /></div>
              <div className="space-y-1.5"><Label>Room Number</Label><Input value={form.roomNumber} onChange={e => setForm({...form, roomNumber: e.target.value})} placeholder="e.g. 201" /></div>
            </div>
            <div className="space-y-1.5">
              <Label>Items</Label>
              <Textarea value={form.itemsDescription} onChange={e => setForm({...form, itemsDescription: e.target.value})} placeholder="e.g. 3 shirts, 2 trousers, 1 suit" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Item Count</Label><Input type="number" min="1" value={form.itemCount} onChange={e => setForm({...form, itemCount: e.target.value})} /></div>
              <div className="space-y-1.5"><Label>Service Charge (₦)</Label><Input type="number" min="0" step="0.01" value={form.charge} onChange={e => setForm({...form, charge: e.target.value})} placeholder="0.00" /></div>
            </div>
            <div className="space-y-1.5">
              <Label>Payment Method</Label>
              <Select value={form.paymentMethod} onValueChange={v => setForm({...form, paymentMethod: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="room_charge">Charge to Room</SelectItem>
                  <SelectItem value="pay_on_delivery">Pay on Delivery</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Notes</Label><Input value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Special instructions…" /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
              <Button type="submit" disabled={saving} className="gap-2">{saving && <Loader2 className="w-4 h-4 animate-spin" />}Log Request</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Charge dialog */}
      <Dialog open={!!chargeTarget} onOpenChange={(o) => !o && setChargeTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Update Charge</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>Service Charge (₦)</Label>
            <Input type="number" min="0" step="0.01" value={chargeValue} onChange={e => setChargeValue(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChargeTarget(null)}>Cancel</Button>
            <Button onClick={saveCharge} disabled={saving} className="gap-2">{saving && <Loader2 className="w-4 h-4 animate-spin" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
