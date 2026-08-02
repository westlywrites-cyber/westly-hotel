import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useDocument } from "@/hooks/useFirebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logAction } from "@/lib/audit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import ImageUpload from "@/components/admin/ImageUpload";
import { asArray } from "@/lib/utils";
import { DataError } from "@/components/ui/data-error";
import {
  Building2,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  CheckCircle,
  ArrowUp,
  ArrowDown,
  ImageOff,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const MAX_FACILITIES = 20;

interface Facility {
  id: string;
  name: string;
  image: string;
  description: string;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export default function FacilitiesManagementPage() {
  const { adminUser, role } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  // ── Firestore doc: same doc the public FacilitiesPage already reads ────────
  const { data: facilitiesDoc, loading, error } = useDocument("cms_content", "facilities");
  const [facilities, setFacilities] = useState<Facility[]>([]);

  const [newFacility, setNewFacility] = useState<Omit<Facility, "id"> | null>(
    null
  );
  const [editingFacility, setEditingFacility] = useState<Facility | null>(
    null
  );
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    label: string;
  } | null>(null);

  useEffect(() => {
    if (facilitiesDoc) {
      const raw = asArray<Facility>((facilitiesDoc as any).data);
      // Guard against malformed/null entries in the stored data (asArray only
      // guarantees the container is an array, not that every entry is a valid
      // Facility object) — without this, a single bad entry crashes the page.
      setFacilities(
        raw.filter(
          (f): f is Facility =>
            !!f &&
            typeof f === "object" &&
            typeof f.id === "string" &&
            typeof f.name === "string"
        )
      );
    }
  }, [facilitiesDoc]);

  // ── Persist the full ordered list back to Firestore ─────────────────────────
  async function persist(updated: Facility[]) {
    if (!adminUser) return;
    if (error) {
      toast({ title: "Can't save yet", description: "Facilities failed to load, so saving now could overwrite them with incomplete data. Reload the page first.", variant: "destructive" });
      throw new Error("facilities not loaded");
    }
    setSaving(true);
    try {
      const ref = doc(db, "cms_content", "facilities");
      await setDoc(
        ref,
        { data: updated, updatedAt: serverTimestamp() },
        { merge: true }
      );
      await logAction(
        adminUser.id,
        adminUser.name,
        "facilities_updated",
        "cms_content",
        "facilities",
        null,
        null,
        role ?? undefined
      );
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      throw err;
    } finally {
      setSaving(false);
    }
  }

  const atLimit = facilities.length >= MAX_FACILITIES;

  function startAdd() {
    if (atLimit) return;
    setNewFacility({ name: "", image: "", description: "" });
  }

  async function saveNew() {
    if (!newFacility?.name.trim() || !newFacility.description.trim()) return;
    if (atLimit) return;
    const updated = [...facilities, { id: uid(), ...newFacility }];
    try {
      await persist(updated);
      setFacilities(updated);
      setNewFacility(null);
      toast({ title: "Facility Added" });
    } catch {
      /* toast already shown */
    }
  }

  function startEdit(item: Facility) {
    setEditingFacility({ ...item });
  }

  async function saveEdit() {
    if (!editingFacility?.name.trim() || !editingFacility.description.trim())
      return;
    const updated = facilities.map((f) =>
      f.id === editingFacility.id ? editingFacility : f
    );
    try {
      await persist(updated);
      setFacilities(updated);
      setEditingFacility(null);
      toast({ title: "Facility Updated" });
    } catch {
      /* toast already shown */
    }
  }

  async function remove(id: string) {
    const updated = facilities.filter((f) => f.id !== id);
    try {
      await persist(updated);
      setFacilities(updated);
      setDeleteTarget(null);
      toast({ title: "Facility Deleted" });
    } catch {
      /* toast already shown */
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= facilities.length) return;
    const updated = [...facilities];
    [updated[index], updated[target]] = [updated[target], updated[index]];
    try {
      await persist(updated);
      setFacilities(updated);
    } catch {
      /* toast already shown */
    }
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="font-serif text-2xl font-bold flex items-center gap-2">
          <Building2 className="w-6 h-6" /> Facilities Management
        </h1>
        <p className="text-muted-foreground text-sm">
          Manage the amenities shown on the public Facilities page — every
          change here goes live on the website immediately.
        </p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading facilities…
        </div>
      )}
      {error && (
        <DataError message="Facilities failed to load. Reload before adding or editing." />
      )}

      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-base">
          Facilities{" "}
          <span className="text-muted-foreground font-normal text-sm">
            ({facilities.length}/{MAX_FACILITIES})
          </span>
        </h2>
        {!newFacility && !editingFacility && (
          <Button
            size="sm"
            onClick={startAdd}
            disabled={atLimit}
            className="gap-1.5"
          >
            <Plus className="w-4 h-4" /> Add Facility
          </Button>
        )}
      </div>

      {atLimit && !newFacility && (
        <p className="text-xs text-muted-foreground">
          You've reached the maximum of {MAX_FACILITIES} facilities. Delete
          one to add another.
        </p>
      )}

      {/* Add new facility form */}
      {newFacility && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-sm">New Facility</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input
                value={newFacility.name}
                onChange={(e) =>
                  setNewFacility({ ...newFacility, name: e.target.value })
                }
                placeholder="Infinity Pool"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Image</Label>
              <ImageUpload
                value={newFacility.image}
                onChange={(url) => setNewFacility({ ...newFacility, image: url })}
                folder="facilities"
                label="facility image"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description *</Label>
              <Textarea
                value={newFacility.description}
                onChange={(e) =>
                  setNewFacility({
                    ...newFacility,
                    description: e.target.value,
                  })
                }
                placeholder="Describe this facility for guests…"
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={saveNew}
                disabled={
                  saving || !newFacility.name.trim() || !newFacility.description.trim()
                }
                className="gap-1.5"
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle className="w-3.5 h-3.5" />
                )}
                Save
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setNewFacility(null)}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* List */}
      {loading ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading facilities…
          </CardContent>
        </Card>
      ) : facilities.length === 0 && !newFacility ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            No facilities yet. Add your first one above.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {facilities.map((item, idx) => (
            <Card key={item.id}>
              <CardContent className="p-4">
                {editingFacility?.id === item.id ? (
                  // ── Edit form ──────────────────────────────────────────
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>Name *</Label>
                      <Input
                        value={editingFacility.name}
                        onChange={(e) =>
                          setEditingFacility({
                            ...editingFacility,
                            name: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Image</Label>
                      <ImageUpload
                        value={editingFacility.image}
                        onChange={(url) => setEditingFacility({ ...editingFacility, image: url })}
                        folder="facilities"
                        label="facility image"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Description *</Label>
                      <Textarea
                        value={editingFacility.description}
                        onChange={(e) =>
                          setEditingFacility({
                            ...editingFacility,
                            description: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={saveEdit}
                        disabled={saving}
                        className="gap-1.5"
                      >
                        {saving ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CheckCircle className="w-3.5 h-3.5" />
                        )}
                        Save Changes
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingFacility(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  // ── Display row ────────────────────────────────────────
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col gap-0.5 shrink-0 pt-1">
                      <button
                        onClick={() => move(idx, -1)}
                        disabled={idx === 0 || saving}
                        className="p-0.5 rounded hover:bg-muted text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Move up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => move(idx, 1)}
                        disabled={idx === facilities.length - 1 || saving}
                        className="p-0.5 rounded hover:bg-muted text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Move down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted shrink-0 flex items-center justify-center">
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ImageOff className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground">
                        {item.name}
                      </p>
                      <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                        {item.description}
                      </p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        onClick={() => startEdit(item)}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() =>
                          setDeleteTarget({ id: item.id, label: item.name })
                        }
                        className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Facility?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "
              <strong>{deleteTarget?.label}</strong>"? This will remove it
              from the public website immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteTarget && remove(deleteTarget.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
