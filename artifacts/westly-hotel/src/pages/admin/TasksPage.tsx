import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCollection } from "@/hooks/useFirebase";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logAction } from "@/lib/audit";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ClipboardList, Plus, Search, Loader2, Clock, AlertTriangle,
  CheckCircle2, RefreshCw, User,
} from "lucide-react";
import { toFirestoreDate, formatDateTime } from "@/lib/utils";
import { DataError } from "@/components/ui/data-error";
import TaskAssignDialog, { TASK_TYPE_LABELS, type TaskType } from "@/components/admin/TaskAssignDialog";

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-slate-100 text-slate-700 dark:bg-slate-800/40 dark:text-slate-300",
  medium: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  urgent: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-slate-100 text-slate-700 dark:bg-slate-800/40 dark:text-slate-300",
  accepted: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  in_progress: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  accepted: "Accepted",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default function TasksPage() {
  const { adminUser, role } = useAuth();
  const { toast } = useToast();
  const { data: tasks, loading, error } = useCollection<any>("tasks");

  const [showAssign, setShowAssign] = useState(false);
  const [reassignTarget, setReassignTarget] = useState<{ id: string; title: string } | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [typeFilter, setTypeFilter] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const now = new Date();
    return tasks.filter((t: any) => {
      if (t.isDeleted) return false;
      const matchSearch = !search || t.title?.toLowerCase().includes(search.toLowerCase()) || t.assignedToNames?.some((n: string) => n.toLowerCase().includes(search.toLowerCase()));
      const matchType = typeFilter === "all" || t.type === typeFilter;
      const matchStatus = statusFilter === "all"
        || (statusFilter === "active" && !["completed", "cancelled"].includes(t.status))
        || t.status === statusFilter;
      return matchSearch && matchType && matchStatus;
    }).sort((a: any, b: any) => {
      // Overdue and urgent first, then newest first.
      const aOverdue = a.dueAt && toFirestoreDate(a.dueAt)! < now && !["completed", "cancelled"].includes(a.status);
      const bOverdue = b.dueAt && toFirestoreDate(b.dueAt)! < now && !["completed", "cancelled"].includes(b.status);
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
      return (toFirestoreDate(b.createdAt)?.getTime() ?? 0) - (toFirestoreDate(a.createdAt)?.getTime() ?? 0);
    });
  }, [tasks, search, statusFilter, typeFilter]);

  const isOverdue = (t: any) => t.dueAt && toFirestoreDate(t.dueAt)! < new Date() && !["completed", "cancelled"].includes(t.status);
  const activeCount = tasks.filter((t: any) => !t.isDeleted && !["completed", "cancelled"].includes(t.status)).length;
  const overdueCount = tasks.filter((t: any) => !t.isDeleted && isOverdue(t)).length;
  const completedTodayCount = tasks.filter((t: any) => {
    if (t.status !== "completed") return false;
    const d = toFirestoreDate(t.completedAt);
    return d && d.toDateString() === new Date().toDateString();
  }).length;

  const cancelTask = async (task: any) => {
    if (!adminUser) return;
    setBusyId(task.id);
    try {
      await updateDoc(doc(db, "tasks", task.id), { status: "cancelled", updatedAt: serverTimestamp() });
      await logAction(adminUser.id, adminUser.name, "task_cancelled", "tasks", task.id, { status: task.status }, { status: "cancelled" }, role ?? undefined);
      toast({ title: "Task Cancelled" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setBusyId(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold flex items-center gap-2"><ClipboardList className="w-6 h-6" /> Task Assignment</h1>
          <p className="text-muted-foreground text-sm">Coordinate daily operations across every department.</p>
        </div>
        <Button className="gap-2" onClick={() => setShowAssign(true)}><Plus className="w-4 h-4" /> Assign Task</Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-3 text-center"><p className="text-xl font-bold text-blue-600">{activeCount}</p><p className="text-[10px] text-muted-foreground mt-0.5">Active Tasks</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-xl font-bold text-red-600">{overdueCount}</p><p className="text-[10px] text-muted-foreground mt-0.5">Overdue</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-xl font-bold text-green-600">{completedTodayCount}</p><p className="text-[10px] text-muted-foreground mt-0.5">Completed Today</p></CardContent></Card>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search tasks or staff…" value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {Object.entries(TASK_TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : error ? (
        <DataError message="We couldn't load tasks." />
      ) : visible.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>No tasks found</p></div>
      ) : (
        <div className="space-y-3">
          {visible.map((t: any) => {
            const overdue = isOverdue(t);
            return (
              <Card key={t.id} className={overdue ? "border-red-300 dark:border-red-800" : ""}>
                <CardContent className="p-4 flex items-start gap-3 flex-wrap">
                  <div className="flex-1 min-w-[220px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{t.title}</p>
                      <Badge variant="outline" className="text-[10px]">{TASK_TYPE_LABELS[t.type as TaskType] ?? t.type}</Badge>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${PRIORITY_COLORS[t.priority]}`}>{t.priority}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_COLORS[t.status]}`}>{STATUS_LABELS[t.status] ?? t.status}</span>
                      {overdue && <span className="flex items-center gap-1 text-[11px] font-medium text-red-600"><AlertTriangle className="w-3 h-3" /> Overdue</span>}
                    </div>
                    {t.description && <p className="text-xs text-muted-foreground mt-1">{t.description}</p>}
                    {t.relatedLabel && <p className="text-xs text-muted-foreground mt-0.5">Related: {t.relatedLabel}</p>}
                    <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                      <User className="w-3 h-3 text-muted-foreground" />
                      {t.assignedToNames?.map((n: string) => <Badge key={n} variant="secondary" className="text-[10px]">{n}</Badge>)}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1.5">
                      Assigned by {t.assignedByName} · {formatDateTime(toFirestoreDate(t.createdAt))}
                      {t.dueAt && <> · Due {formatDateTime(toFirestoreDate(t.dueAt))}</>}
                      {t.acceptedByName && <> · Accepted by {t.acceptedByName}</>}
                      {t.status === "completed" && t.completedAt && <> · Completed {formatDateTime(toFirestoreDate(t.completedAt))}</>}
                    </p>
                  </div>
                  {!["completed", "cancelled"].includes(t.status) && (
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => setReassignTarget({ id: t.id, title: t.title })}>
                        <RefreshCw className="w-3 h-3" /> Reassign
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => cancelTask(t)} disabled={busyId === t.id}>
                        {busyId === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Cancel"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <TaskAssignDialog open={showAssign} onOpenChange={setShowAssign} />
      <TaskAssignDialog
        open={!!reassignTarget}
        onOpenChange={(o) => !o && setReassignTarget(null)}
        reassignTask={reassignTarget}
      />
    </div>
  );
}
