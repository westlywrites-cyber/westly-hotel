import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCollection } from "@/hooks/useFirebase";
import { where } from "firebase/firestore";
import { addDoc, updateDoc, doc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logAction } from "@/lib/audit";
import { notifyTaskAssigned, notifyTaskReassigned } from "@/lib/notifications";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search } from "lucide-react";
import { ROLE_LABELS, type Role } from "@/lib/rbac";

export const TASK_TYPES = [
  "booking",
  "housekeeping",
  "laundry",
  "food_order",
  "drink_order",
  "maintenance",
  "guest_request",
  "security",
  "transport",
  "other",
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  booking: "Room Booking",
  housekeeping: "Housekeeping",
  laundry: "Laundry",
  food_order: "Food Order",
  drink_order: "Drink Order",
  maintenance: "Maintenance",
  guest_request: "Guest Request",
  security: "Security",
  transport: "Transport / Driver",
  other: "Other",
};

// Which staff roles are typically relevant for each task type — used only
// to pre-filter the staff picker as a convenience, not to restrict it.
const TASK_TYPE_DEFAULT_ROLES: Record<TaskType, Role[]> = {
  booking: ["receptionist"],
  housekeeping: ["housekeeping"],
  laundry: ["laundry_valet"],
  food_order: ["waiter", "restaurant_attendant", "staff"],
  drink_order: ["bar_attendant"],
  maintenance: ["maintenance_technician", "housekeeping"],
  guest_request: ["receptionist", "staff"],
  security: ["security_guard"],
  transport: ["driver"],
  other: [],
};

export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

interface TaskAssignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-fill for quick actions, e.g. "assign this room to a housekeeper" from the dashboard. */
  defaults?: {
    type?: TaskType;
    title?: string;
    description?: string;
    relatedCollection?: string;
    relatedId?: string;
    relatedLabel?: string;
  };
  /** If set, this dialog reassigns an existing task instead of creating a new one. */
  reassignTask?: { id: string; title: string } | null;
  onDone?: () => void;
}

