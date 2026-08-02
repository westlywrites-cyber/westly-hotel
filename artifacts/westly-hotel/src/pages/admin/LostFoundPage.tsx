import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCollection } from "@/hooks/useFirebase";
import { addDoc, collection, doc, updateDoc, serverTimestamp, arrayUnion, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logAction } from "@/lib/audit";
import { notifyLostFoundItem, notifyLostFoundClaimed } from "@/lib/notifications";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import ImageUpload from "@/components/admin/ImageUpload";
import { usePinTaskComplete } from "@/hooks/usePinTaskComplete";
import { PinSessionEndingOverlay } from "@/components/admin/PinSessionEndingOverlay";
import {
  PackageSearch, Plus, Search, Loader2, BedDouble, User, Clock,
  History, ImageIcon, Eye, ArchiveRestore, PackageCheck, PackageX, PackageOpen,
} from "lucide-react";
import {
  formatDateTime, toFirestoreDate, toDateTimeLocalValue, parseDateTimeLocal,
} from "@/lib/utils";
import { DataError } from "@/components/ui/data-error";

type ItemStatus = "stored" | "returned_to_guest" | "claimed" | "disposed";

const STATUS_LABELS: Record<ItemStatus, string> = {
  stored: "Stored",
  returned_to_guest: "Returned to Guest",
  claimed: "Claimed",
  disposed: "Disposed",
};

const STATUS_COLORS: Record<ItemStatus, string> = {
  stored: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  returned_to_guest: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  claimed: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  disposed: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400",
};

const STATUS_ICONS: Record<ItemStatus, React.ComponentType<any>> = {
  stored: PackageOpen,
  returned_to_guest: ArchiveRestore,
  claimed: PackageCheck,
  disposed: PackageX,
};

const emptyForm = {
  itemName: "",
  description: "",
  roomId: "",
  roomNumber: "",
  foundAtLocal: "",
  foundByName: "",
  status: "stored" as ItemStatus,
  notes: "",
  photoUrl: "",
};

