import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCollection } from "@/hooks/useFirebase";
import { addDoc, collection, doc, updateDoc, serverTimestamp, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logAction, softDelete } from "@/lib/audit";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import ImageUploadMulti from "@/components/admin/ImageUploadMulti";
import { Landmark, Plus, Pencil, Trash2, Loader2, Users2, Ruler } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { DataError } from "@/components/ui/data-error";

const INITIAL_FORM = {
  name: "", description: "", size: "", capacity: "", price: "",
  amenities: "", available: true, images: [] as string[],
};

export default function VenuesAdminPage() {
  const { adminUser, role } = useAuth();
  const { toast } = useToast();
  const { data: venues, loading, error } = useCollection("venues", [where("isDeleted", "!=", true)]);

  const [showDialog, setShowDialog] = useState(false);
  const [editVenue, setEditVenue] = useState<any>(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [filterAvailability, setFilterAvailability] = useState<"all" | "available" | "unavailable">("all");

  const filtered = venues.filter((v: any) =>
    filterAvailability === "all" ||
    (filterAvailability === "available" ? v.available !== false : v.available === false)
  );

  // Only the Super Admin manages venues.
  const canEdit = role === "super_admin";

  const openAdd = () => {
    setEditVenue(null);
    setForm(INITIAL_FORM);
    setShowDialog(true);
  };

  const openEdit = (venue: any) => {
    setEditVenue(venue);
    setForm({
      name: venue.name || "",
      description: venue.description || "",
      size: venue.size || "",
      capacity: String(venue.capacity || ""),
      price: venue.price != null ? String(venue.price) : "",
      amenities: (venue.amenities || []).join(", "),
      available: venue.available !== false,
      images: venue.images || [],
    });
    setShowDialog(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminUser) return;
    if (!form.name.trim()) {
      toast({ title: "Name required", description: "Please give the venue a name.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        name: form.name.trim(),
        description: form.description.trim(),
        size: form.size.trim(),
        capacity: form.capacity ? parseInt(form.capacity) : null,
        // Pricing is optional — some venues are quote-on-request.
        price: form.price.trim() ? parseFloat(form.price) : null,
        amenities: form.amenities.split(",").map(a => a.trim()).filter(Boolean),
        available: form.available,
        images: form.images,
        updatedAt: serverTimestamp(),
      };

      if (editVenue) {
        await updateDoc(doc(db, "venues", editVenue.id), payload);
        await logAction(adminUser.id, adminUser.name, "venue_updated", "venues", editVenue.id, null, payload, role ?? undefined);
        toast({ title: "Venue Updated" });
      } else {
        const ref = await addDoc(collection(db, "venues"), { ...payload, isDeleted: false, createdAt: serverTimestamp() });
        await logAction(adminUser.id, adminUser.name, "venue_created", "venues", ref.id, null, payload, role ?? undefined);
        toast({ title: "Venue Added" });
      }
      setShowDialog(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const handleDelete = async (venue: any) => {
    if (!adminUser || !confirm(`Delete "${venue.name}"? This will remove it from the public website. This action cannot be undone.`)) return;
    setDeletingId(venue.id);
    try {
      await softDelete("venues", venue.id, adminUser.id, adminUser.name, "Deleted from admin panel", role ?? undefined);
      toast({ title: "Venue Deleted" });
    } catch (err: any) {
      toast({ title: "Delete Failed", description: err.message, variant: "destructive" });
    }
    setDeletingId(null);
  };

  const toggleAvailable = async (venue: any) => {
    if (!adminUser) return;
    try {
      await updateDoc(doc(db, "venues", venue.id), { available: !venue.available, updatedAt: serverTimestamp() });
      await logAction(adminUser.id, adminUser.name, `venue_availability:${venue.available}→${!venue.available}`, "venues", venue.id, { available: venue.available }, { available: !venue.available }, role ?? undefined);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold flex items-center gap-2">
            <Landmark className="w-6 h-6" /> Venues
          </h1>
          <p className="text-muted-foreground text-sm">{venues.length} venue{venues.length !== 1 ? "s" : ""} total — shown on the public Venues page</p>
        </div>
        {canEdit && (
          <Button className="gap-2" onClick={openAdd}>
            <Plus className="w-4 h-4" /> Add Venue
          </Button>
        )}
      </div>

      {!canEdit && (
        <p className="text-sm text-muted-foreground bg-muted rounded-lg p-3">
          Venues are managed by the Super Admin. You can view them here, but editing is restricted.
        </p>
      )}

      {/* Availability filter */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "available", "unavailable"] as const).map(s => {
          const count = s === "all" ? venues.length : venues.filter((v: any) => (s === "available" ? v.available !== false : v.available === false)).length;
          return (
            <button key={s} onClick={() => setFilterAvailability(s)}
              className={cn("px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors",
                filterAvailability === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}>
              {s === "all" ? "All" : s} ({count})
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <DataError message="We couldn't load venues." />
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Landmark className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p>No venues found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((venue: any) => (
            <Card key={venue.id} className="overflow-hidden">
              {venue.images?.[0] && (
                <img src={venue.images[0]} alt={venue.name} className="w-full h-36 object-cover" />
              )}
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2 gap-2">
                  <h3 className="font-bold">{venue.name}</h3>
                  <span className={cn("shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium",
                    venue.available !== false ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                  )}>
                    {venue.available !== false ? "Available" : "Unavailable"}
                  </span>
                </div>
                {venue.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{venue.description}</p>
                )}
                <div className="flex justify-between text-sm mb-3">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Ruler className="w-3.5 h-3.5" /> {venue.size || "—"}
                  </span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Users2 className="w-3.5 h-3.5" /> {venue.capacity ? `${venue.capacity} guests` : "—"}
                  </span>
                </div>
                {venue.price != null && (
                  <p className="font-bold text-sm text-primary mb-2">{formatCurrency(venue.price)}</p>
                )}
                {venue.amenities?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {venue.amenities.slice(0, 4).map((a: string) => (
                      <Badge key={a} variant="secondary" className="text-[10px]">{a}</Badge>
                    ))}
                    {venue.amenities.length > 4 && <Badge variant="secondary" className="text-[10px]">+{venue.amenities.length - 4}</Badge>}
                  </div>
                )}
                {canEdit && (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 flex-1">
                      <Switch checked={venue.available !== false} onCheckedChange={() => toggleAvailable(venue)} />
                      <Label className="text-xs cursor-pointer" onClick={() => toggleAvailable(venue)}>Available</Label>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openEdit(venue)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => handleDelete(venue)} disabled={deletingId === venue.id}>
                      {deletingId === venue.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
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
            <DialogTitle>{editVenue ? "Edit Venue" : "Add New Venue"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <Label>Venue Name *</Label>
              <Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Grand Ballroom" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Describe the venue — layout, ambience, ideal use cases…" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Size</Label>
                <Input value={form.size} onChange={e => setForm({ ...form, size: e.target.value })} placeholder="e.g. 450 sqm" />
              </div>
              <div className="space-y-1.5">
                <Label>Guest Capacity</Label>
                <Input type="number" min="1" value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} placeholder="200" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Price (₦, optional)</Label>
              <Input type="number" min="0" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder="Leave blank for 'Contact for pricing'" />
            </div>
            <div className="space-y-1.5">
              <Label>Venue Images</Label>
              <ImageUploadMulti
                values={form.images}
                onChange={(images) => setForm(f => ({ ...f, images }))}
                folder="venues"
                label="venue images"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Amenities (comma-separated)</Label>
              <Input value={form.amenities} onChange={e => setForm({ ...form, amenities: e.target.value })} placeholder="Stage, AV Equipment, Catering, Parking" />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Switch checked={form.available} onCheckedChange={(v) => setForm({ ...form, available: v })} />
              <Label className="cursor-pointer">{form.available ? "Available for booking" : "Unavailable"}</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={saving} className="gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editVenue ? "Save Changes" : "Add Venue"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