export default function TaskAssignDialog({ open, onOpenChange, defaults, reassignTask, onDone }: TaskAssignDialogProps) {
  const { adminUser } = useAuth();
  const { toast } = useToast();
  const { data: users } = useCollection<any>("users", [where("status", "==", "active")]);

  const [type, setType] = useState<TaskType>(defaults?.type ?? "other");
  const [title, setTitle] = useState(defaults?.title ?? "");
  const [description, setDescription] = useState(defaults?.description ?? "");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueTime, setDueTime] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [roleFilter, setRoleFilter] = useState<"suggested" | "all">("suggested");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setType(defaults?.type ?? "other");
      setTitle(defaults?.title ?? "");
      setDescription(defaults?.description ?? "");
      setPriority("medium");
      setDueTime("");
      setSelected([]);
      setRoleFilter("suggested");
      setSearch("");
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const staffPool = useMemo(() => {
    // Exclude super_admin/manager/operations_manager from the assignable
    // pool — tasks are assigned to front-line staff, not other managers.
    const excluded: Role[] = ["super_admin", "manager", "operations_manager", "accountant"];
    let pool = users.filter((u: any) => !excluded.includes(u.role));
    if (roleFilter === "suggested" && TASK_TYPE_DEFAULT_ROLES[type].length > 0) {
      pool = pool.filter((u: any) => TASK_TYPE_DEFAULT_ROLES[type].includes(u.role));
    }
    if (search.trim()) {
      pool = pool.filter((u: any) => u.name?.toLowerCase().includes(search.toLowerCase()));
    }
    return pool.sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));
  }, [users, roleFilter, type, search]);

  const toggleStaff = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSubmit = async () => {
    if (!adminUser) return;
    if (!reassignTask && !title.trim()) {
      toast({ title: "Missing title", description: "Give the task a short title.", variant: "destructive" });
      return;
    }
    if (selected.length === 0) {
      toast({ title: "No staff selected", description: "Select at least one staff member.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const selectedUsers = users.filter((u: any) => selected.includes(u.id));
      const assignedToNames = selectedUsers.map((u: any) => u.name);
      let dueAt: Date | null = null;
      if (dueTime) {
        const [h, m] = dueTime.split(":").map(Number);
        const d = new Date();
        d.setHours(h, m, 0, 0);
        dueAt = d;
      }

      if (reassignTask) {
        await updateDoc(doc(db, "tasks", reassignTask.id), {
          assignedToIds: selected,
          assignedToNames,
          status: "pending",
          acceptedBy: null,
          acceptedByName: null,
          acceptedAt: null,
          reassignedAt: serverTimestamp(),
          reassignedBy: adminUser.id,
          reassignedByName: adminUser.name,
        });
        await logAction(adminUser.id, adminUser.name, "task_reassigned", "tasks", reassignTask.id, null, { assignedToNames }, "operations_manager");
        notifyTaskReassigned(reassignTask.title, selected, adminUser.name).catch(() => {});
        toast({ title: "Task Reassigned", description: `Now assigned to ${assignedToNames.join(", ")}` });
      } else {
        const ref = await addDoc(collection(db, "tasks"), {
          title: title.trim(),
          type,
          description: description || null,
          priority,
          assignedToIds: selected,
          assignedToNames,
          assignedBy: adminUser.id,
          assignedByName: adminUser.name,
          dueAt,
          status: "pending",
          relatedCollection: defaults?.relatedCollection ?? null,
          relatedId: defaults?.relatedId ?? null,
          relatedLabel: defaults?.relatedLabel ?? null,
          acceptedBy: null,
          acceptedByName: null,
          acceptedAt: null,
          completedAt: null,
          createdAt: serverTimestamp(),
          isDeleted: false,
        });
        await logAction(adminUser.id, adminUser.name, "task_assigned", "tasks", ref.id, null, { title, assignedToNames }, "operations_manager");
        notifyTaskAssigned(title.trim(), selected, assignedToNames, adminUser.name, priority).catch(() => {});
        toast({ title: "Task Assigned", description: `${title} → ${assignedToNames.join(", ")}` });
      }
      onOpenChange(false);
      onDone?.();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{reassignTask ? `Reassign: ${reassignTask.title}` : "Assign New Task"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {!reassignTask && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Task Type</Label>
                  <Select value={type} onValueChange={v => { setType(v as TaskType); setSelected([]); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TASK_TYPES.map(t => <SelectItem key={t} value={t}>{TASK_TYPE_LABELS[t]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Priority</Label>
                  <Select value={priority} onValueChange={v => setPriority(v as TaskPriority)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TASK_PRIORITIES.map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Title *</Label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Clean Room 204 after checkout" />
              </div>
              <div className="space-y-1.5">
                <Label>Instructions / Notes</Label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional details for the assigned staff" rows={2} />
              </div>
              <div className="space-y-1.5">
                <Label>Due Time (optional, today)</Label>
                <Input type="time" value={dueTime} onChange={e => setDueTime(e.target.value)} className="w-40" />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Assign To *</Label>
              <div className="flex gap-1">
                <button type="button" onClick={() => setRoleFilter("suggested")} className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${roleFilter === "suggested" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>Suggested</button>
                <button type="button" onClick={() => setRoleFilter("all")} className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${roleFilter === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>All Staff</button>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search staff…" className="pl-8 h-8 text-sm" />
            </div>
            <div className="border border-border rounded-lg max-h-56 overflow-y-auto divide-y divide-border">
              {staffPool.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No matching staff found.</p>
              ) : staffPool.map((u: any) => (
                <label key={u.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-muted/40">
                  <Checkbox checked={selected.includes(u.id)} onCheckedChange={() => toggleStaff(u.id)} />
                  <span className="text-sm flex-1">{u.name}</span>
                  <Badge variant="outline" className="text-[10px]">{ROLE_LABELS[u.role as Role] ?? u.role}</Badge>
                </label>
              ))}
            </div>
            {selected.length > 0 && (
              <p className="text-xs text-muted-foreground">{selected.length} staff member{selected.length !== 1 ? "s" : ""} selected</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving} className="gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {reassignTask ? "Reassign" : "Assign Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
