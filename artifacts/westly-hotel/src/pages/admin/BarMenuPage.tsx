import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useDocument } from "@/hooks/useFirebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logAction } from "@/lib/audit";
import { formatCurrency, asArray } from "@/lib/utils";
import { DataError } from "@/components/ui/data-error";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import ImageUpload from "@/components/admin/ImageUpload";
import {
  Wine,
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

// ── Categories ────────────────────────────────────────────────────────────────
export const DRINK_CATEGORIES = [
  "beer",
  "wine",
  "spirits",
  "cocktails",
  "soft_drinks",
  "other",
] as const;

export type DrinkCategory = (typeof DRINK_CATEGORIES)[number];

export const DRINK_CATEGORY_LABELS: Record<DrinkCategory, string> = {
  beer: "Beer",
  wine: "Wine",
  spirits: "Spirits",
  cocktails: "Cocktails",
  soft_drinks: "Soft Drinks",
  other: "Other",
};

export interface DrinkItem {
  id: string;
  name: string;
  image: string;
  description: string;
  price: number;
  category: DrinkCategory;
  available: boolean;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

type ItemDraft = Omit<DrinkItem, "id">;

function emptyDraft(): ItemDraft {
  return {
    name: "",
    image: "",
    description: "",
    price: 0,
    category: "beer",
    available: true,
  };
}

export default function BarMenuPage() {
  const { adminUser, role } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  // ── Firestore doc: single source of truth read by the Bar New Sale (POS)
  // screen and the Bar Attendant dashboard ────────────────────────────────
  const { data: menuDoc, loading, error } = useDocument("cms_content", "bar_menu");
  const [items, setItems] = useState<DrinkItem[]>([]);

  const [filter, setFilter] = useState<"all" | DrinkCategory>("all");
  const [newItem, setNewItem] = useState<ItemDraft | null>(null);
  const [editingItem, setEditingItem] = useState<DrinkItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    label: string;
  } | null>(null);

  useEffect(() => {
    if (menuDoc) setItems(asArray<DrinkItem>((menuDoc as any).data));
  }, [menuDoc]);

  async function persist(updated: DrinkItem[]) {
    if (!adminUser) return;
    if (error) {
      toast({ title: "Can't save yet", description: "The drinks menu failed to load, so saving now could overwrite it with incomplete data. Reload the page first.", variant: "destructive" });
      throw new Error("menu not loaded");
    }
    setSaving(true);
    try {
      const ref = doc(db, "cms_content", "bar_menu");
      await setDoc(
        ref,
        { data: updated, updatedAt: serverTimestamp() },
        { merge: true }
      );
      await logAction(
        adminUser.id,
        adminUser.name,
        "bar_menu_updated",
        "cms_content",
        "bar_menu",
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

  function startAdd() {
    setNewItem(emptyDraft());
  }

  async function saveNew() {
    if (!newItem?.name.trim()) return;
    const updated = [...items, { id: uid(), ...newItem }];
    try {
      await persist(updated);
      setItems(updated);
      setNewItem(null);
      toast({ title: "Drink Added" });
    } catch {
      /* toast already shown */
    }
  }

  function startEdit(item: DrinkItem) {
    setEditingItem({ ...item });
  }

  async function saveEdit() {
    if (!editingItem?.name.trim()) return;
    const updated = items.map((i) => (i.id === editingItem.id ? editingItem : i));
    try {
      await persist(updated);
      setItems(updated);
      setEditingItem(null);
      toast({ title: "Drink Updated" });
    } catch {
      /* toast already shown */
    }
  }

  async function remove(id: string) {
    const updated = items.filter((i) => i.id !== id);
    try {
      await persist(updated);
      setItems(updated);
      setDeleteTarget(null);
      toast({ title: "Drink Deleted" });
    } catch {
      /* toast already shown */
    }
  }

  async function toggleAvailable(item: DrinkItem) {
    const updated = items.map((i) =>
      i.id === item.id ? { ...i, available: !i.available } : i
    );
    try {
      await persist(updated);
      setItems(updated);
    } catch {
      /* toast already shown */
    }
  }

  const filtered =
    filter === "all" ? items : items.filter((i) => i.category === filter);

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="font-serif text-2xl font-bold flex items-center gap-2">
          <Wine className="w-6 h-6" /> Drinks Menu
        </h1>
        <p className="text-muted-foreground text-sm">
          Manage the bar's drinks list — everything here appears on the Bar
          New Sale (POS) screen immediately.
        </p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading drinks menu…
        </div>
      )}
      {error && (
        <DataError message="The drinks menu failed to load. Reload before adding or editing items." />
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filter === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
          >
            All
          </button>
          {DRINK_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filter === cat ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
            >
              {DRINK_CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
        <Button size="sm" className="gap-1.5" onClick={startAdd} disabled={!!newItem}>
          <Plus className="w-4 h-4" /> Add Drink
        </Button>
      </div>

      {/* Add new item form */}
      {newItem && (
        <Card className="border-primary/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">New Drink</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input
                  value={newItem.name}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                  placeholder="e.g. Heineken"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Category *</Label>
                <Select
                  value={newItem.category}
                  onValueChange={(v) => setNewItem({ ...newItem, category: v as DrinkCategory })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DRINK_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {DRINK_CATEGORY_LABELS[cat]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Image</Label>
              <ImageUpload
                value={newItem.image}
                onChange={(url) => setNewItem({ ...newItem, image: url })}
                folder="bar-menu"
                label="drink photo"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={newItem.description}
                onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                placeholder="Optional tasting notes, ABV, size…"
              />
            </div>
            <div className="grid grid-cols-2 gap-3 items-end">
              <div className="space-y-1.5">
                <Label>Price (₦) *</Label>
                <Input
                  type="number"
                  min={0}
                  value={newItem.price}
                  onChange={(e) => setNewItem({ ...newItem, price: Number(e.target.value) })}
                />
              </div>
              <div className="flex items-center gap-2 pb-2">
                <Switch
                  checked={newItem.available}
                  onCheckedChange={(v) => setNewItem({ ...newItem, available: v })}
                />
                <Label className="cursor-pointer">
                  {newItem.available ? "Available" : "Unavailable"}
                </Label>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={saveNew} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                Save Drink
              </Button>
              <Button size="sm" variant="outline" onClick={() => setNewItem(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading drinks menu…
          </CardContent>
        </Card>
      ) : filtered.length === 0 && !newItem ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            No drinks {filter !== "all" ? `in ${DRINK_CATEGORY_LABELS[filter]}` : ""}{" "}
            yet. Add your first one above.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <Card key={item.id}>
              <CardContent className="p-4">
                {editingItem?.id === item.id ? (
                  // ── Edit form ──────────────────────────────────────────
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Name *</Label>
                        <Input
                          value={editingItem.name}
                          onChange={(e) =>
                            setEditingItem({ ...editingItem, name: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Category *</Label>
                        <Select
                          value={editingItem.category}
                          onValueChange={(v) =>
                            setEditingItem({
                              ...editingItem,
                              category: v as DrinkCategory,
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DRINK_CATEGORIES.map((cat) => (
                              <SelectItem key={cat} value={cat}>
                                {DRINK_CATEGORY_LABELS[cat]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Image</Label>
                      <ImageUpload
                        value={editingItem.image}
                        onChange={(url) => setEditingItem({ ...editingItem, image: url })}
                        folder="bar-menu"
                        label="drink photo"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Description</Label>
                      <Textarea
                        value={editingItem.description}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            description: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3 items-end">
                      <div className="space-y-1.5">
                        <Label>Price (₦) *</Label>
                        <Input
                          type="number"
                          min={0}
                          value={editingItem.price}
                          onChange={(e) =>
                            setEditingItem({
                              ...editingItem,
                              price: Number(e.target.value),
                            })
                          }
                        />
                      </div>
                      <div className="flex items-center gap-2 pb-2">
                        <Switch
                          checked={editingItem.available}
                          onCheckedChange={(v) =>
                            setEditingItem({ ...editingItem, available: v })
                          }
                        />
                        <Label className="cursor-pointer">
                          {editingItem.available ? "Available" : "Unavailable"}
                        </Label>
                      </div>
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
                        onClick={() => setEditingItem(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  // ── Display row ────────────────────────────────────────
                  <div className="flex items-start gap-3">
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm text-foreground">
                          {item.name}
                        </p>
                        <Badge variant="outline" className="text-[10px]">
                          {DRINK_CATEGORY_LABELS[item.category]}
                        </Badge>
                        {!item.available && (
                          <Badge
                            variant="outline"
                            className="text-[10px] border-destructive/40 text-destructive"
                          >
                            Unavailable
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                        {item.description}
                      </p>
                      <p className="font-bold text-sm mt-1 text-primary">
                        {formatCurrency(item.price)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <Switch
                        checked={item.available}
                        onCheckedChange={() => toggleAvailable(item)}
                        title="Toggle availability"
                      />
                      <div className="flex gap-1.5">
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
            <AlertDialogTitle>Delete Drink?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "
              <strong>{deleteTarget?.label}</strong>"? This will remove it
              from the Bar New Sale screen immediately.
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
