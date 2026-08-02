import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useDocument } from "@/hooks/useFirebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logAction } from "@/lib/audit";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import ImageUpload from "@/components/admin/ImageUpload";
import { asArray } from "@/lib/utils";
import { DataError } from "@/components/ui/data-error";
import {
  Images,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  CheckCircle,
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

const MAX_ITEMS = 100;

interface GalleryItem {
  id: string;
  title: string;
  caption: string;
  imageUrl: string;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export default function GalleryManagementPage() {
  const { adminUser, role } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const { data: galleryDoc, loading, error } = useDocument("cms_content", "gallery");
  const [items, setItems] = useState<GalleryItem[]>([]);

  const [newItem, setNewItem] = useState<Omit<GalleryItem, "id"> | null>(null);
  const [editingItem, setEditingItem] = useState<GalleryItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);

  useEffect(() => {
    if (galleryDoc) {
      const raw = asArray<GalleryItem>((galleryDoc as any).data);
      // Guard against malformed/null entries in the stored data (asArray only
      // guarantees the container is an array, not that every entry is valid).
      setItems(
        raw.filter(
          (g): g is GalleryItem =>
            !!g &&
            typeof g === "object" &&
            typeof g.id === "string" &&
            typeof g.title === "string"
        )
      );
    }
  }, [galleryDoc]);

  async function persist(updated: GalleryItem[]) {
    if (!adminUser) return;
    if (error) {
      toast({
        title: "Can't save yet",
        description:
          "The gallery failed to load, so saving now could overwrite it with incomplete data. Reload the page first.",
        variant: "destructive",
      });
      throw new Error("gallery not loaded");
    }
    setSaving(true);
    try {
      const ref = doc(db, "cms_content", "gallery");
      await setDoc(ref, { data: updated, updatedAt: serverTimestamp() }, { merge: true });
      await logAction(
        adminUser.id,
        adminUser.name,
        "gallery_updated",
        "cms_content",
        "gallery",
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

  const atLimit = items.length >= MAX_ITEMS;

  function startAdd() {
    if (atLimit) return;
    setNewItem({ title: "", caption: "", imageUrl: "" });
  }

  async function saveNew() {
    if (!newItem?.title.trim() || !newItem.imageUrl.trim()) return;
    if (atLimit) return;
    const updated = [...items, { id: uid(), ...newItem, title: newItem.title.trim(), caption: newItem.caption.trim() }];
    try {
      await persist(updated);
      setItems(updated);
      setNewItem(null);
      toast({ title: "Image Added" });
    } catch {
      /* toast already shown */
    }
  }

  function startEdit(item: GalleryItem) {
    setEditingItem({ ...item });
  }

  async function saveEdit() {
    if (!editingItem?.title.trim() || !editingItem.imageUrl.trim()) return;
    const cleaned = { ...editingItem, title: editingItem.title.trim(), caption: editingItem.caption.trim() };
    const updated = items.map((g) => (g.id === cleaned.id ? cleaned : g));
    try {
      await persist(updated);
      setItems(updated);
      setEditingItem(null);
      toast({ title: "Image Updated" });
    } catch {
      /* toast already shown */
    }
  }

  async function remove(id: string) {
    const updated = items.filter((g) => g.id !== id);
    try {
      await persist(updated);
      setItems(updated);
      setDeleteTarget(null);
      toast({ title: "Image Deleted" });
    } catch {
      /* toast already shown */
    }
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="font-serif text-2xl font-bold flex items-center gap-2">
          <Images className="w-6 h-6" /> Gallery Management
        </h1>
        <p className="text-muted-foreground text-sm">
          Manage the photos shown on the public Gallery page — every change here
          goes live on the website immediately.
        </p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading gallery…
        </div>
      )}
      {error && (
        <DataError message="Gallery failed to load. Reload before adding or editing." />
      )}

      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-base">
          Photos{" "}
          <span className="text-muted-foreground font-normal text-sm">
            ({items.length}/{MAX_ITEMS})
          </span>
        </h2>
        {!newItem && !editingItem && (
          <Button size="sm" onClick={startAdd} disabled={atLimit} className="gap-1.5">
            <Plus className="w-4 h-4" /> Add Image
          </Button>
        )}
      </div>

      {atLimit && !newItem && (
        <p className="text-xs text-muted-foreground">
          You've reached the maximum of {MAX_ITEMS} images. Delete one to add another.
        </p>
      )}

      {/* Add form */}
      {newItem && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input
                value={newItem.title}
                onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
                placeholder="Poolside at sunset"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Image *</Label>
              <ImageUpload
                value={newItem.imageUrl}
                onChange={(url) => setNewItem({ ...newItem, imageUrl: url })}
                folder="gallery"
                label="gallery image"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description / Caption</Label>
              <Textarea
                value={newItem.caption}
                onChange={(e) => setNewItem({ ...newItem, caption: e.target.value })}
                placeholder="Optional caption shown on the public gallery…"
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={saveNew}
                disabled={saving || !newItem.title.trim() || !newItem.imageUrl.trim()}
                className="gap-1.5"
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle className="w-3.5 h-3.5" />
                )}
                Save
              </Button>
              <Button size="sm" variant="outline" onClick={() => setNewItem(null)}>
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
            <Loader2 className="w-4 h-4 animate-spin" /> Loading gallery…
          </CardContent>
        </Card>
      ) : items.length === 0 && !newItem ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            No gallery images yet. Add your first one above.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id}>
              <CardContent className="p-4">
                {editingItem?.id === item.id ? (
                  // ── Edit form ──────────────────────────────────────────
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>Title *</Label>
                      <Input
                        value={editingItem.title}
                        onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Image *</Label>
                      <ImageUpload
                        value={editingItem.imageUrl}
                        onChange={(url) => setEditingItem({ ...editingItem, imageUrl: url })}
                        folder="gallery"
                        label="gallery image"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Description / Caption</Label>
                      <Textarea
                        value={editingItem.caption}
                        onChange={(e) => setEditingItem({ ...editingItem, caption: e.target.value })}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveEdit} disabled={saving} className="gap-1.5">
                        {saving ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CheckCircle className="w-3.5 h-3.5" />
                        )}
                        Save Changes
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingItem(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  // ── Display row ────────────────────────────────────────
                  <div className="flex items-start gap-3">
                    <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted shrink-0 flex items-center justify-center">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
                      ) : (
                        <ImageOff className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground">{item.title}</p>
                      {item.caption && (
                        <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{item.caption}</p>
                      )}
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
                        onClick={() => setDeleteTarget({ id: item.id, label: item.title })}
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
            <AlertDialogTitle>Delete Image?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "<strong>{deleteTarget?.label}</strong>"? This will
              remove it from the public website immediately.
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
