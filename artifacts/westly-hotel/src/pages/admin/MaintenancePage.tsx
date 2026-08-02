import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCollection } from "@/hooks/useFirebase";
import { addDoc, collection, doc, updateDoc, serverTimestamp, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { updateRoomStatus } from "@/lib/roomLogic";
import { logAction } from "@/lib/audit";
import { notifyMaintenanceRequest, notifyMaintenanceResolved } from "@/lib/notifications";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { usePinTaskComplete } from "@/hooks/usePinTaskComplete";
import { PinSessionEndingOverlay } from "@/components/admin/PinSessionEndingOverlay";
import { Wrench, Plus, CheckCircle, Clock, AlertTriangle, Loader2 } from "lucide-react";
import { formatDate, toFirestoreDate } from "@/lib/utils";
import { DataError } from "@/components/ui/data-error";

export default function MaintenancePage() {
  const { adminUser, role } = useAuth();
  const { toast } = useToast();
  const { isPinSession, endingSession, notifyTaskComplete } = usePinTaskComplete();
  const { data: maintenance, loading, error } = useCollection("maintenance", [where("isDeleted", "!=", true)]);
  const { data: rooms } = useCollection("rooms", [where("isDeleted", "!=", true)]);

  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ roomId: "", title: "", description: "", priority: "medium" });
  const [saving, setSaving] = useState(false);
  const [closingId, setClosingId] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminUser) return;
    setSaving(true);
    try {
      const room = rooms.find((r: any) => r.id === form.roomId) as any;
      await addDoc(collection(db, "maintenance"), {
        roomId: form.roomId,
        roomNumber: room?.number || "—",
        title: form.title,
        description: form.description,
        priority: form.priority,
        status: "open",
        reportedBy: adminUser.id,
        reportedByName: adminUser.name,
        createdAt: serverTimestamp(),
        isDeleted: false,
      });
      // Set room to maintenance status
      if (room) await updateRoomStatus(form.roomId, "maintenance");
      toast({ title: "Maintenance Request Logged" });
      notifyMaintenanceRequest(room?.number ? `Room ${room.number}` : "a room", form.title, adminUser.name).catch(() => {});
      setShowDialog(false);
      setForm({ roomId: "", title: "", description: "", priority: "medium" });
      notifyTaskComplete();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const closeRequest = async (req: any) => {
    if (!adminUser) return;
    setClosingId(req.id);
    try {
      await updateDoc(doc(db, "maintenance", req.id), {
        status: "closed",
        closedAt: serverTimestamp(),
        closedBy: adminUser.id,
        closedByName: adminUser.name,
      });
      // Return room to available status
      if (req.roomId) await updateRoomStatus(req.roomId, "available").catch(() => {});
      await logAction(adminUser.id, adminUser.name, "maintenance_closed", "maintenance", req.id, { status: "open" }, { status: "closed" }, role ?? undefined);
      toast({ title: "Maintenance Closed", description: `Room ${req.roomNumber} is now available.` });
      notifyMaintenanceResolved(`Room ${req.roomNumber}`, adminUser.name).catch(() => {});
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setClosingId(null);
  };

  const PRIORITY_COLORS = {
    low: "bg-blue-100 text-blue-800",
    medium: "bg-yellow-100 text-yellow-800",
    high: "bg-red-100 text-red-800",
    critical: "bg-red-200 text-red-900 font-bold",
  };

  const open = maintenance.filter((m: any) => m.status !== "closed");
  const closed = maintenance.filter((m: any) => m.status === "closed");

  return (
    <div className="space-y-5">
      <PinSessionEndingOverlay visible={isPinSession && endingSession} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold">Maintenance</h1>
          <p className="text-muted-foreground text-sm">{open.length} open request{open.length !== 1 ? "s" : ""}</p>
        </div>
        <Button className="gap-2" onClick={() => setShowDialog(true)}>
          <Plus className="w-4 h-4" /> Log Request
        </Button>
      </div>

      {/* Open Requests */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <DataError message="We couldn't load maintenance requests." />
      ) : open.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mb-3">
            <CheckCircle className="w-7 h-7 text-green-600" />
          </div>
          <p className="font-semibold">No open maintenance requests</p>
        </div>
      ) : (
        <div className="space-y-3">
          {open.map((req: any) => (
            <Card key={req.id} className={req.priority === "critical" || req.priority === "high" ? "border-red-200 dark:border-red-800" : ""}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold">Room {req.roomNumber}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] ${PRIORITY_COLORS[req.priority as keyof typeof PRIORITY_COLORS] || ""}`}>
                        {req.priority}
                      </span>
                    </div>
                    <p className="font-medium">{req.title}</p>
                    {req.description && <p className="text-sm text-muted-foreground mt-1">{req.description}</p>}
                    <p className="text-xs text-muted-foreground mt-2">
                      Reported by {req.reportedByName} · {formatDate(toFirestoreDate(req.createdAt))}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="gap-1 shrink-0 ml-4" onClick={() => closeRequest(req)} disabled={closingId === req.id}>
                    {closingId === req.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                    {closingId === req.id ? "Closing…" : "Close"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Closed history */}
      {closed.length > 0 && (
        <div>
          <h3 className="font-semibold text-sm text-muted-foreground mb-2">Recently Closed</h3>
          <div className="space-y-2">
            {closed.slice(0, 5).map((req: any) => (
              <div key={req.id} className="flex items-center justify-between py-2 px-3 bg-muted/40 rounded-lg text-sm">
                <div>
                  <span className="font-medium">Room {req.roomNumber}</span>
                  <span className="text-muted-foreground ml-2">— {req.title}</span>
                </div>
                <Badge variant="outline" className="text-[10px] text-green-600 border-green-400">Closed</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Log request dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log Maintenance Request</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Room *</Label>
              <Select required value={form.roomId} onValueChange={v => setForm({...form, roomId: v})}>
                <SelectTrigger><SelectValue placeholder="Select room…" /></SelectTrigger>
                <SelectContent>
                  {rooms.map((room: any) => (
                    <SelectItem key={room.id} value={room.id}>Room {room.number} — {room.type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Issue Title *</Label>
              <Input required value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="e.g. AC not cooling, Leaking faucet" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Optional details" />
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={v => setForm({...form, priority: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={saving} className="gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}Log Request
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