export default function LostFoundPage() {
  const { adminUser, role } = useAuth();
  const { toast } = useToast();
  const { isPinSession, endingSession, notifyTaskComplete } = usePinTaskComplete();

  // Real-time subscription — onSnapshot under the hood, so a submission from
  // a housekeeper appears instantly for Manager/Super Admin without a refresh.
  const { data: items, loading, error } = useCollection<any>("lost_found", [where("isDeleted", "!=", true)]);
  const { data: rooms } = useCollection<any>("rooms", [where("isDeleted", "!=", true)]);

  const canCreate = role === "super_admin" || role === "manager" || role === "housekeeping";
  const canManageStatus = role === "super_admin" || role === "manager";

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...emptyForm, foundAtLocal: toDateTimeLocalValue(new Date()), foundByName: adminUser?.name || "" });
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [statusNote, setStatusNote] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const filtered = useMemo(() => {
    return items
      .filter((it: any) => {
        const matchSearch = !search ||
          it.itemName?.toLowerCase().includes(search.toLowerCase()) ||
          it.description?.toLowerCase().includes(search.toLowerCase()) ||
          it.roomNumber?.toLowerCase?.().includes(search.toLowerCase()) ||
          it.foundByName?.toLowerCase().includes(search.toLowerCase());
        const matchStatus = statusFilter === "all" || it.status === statusFilter;
        return matchSearch && matchStatus;
      })
      .sort((a: any, b: any) => (toFirestoreDate(b.foundAt)?.getTime() ?? 0) - (toFirestoreDate(a.foundAt)?.getTime() ?? 0));
  }, [items, search, statusFilter]);

  const openCreate = () => {
    setForm({ ...emptyForm, foundAtLocal: toDateTimeLocalValue(new Date()), foundByName: adminUser?.name || "" });
    setShowCreate(true);
  };

  const handleRoomChange = (roomId: string) => {
    const room = rooms.find((r: any) => r.id === roomId) as any;
    setForm(f => ({ ...f, roomId, roomNumber: room?.number || "" }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminUser) return;

    const foundAt = parseDateTimeLocal(form.foundAtLocal);
    if (!form.foundAtLocal || isNaN(foundAt.getTime())) {
      toast({ title: "Missing Date/Time", description: "Please enter when the item was found.", variant: "destructive" });
      return;
    }
    if (!form.itemName.trim() || !form.roomNumber.trim() || !form.foundByName.trim()) {
      toast({ title: "Missing Details", description: "Item name, room, and housekeeper name are required.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const docRef = await addDoc(collection(db, "lost_found"), {
        itemName: form.itemName.trim(),
        description: form.description.trim() || null,
        roomId: form.roomId || null,
        roomNumber: form.roomNumber.trim(),
        foundAt,
        foundByName: form.foundByName.trim(),
        foundBy: adminUser.id,
        status: form.status,
        notes: form.notes.trim() || null,
        photoUrl: form.photoUrl.trim() || null,
        createdBy: adminUser.id,
        createdByName: adminUser.name,
        createdAt: serverTimestamp(),
        updatedBy: adminUser.id,
        updatedByName: adminUser.name,
        updatedAt: serverTimestamp(),
        statusHistory: [{
          status: form.status,
          changedBy: adminUser.id,
          changedByName: adminUser.name,
          changedAt: new Date(),
          note: "Item logged",
        }],
        isDeleted: false,
      });

      await logAction(
        adminUser.id, adminUser.name, "lost_found_item_logged", "lost_found", docRef.id,
        undefined, { itemName: form.itemName, roomNumber: form.roomNumber, status: form.status }, role ?? undefined
      );

      toast({ title: "Item Logged", description: `${form.itemName} recorded for Room ${form.roomNumber}.` });
      notifyLostFoundItem(form.itemName.trim(), form.roomNumber.trim(), adminUser.name).catch(() => {});
      setShowCreate(false);
      notifyTaskComplete();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const handleStatusChange = async (item: any, newStatus: ItemStatus) => {
    if (!adminUser || !canManageStatus) return;
    setUpdatingStatus(true);
    try {
      const prevStatus = item.status;
      await updateDoc(doc(db, "lost_found", item.id), {
        status: newStatus,
        updatedAt: serverTimestamp(),
        updatedBy: adminUser.id,
        updatedByName: adminUser.name,
        statusHistory: arrayUnion({
          status: newStatus,
          changedBy: adminUser.id,
          changedByName: adminUser.name,
          changedAt: new Date(),
          note: statusNote.trim() || null,
        }),
      });

      await logAction(
        adminUser.id, adminUser.name, `lost_found_status_changed:${prevStatus}→${newStatus}`,
        "lost_found", item.id, { status: prevStatus }, { status: newStatus }, role ?? undefined
      );

      toast({ title: "Status Updated", description: `${item.itemName} marked as ${STATUS_LABELS[newStatus as ItemStatus]}.` });
      if (newStatus === "returned_to_guest" || newStatus === "claimed") {
        notifyLostFoundClaimed(item.itemName, item.guestName || "the guest", adminUser.name).catch(() => {});
      }
      setStatusNote("");
      setSelected((prev: any) => prev && prev.id === item.id ? { ...prev, status: newStatus } : prev);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setUpdatingStatus(false);
  };

  const historyFor = (item: any) => {
    const history = Array.isArray(item?.statusHistory) ? [...item.statusHistory] : [];
    return history.sort((a, b) => (toFirestoreDate(b.changedAt)?.getTime() ?? 0) - (toFirestoreDate(a.changedAt)?.getTime() ?? 0));
  };

  return (
    <div className="space-y-5">
      <PinSessionEndingOverlay visible={isPinSession && endingSession} />
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold">Lost &amp; Found</h1>
          <p className="text-muted-foreground text-sm">{filtered.length} item{filtered.length !== 1 ? "s" : ""}</p>
        </div>
        {canCreate && (
          <Button className="gap-2" onClick={openCreate}>
            <Plus className="w-4 h-4" /> Log Found Item
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by item, room, description, housekeeper…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {(Object.keys(STATUS_LABELS) as ItemStatus[]).map(s => (
              <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <DataError message="We couldn't load lost & found items." />
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <PackageSearch className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>No lost &amp; found items recorded</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Item</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Room</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Found By</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Found At</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item: any) => (
                    <tr key={item.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4">
                        <p className="font-medium">{item.itemName}</p>
                        {item.description && <p className="text-xs text-muted-foreground truncate max-w-[220px]">{item.description}</p>}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <BedDouble className="w-3.5 h-3.5 text-muted-foreground" />
                          Room {item.roomNumber}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-muted-foreground" />
                          {item.foundByName}
                        </div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">{formatDateTime(toFirestoreDate(item.foundAt))}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_COLORS[item.status as ItemStatus] || ""}`}>
                          {STATUS_LABELS[item.status as ItemStatus] || item.status}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 text-xs"
                          onClick={() => { setSelected(item); setStatusNote(""); }}
                        >
                          <Eye className="w-3.5 h-3.5" /> View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Log Found Item Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Log Found Item</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Item Name *</Label>
              <Input required value={form.itemName} onChange={e => setForm({ ...form, itemName: e.target.value })} placeholder="e.g. Phone charger, Wristwatch" />
            </div>
            <div className="space-y-1.5">
              <Label>Description *</Label>
              <Textarea required value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Color, brand, distinguishing details…" />
            </div>
            <div className="space-y-1.5">
              <Label>Room *</Label>
              <Select required value={form.roomId} onValueChange={handleRoomChange}>
                <SelectTrigger><SelectValue placeholder="Select room…" /></SelectTrigger>
                <SelectContent>
                  {rooms.map((room: any) => (
                    <SelectItem key={room.id} value={room.id}>Room {room.number} — {room.type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!form.roomId && (
                <Input
                  className="mt-1.5"
                  placeholder="Or type a room number manually"
                  value={form.roomNumber}
                  onChange={e => setForm(f => ({ ...f, roomNumber: e.target.value }))}
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Date &amp; Time Found *</Label>
              <Input
                type="datetime-local"
                required
                value={form.foundAtLocal}
                onChange={e => setForm({ ...form, foundAtLocal: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Found By *</Label>
              <Input required value={form.foundByName} onChange={e => setForm({ ...form, foundByName: e.target.value })} placeholder="Housekeeper's name" />
            </div>
            <div className="space-y-1.5">
              <Label>Current Status</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v as ItemStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_LABELS) as ItemStatus[]).map(s => (
                    <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Additional Notes (optional)</Label>
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Any other details" />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><ImageIcon className="w-3.5 h-3.5" /> Photo (optional)</Label>
              <ImageUpload
                value={form.photoUrl}
                onChange={(url) => setForm({ ...form, photoUrl: url })}
                folder="lost-found"
                label="item photo"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" disabled={saving} className="gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Log Item
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail / Manage Dialog */}
      {selected && (
        <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selected.itemName}</DialogTitle>
              <DialogDescription>Room {selected.roomNumber}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {selected.photoUrl && (
                <img src={selected.photoUrl} alt={selected.itemName} className="w-full h-40 object-cover rounded-lg border border-border" onError={e => (e.currentTarget.style.display = "none")} />
              )}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Status</p>
                  <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_COLORS[selected.status as ItemStatus] || ""}`}>
                    {STATUS_LABELS[selected.status as ItemStatus] || selected.status}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Found At</p>
                  <p>{formatDateTime(toFirestoreDate(selected.foundAt))}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Found By</p>
                  <p>{selected.foundByName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Room</p>
                  <p>Room {selected.roomNumber}</p>
                </div>
                {selected.description && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Description</p>
                    <p>{selected.description}</p>
                  </div>
                )}
                {selected.notes && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Notes</p>
                    <p>{selected.notes}</p>
                  </div>
                )}
              </div>

              <div className="border-t border-border pt-3 text-xs text-muted-foreground space-y-1">
                <p>Created by <span className="font-medium text-foreground">{selected.createdByName}</span>{selected.createdAt && <> · {formatDateTime(toFirestoreDate(selected.createdAt))}</>}</p>
                {selected.updatedByName && (
                  <p>Last updated by <span className="font-medium text-foreground">{selected.updatedByName}</span>{selected.updatedAt && <> · {formatDateTime(toFirestoreDate(selected.updatedAt))}</>}</p>
                )}
              </div>

              {/* Status change controls — Manager / Super Admin only */}
              {canManageStatus && (
                <div className="border-t border-border pt-3">
                  <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">Update Status</p>
                  <Input
                    placeholder="Optional note about this change"
                    value={statusNote}
                    onChange={e => setStatusNote(e.target.value)}
                    className="mb-2"
                  />
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(STATUS_LABELS) as ItemStatus[]).filter(s => s !== selected.status).map(s => {
                      const Icon = STATUS_ICONS[s];
                      return (
                        <Button
                          key={s}
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          disabled={updatingStatus}
                          onClick={() => handleStatusChange(selected, s)}
                        >
                          {updatingStatus ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
                          Mark {STATUS_LABELS[s]}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Complete history */}
              <div className="border-t border-border pt-3">
                <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5" /> Item History
                </p>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {historyFor(selected).map((h: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <Clock className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p>
                          <span className="font-medium">{STATUS_LABELS[h.status as ItemStatus] || h.status}</span>
                          {" "}by {h.changedByName} · {formatDateTime(toFirestoreDate(h.changedAt))}
                        </p>
                        {h.note && <p className="text-muted-foreground">{h.note}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
