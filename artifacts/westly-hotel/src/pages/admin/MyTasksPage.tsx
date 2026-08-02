import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCollection } from "@/hooks/useFirebase";
import { where, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logAction } from "@/lib/audit";
import { notifyTaskCompleted } from "@/lib/notifications";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, Loader2, AlertTriangle, CheckCircle2, PlayCircle, CalendarClock } from "lucide-react";
import { toFirestoreDate, formatDateTime } from "@/lib/utils";
import { DataError } from "@/components/ui/data-error";
import { TASK_TYPE_LABELS, type TaskType } from "@/components/admin/TaskAssignDialog";
import type { ShiftDoc } from "@/lib/shifts";
import { format } from "date-fns";

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-slate-100 text-slate-700 dark:bg-slate-800/40 dark:text-slate-300",
  medium: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  urgent: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

export default function MyTasksPage() {
  const { adminUser, role } = useAuth();
  const { toast } = useToast();
  const { data: tasks, loading, error } = useCollection<any>(
    "tasks",
    adminUser ? [where("assignedToIds", "array-contains", adminUser.id)] : []
  );
  const [busyId, setBusyId] = useState<string | null>(null);

  const todayKey = format(new Date(), "yyyy-MM-dd");
  const { data: myShifts, loading: loadingShifts } = useCollection<ShiftDoc>(
    "shifts",
    adminUser ? [where("staffId", "==", adminUser.id), where("date", ">=", todayKey)] : []
  );
  const upcomingShifts = useMemo(
    () => myShifts.filter(s => s.status !== "cancelled").sort((a, b) => a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)).slice(0, 8),
    [myShifts]
  );

  const active = useMemo(
    () => tasks.filter((t: any) => !t.isDeleted && !["completed", "cancelled"].includes(t.status))
      .sort((a: any, b: any) => (toFirestoreDate(a.createdAt)?.getTime() ?? 0) - (toFirestoreDate(b.createdAt)?.getTime() ?? 0)),
    [tasks]
  );
  const done = useMemo(
    () => tasks.filter((t: any) => ["completed", "cancelled"].includes(t.status))
      .sort((a: any, b: any) => (toFirestoreDate(b.completedAt ?? b.createdAt)?.getTime() ?? 0) - (toFirestoreDate(a.completedAt ?? a.createdAt)?.getTime() ?? 0))
      .slice(0, 20),
    [tasks]
  );

  const isOverdue = (t: any) => t.dueAt && toFirestoreDate(t.dueAt)! < new Date();

  const accept = async (t: any) => {
    if (!adminUser) return;
    setBusyId(t.id);
    try {
      await updateDoc(doc(db, "tasks", t.id), {
        status: "accepted", acceptedBy: adminUser.id, acceptedByName: adminUser.name, acceptedAt: serverTimestamp(),
      });
      await logAction(adminUser.id, adminUser.name, "task_accepted", "tasks", t.id, { status: t.status }, { status: "accepted" }, role ?? undefined);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setBusyId(null);
  };

  const startProgress = async (t: any) => {
    if (!adminUser) return;
    setBusyId(t.id);
    try {
      await updateDoc(doc(db, "tasks", t.id), { status: "in_progress" });
      await logAction(adminUser.id, adminUser.name, "task_started", "tasks", t.id, { status: t.status }, { status: "in_progress" }, role ?? undefined);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setBusyId(null);
  };

  const complete = async (t: any) => {
    if (!adminUser) return;
    setBusyId(t.id);
    try {
      await updateDoc(doc(db, "tasks", t.id), { status: "completed", completedAt: serverTimestamp() });
      await logAction(adminUser.id, adminUser.name, "task_completed", "tasks", t.id, { status: t.status }, { status: "completed" }, role ?? undefined);
      notifyTaskCompleted(t.title, adminUser.name, t.assignedBy ?? null).catch(() => {});
      toast({ title: "Task Completed", description: t.title });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setBusyId(null);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-2xl font-bold flex items-center gap-2"><ClipboardList className="w-6 h-6" /> My Tasks</h1>
        <p className="text-muted-foreground text-sm">{active.length} active task{active.length !== 1 ? "s" : ""} assigned to you</p>
      </div>

      {!loadingShifts && upcomingShifts.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h2 className="font-semibold text-sm flex items-center gap-2 mb-2"><CalendarClock className="w-4 h-4" /> My Upcoming Shifts</h2>
            <div className="space-y-1.5">
              {upcomingShifts.map(s => (
                <div key={s.id} className="flex items-center justify-between text-xs bg-muted/40 rounded-lg px-3 py-2">
                  <span>
                    <span className="font-medium">{s.date === todayKey ? "Today" : format(new Date(`${s.date}T00:00:00`), "EEE, MMM d")}</span>
                    {" · "}{s.label}
                  </span>
                  <span className="text-muted-foreground">{s.startTime}–{s.endTime}{s.endsNextDay ? " (+1 day)" : ""}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-40"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : error ? (
        <DataError message="We couldn't load your tasks." />
      ) : active.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="font-semibold text-lg">You're all caught up</h3>
          <p className="text-muted-foreground text-sm mt-1">No active tasks assigned to you right now.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {active.map((t: any) => {
            const overdue = isOverdue(t);
            return (
              <Card key={t.id} className={overdue ? "border-red-300 dark:border-red-800" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{t.title}</p>
                    <Badge variant="outline" className="text-[10px]">{TASK_TYPE_LABELS[t.type as TaskType] ?? t.type}</Badge>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${PRIORITY_COLORS[t.priority]}`}>{t.priority}</span>
                    {overdue && <span className="flex items-center gap-1 text-[11px] font-medium text-red-600"><AlertTriangle className="w-3 h-3" /> Overdue</span>}
                  </div>
                  {t.description && <p className="text-sm text-muted-foreground mt-1.5">{t.description}</p>}
                  {t.relatedLabel && <p className="text-xs text-muted-foreground mt-1">Related: {t.relatedLabel}</p>}
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Assigned by {t.assignedByName} · {formatDateTime(toFirestoreDate(t.createdAt))}
                    {t.dueAt && <> · Due {formatDateTime(toFirestoreDate(t.dueAt))}</>}
                  </p>
                  <div className="flex gap-2 mt-3">
                    {t.status === "pending" && (
                      <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => accept(t)} disabled={busyId === t.id}>
                        {busyId === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Accept
                      </Button>
                    )}
                    {t.status === "accepted" && (
                      <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => startProgress(t)} disabled={busyId === t.id}>
                        {busyId === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />} Start
                      </Button>
                    )}
                    {(t.status === "accepted" || t.status === "in_progress") && (
                      <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => complete(t)} disabled={busyId === t.id}>
                        {busyId === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Mark Complete
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {done.length > 0 && (
        <div className="pt-2">
          <h2 className="text-sm font-semibold text-muted-foreground mb-2">Recently Finished</h2>
          <div className="space-y-2">
            {done.map((t: any) => (
              <Card key={t.id} className="opacity-70">
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm">{t.title}</p>
                    <p className="text-[11px] text-muted-foreground">{TASK_TYPE_LABELS[t.type as TaskType] ?? t.type}</p>
                  </div>
                  <Badge variant={t.status === "completed" ? "default" : "destructive"} className="text-[10px] capitalize">{t.status}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
