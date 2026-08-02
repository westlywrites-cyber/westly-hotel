import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCollection } from "@/hooks/useFirebase";
import { addDoc, collection, doc, updateDoc, serverTimestamp, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { updateRoomStatus } from "@/lib/roomLogic";
import { logAction } from "@/lib/audit";
import { softDelete } from "@/lib/audit";
import { notifyRoomStatusChange } from "@/lib/notifications";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import ImageUploadMulti from "@/components/admin/ImageUploadMulti";
import { BedDouble, Plus, Pencil, Trash2, CheckCircle, Loader2, Wrench } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import type { RoomStatus } from "@/lib/roomLogic";
import { DataError } from "@/components/ui/data-error";

const STATUS_COLORS: Record<RoomStatus, string> = {
  available: "bg-green-100 text-green-800",
  occupied: "bg-red-100 text-red-800",
  cleaning: "bg-yellow-100 text-yellow-800",
  reserved: "bg-blue-100 text-blue-800",
  maintenance: "bg-orange-100 text-orange-800",
  out_of_service: "bg-gray-100 text-gray-800",
};

const ROOM_TYPES = ["Standard Room", "Deluxe Room", "Junior Suite", "Executive Suite", "Presidential Suite"];

const INITIAL_FORM = {
  number: "", name: "", type: "Standard Room", price: "", capacity: "2", floor: "1",
  description: "", amenities: "", status: "available" as RoomStatus, images: [] as string[],
};

export default function RoomsAdminPage() {
  const { adminUser, role } = useAuth();
  const { toast } = useToast();
  const { data: rooms, loading, error } = useCollection("rooms", [where("isDeleted", "!=", true)]);

  const [showDialog, setShowDialog] = useState(false);
  const [editRoom, setEditRoom] = useState<any>(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("all");

  const filtered = rooms.filter((r: any) =>
    filterStatus === "all" || r.status === filterStatus
  );

  const canEdit = role === "super_admin";

  const openAdd = () => {
    setEditRoom(null);
    setForm(INITIAL_FORM);
    setShowDialog(true);
  };

  const openEdit = (room: any) => {
    setEditRoom(room);
    setForm({
      number: room.number || "",
      name: room.name || "",
      type: room.type || "Standard Room",
      price: String(room.price || ""),
      capacity: String(room.capacity || "2"),
      floor: String(room.floor || "1"),
      description: room.description || "",
      amenities: (room.amenities || []).join(", "),
      status: room.status || "available",
      images: room.images || [],
    });
    setShowDialog(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminUser) return;
    setSaving(true);
    try {
      const payload: any = {
        number: form.number,
        name: form.name.trim(),
        type: form.type,
        price: parseFloat(form.price),
        capacity: parseInt(form.capacity),
        floor: form.floor,
        description: form.description,
        amenities: form.amenities.split(",").map(a => a.trim()).filter(Boolean),
        status: form.status,
        images: form.images,
        updatedAt: serverTimestamp(),
      };

      if (editRoom) {
        await updateDoc(doc(db, "rooms", editRoom.id), payload);
        // Keep RTDB in sync
        if (editRoom.status !== form.status) {
          await updateRoomStatus(editRoom.id, form.status as RoomStatus);
        }
        await logAction(adminUser.id, adminUser.name, "room_updated", "rooms", editRoom.id, { status: editRoom.status }, payload, role ?? undefined);
        toast({ title: "Room Updated" });
      } else {
        const ref = await addDoc(collection(db, "rooms"), { ...payload, isDeleted: false, createdAt: serverTimestamp() });
        await logAction(adminUser.id, adminUser.name, "room_created", "rooms", ref.id, null, payload, role ?? undefined);
        toast({ title: "Room Added" });
      }
      setShowDialog(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const handleDelete = async (room: any) => {
    if (!adminUser || !confirm(`Delete Room ${room.number}? This action cannot be undone.`)) return;
    setDeletingId(room.id);
    try {
      await softDelete("rooms", room.id, adminUser.id, adminUser.name, "Deleted from admin panel", role ?? undefined);
      toast({ title: "Room Deleted" });
    } catch (err: any) {
      toast({ title: "Delete Failed", description: err.message, variant: "destructive" });
    }
    setDeletingId(null);
  };

  const handleStatusChange = async (room: any, newStatus: RoomStatus) => {
    if (!adminUser) return;
    try {
      await updateRoomStatus(room.id, newStatus);
      await logAction(adminUser.id, adminUser.name, `room_status:${room.status}→${newStatus}`, "rooms", room.id, { status: room.status }, { status: newStatus }, role ?? undefined);
      toast({ title: "Status Updated", description: `Room ${room.number} → ${newStatus}` });
      notifyRoomStatusChange(room.number, newStatus, adminUser.name).catch(() => {});
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold">Rooms</h1>
          <p className="text-muted-foreground text-sm">{rooms.length} rooms total</p>
        </div>
        {canEdit && (
          <Button className="gap-2" onClick={openAdd}>
            <Plus className="w-4 h-4" /> Add Room
          </Button>
        )}
      </div>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {["all", "available", "occupied", "cleaning", "maintenance", "reserved", "out_of_service"].map(s => {
          const count = s === "all" ? rooms.length : rooms.filter((r: any) => r.status === s).length;
          return (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={cn("px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors",
                filterStatus === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}>
              {s === "all" ? "All" : s.replace("_", " ")} ({count})
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <DataError message="We couldn't load rooms." />
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <BedDouble className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p>No rooms found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((room: any) => (
            <Card key={room.id} className="overflow-hidden">
              {room.images?.[0] && (
                <img src={room.images[0]} alt={room.type} className="w-full h-36 object-cover" />
              )}
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-bold">{room.name || room.type} <span className="font-normal text-muted-foreground">· Room {room.number}</span></h3>
                    <p className="text-xs text-muted-foreground">{room.type} · Floor {room.floor}</p>
                  </div>
                  <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-medium capitalize", STATUS_COLORS[room.status as RoomStatus])}>
                    {room.status?.replace("_", " ")}
                  </span>
                </div>
                <div className="flex justify-between text-sm mb-3">
                  <span className="font-bold text-primary">{formatCurrency(room.price)}<span className="text-xs text-muted-foreground font-normal">/night</span></span>
                  <span className="text-muted-foreground">{room.capacity} guests</span>
                </div>
                {room.amenities?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {room.amenities.slice(0, 4).map((a: string) => (
                      <Badge key={a} variant="secondary" className="text-[10px]">{a}</Badge>
                    ))}
                    {room.amenities.length > 4 && <Badge variant="secondary" className="text-[10px]">+{room.amenities.length - 4}</Badge>}
                  </div>
                )}
                {canEdit && (
                  <div className="flex gap-2">
                    <Select value={room.status} onValueChange={(v) => handleStatusChange(room, v as RoomStatus)}>
                      <SelectTrigger className="h-7 text-xs flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["available","occupied","cleaning","reserved","maintenance","out_of_service"].map(s => (
                          <SelectItem key={s} value={s} className="text-xs capitalize">{s.replace("_"," ")}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openEdit(room)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => handleDelete(room)} disabled={deletingId === room.id}>
                      {deletingId === room.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editRoom ? "Edit Room" : "Add New Room"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Room Number *</Label>
                <Input required value={form.number} onChange={e => setForm({...form, number: e.target.value})} placeholder="101" />
              </div>
              <div className="space-y-1.5">
                <Label>Floor</Label>
                <Input value={form.floor} onChange={e => setForm({...form, floor: e.target.value})} placeholder="1" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Room Type *</Label>
              <Select value={form.type} onValueChange={v => setForm({...form, type: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ROOM_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Room Name</Label>
              <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Ocean View Deluxe (optional — shown on the website instead of the room type)" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Price per Night (₦) *</Label>
                <Input required type="number" min="0" value={form.price} onChange={e => setForm({...form, price: e.target.value})} placeholder="45000" />
              </div>
              <div className="space-y-1.5">
                <Label>Capacity</Label>
                <Input type="number" min="1" value={form.capacity} onChange={e => setForm({...form, capacity: e.target.value})} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Room Images</Label>
              <ImageUploadMulti
                values={form.images}
                onChange={(images) => setForm(f => ({ ...f, images }))}
                folder="rooms"
                label="room images"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm({...form, status: v as RoomStatus})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["available","occupied","cleaning","reserved","maintenance","out_of_service"].map(s => (
                    <SelectItem key={s} value={s} className="capitalize">{s.replace("_"," ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Amenities (comma-separated)</Label>
              <Input value={form.amenities} onChange={e => setForm({...form, amenities: e.target.value})} placeholder="WiFi, TV, AC, Minibar" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Brief room description" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={saving} className="gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editRoom ? "Save Changes" : "Add Room"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
