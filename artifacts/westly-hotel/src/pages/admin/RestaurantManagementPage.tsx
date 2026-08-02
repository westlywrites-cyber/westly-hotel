import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import MenuQrCodesCard from "@/components/admin/MenuQrCodesCard";
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
  Utensils,
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
export const MENU_CATEGORIES = [
  "breakfast",
  "lunch",
  "dinner",
  "drinks",
  "desserts",
] as const;

export type MenuCategory = (typeof MENU_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<MenuCategory, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  drinks: "Drinks",
  desserts: "Desserts",
};

export interface MenuItem {
  id: string;
  name: string;
  image: string;
  description: string;
  price: number;
  category: MenuCategory;
  available: boolean;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

type ItemDraft = Omit<MenuItem, "id">;

function emptyDraft(): ItemDraft {
  return {
    name: "",
    image: "",
    description: "",
    price: 0,
    category: "breakfast",
    available: true,
  };
}

export default function RestaurantManagementPage() {
  const { adminUser, role } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  // ── Firestore doc: single source of truth read by the public Restaurant
  // page AND the admin New Order (POS) screen ─────────────────────────────────
  const { data: menuDoc, loading, error } = useDocument("cms_content", "restaurant_menu");
  const [items, setItems] = useState<MenuItem[]>([]);

  const [filter, setFilter] = useState<"all" | MenuCategory>("all");
  const [newItem, setNewItem] = useState<ItemDraft | null>(null);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    label: string;
  } | null>(null);

  useEffect(() => {
    if (menuDoc) setItems(asArray<MenuItem>((menuDoc as any).data));
  }, [menuDoc]);

  async function persist(updated: MenuItem[]) {
    if (!adminUser) return;
    if (error) {
      toast({ title: "Can't save yet", description: "The menu failed to load, so saving now could overwrite it with incomplete data. Reload the page first.", variant: "destructive" });
      throw new Error("menu not loaded");
    }
    setSaving(true);
    try {
      const ref = doc(db, "cms_content", "restaurant_menu");
      await setDoc(
        ref,
        { data: updated, updatedAt: serverTimestamp() },
        { merge: true }
      );
      await logAction(
        adminUser.id,
        adminUser.name,
        "restaurant_menu_updated",
        "cms_content",
        "restaurant_menu",
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
      toast({ title: "Item Added" });
    } catch {
      /* toast already shown */
    }
  }

  function startEdit(item: MenuItem) {
    setEditingItem({ ...item });
  }

  async function saveEdit() {
    if (!editingItem?.name.trim()) return;
    const updated = items.map((i) => (i.id === editingItem.id ? editingItem : i));
    try {
      await persist(updated);
      setItems(updated);
      setEditingItem(null);
      toast({ title: "Item Updated" });
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
      toast({ title: "Item Deleted" });
    } catch {
      /* toast already shown */
    }
  }

  async function toggleAvailable(item: MenuItem) {
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
          <Utensils className="w-6 h-6" /> Restaurant Management
        </h1>
        <p className="text-muted-foreground text-sm">
          Manage food & drink items — everything here appears on the public
          Restaurant page and the front-desk order screen immediately.
        </p>
      </div>

      <MenuQrCodesCard />

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading menu…
        </div>
      )}
      {error && (
        <DataError message="The menu failed to load. Reload before adding or editing items." />
      )}

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFilter("all")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            filter === "all"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          All ({items.length})
        </button>
        {MENU_CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === cat
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {CATEGORY_LABELS[cat]} ({items.filter((i) => i.category === cat).length})
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-base">
          Menu Items{" "}
          <span className="text-muted-foreground font-normal text-sm">
            ({filtered.length})
          </span>
        </h2>
        {!newItem && !editingItem && (
          <Button size="sm" onClick={startAdd} className="gap-1.5">
            <Plus className="w-4 h-4" /> Add Item
          </Button>
        )}
      </div>

      {/* Add new item form */}
      {newItem && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-sm">New Menu Item</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input
                  value={newItem.name}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                  placeholder="Grilled Salmon"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Category *</Label>
                <Select
                  value={newItem.category}
                  onValueChange={(v) =>
                    setNewItem({ ...newItem, category: v as MenuCategory })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MENU_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {CATEGORY_LABELS[cat]}
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
                folder="restaurant-menu"
                label="dish photo"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={newItem.description}
                onChange={(e) =>
                  setNewItem({ ...newItem, description: e.target.value })
                }
                placeholder="Describe the dish…"
              />
            </div>
            <div className="grid grid-cols-2 gap-3 items-end">
              <div className="space-y-1.5">
                <Label>Price (₦) *</Label>
                <Input
                  type="number"
                  min={0}
                  value={newItem.price}
                  onChange={(e) =>
                    setNewItem({ ...newItem, price: Number(e.target.value) })
                  }
                  placeholder="0"
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
              <Button
                size="sm"
                onClick={saveNew}
                disabled={saving || !newItem.name.trim() || newItem.price < 0}
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
            <Loader2 className="w-4 h-4 animate-spin" /> Loading menu…
          </CardContent>
        </Card>
      ) : filtered.length === 0 && !newItem ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            No menu items {filter !== "all" ? `in ${CATEGORY_LABELS[filter]}` : ""}{" "}
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
                              category: v as MenuCategory,
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MENU_CATEGORIES.map((cat) => (
                              <SelectItem key={cat} value={cat}>
                                {CATEGORY_LABELS[cat]}
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
                        folder="restaurant-menu"
                        label="dish photo"
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
                          {CATEGORY_LABELS[item.category]}
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
            <AlertDialogTitle>Delete Menu Item?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "
              <strong>{deleteTarget?.label}</strong>"? This will remove it
              from the public website and order screen immediately.
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
