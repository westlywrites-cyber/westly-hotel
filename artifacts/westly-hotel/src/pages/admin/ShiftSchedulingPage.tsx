import { useState, useMemo } from "react";
import { where } from "firebase/firestore";
import { useCollection } from "@/hooks/useFirebase";
import {
  addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval,
  format, isToday,
} from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CalendarClock, Plus, ChevronLeft, ChevronRight, Users, Clock, CircleDot,
} from "lucide-react";
import { ROLE_LABELS, SHIFT_ROLES, type Role } from "@/lib/rbac";
import { isOnDutyNow, type ShiftDoc } from "@/lib/shifts";
import { DataError } from "@/components/ui/data-error";
import ShiftFormDialog from "@/components/admin/ShiftFormDialog";

type ViewMode = "day" | "week" | "month";

export default function ShiftSchedulingPage() {
  const [role, setRole] = useState<Role>(SHIFT_ROLES[0]);
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogDefaultDate, setDialogDefaultDate] = useState<string | undefined>();
  const [editingShift, setEditingShift] = useState<ShiftDoc | null>(null);

  const { data: employees, loading: loadingEmployees } = useCollection<any>(
    "users", [where("role", "==", role), where("status", "==", "active")]
  );

  const range = useMemo(() => {
    if (viewMode === "day") return { start: anchor, end: anchor };
    if (viewMode === "week") return { start: startOfWeek(anchor), end: endOfWeek(anchor) };
    return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
  }, [viewMode, anchor]);

  // Widen the query range one day back so overnight shifts that started
  // "yesterday" (relative to the view window) still show up correctly.
  const queryStart = format(addDays(range.start, -1), "yyyy-MM-dd");
  const queryEnd = format(range.end, "yyyy-MM-dd");

  const { data: shiftsRaw, loading: loadingShifts, error } = useCollection<ShiftDoc>(
    "shifts",
    [where("role", "==", role), where("date", ">=", queryStart), where("date", "<=", queryEnd)]
  );

  const shifts = useMemo(() => shiftsRaw.filter(s => s.status !== "cancelled"), [shiftsRaw]);

  const days = useMemo(() => eachDayOfInterval({ start: range.start, end: range.end }), [range]);

  const shiftsByDay = useMemo(() => {
    const map = new Map<string, ShiftDoc[]>();
    for (const day of days) {
      const key = format(day, "yyyy-MM-dd");
      map.set(key, shifts.filter(s => s.date === key).sort((a, b) => a.startTime.localeCompare(b.startTime)));
    }
    return map;
  }, [days, shifts]);

  const onDutyNow = useMemo(() => {
    const now = new Date();
    return shifts.filter(s => isOnDutyNow(s, now));
  }, [shifts]);

  const seriesShiftsFor = (shift: ShiftDoc | null) =>
    shift?.seriesId ? shiftsRaw.filter(s => s.seriesId === shift.seriesId) : [];

  const navigate = (dir: 1 | -1) => {
    const amount = viewMode === "day" ? 1 : viewMode === "week" ? 7 : 30;
    setAnchor(prev => addDays(prev, dir * amount));
  };

  const openCreate = (date?: string) => {
    setEditingShift(null);
    setDialogDefaultDate(date ?? format(new Date(), "yyyy-MM-dd"));
    setDialogOpen(true);
  };

  const openEdit = (shift: ShiftDoc) => {
    setEditingShift(shift);
    setDialogOpen(true);
  };

  const rangeLabel = viewMode === "day"
    ? format(anchor, "EEEE, MMMM d, yyyy")
    : viewMode === "week"
    ? `${format(range.start, "MMM d")} – ${format(range.end, "MMM d, yyyy")}`
    : format(anchor, "MMMM yyyy");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold flex items-center gap-2"><CalendarClock className="w-6 h-6" /> Shift Scheduling</h1>
          <p className="text-muted-foreground text-sm">Build and manage rosters for every multi-staff role, in real time.</p>
        </div>
        <Button className="gap-2" onClick={() => openCreate()}><Plus className="w-4 h-4" /> Schedule Shift</Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Select value={role} onValueChange={v => setRole(v as Role)}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SHIFT_ROLES.map(r => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
          </SelectContent>
        </Select>

        <div className="flex bg-muted rounded-lg p-1">
          {(["day", "week", "month"] as ViewMode[]).map(v => (
            <button
              key={v} onClick={() => setViewMode(v)}
              className={`px-3 py-1 rounded-md text-xs font-medium capitalize ${viewMode === v ? "bg-background shadow text-foreground" : "text-muted-foreground"}`}
            >
              {v}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 ml-auto">
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => navigate(-1)}><ChevronLeft className="w-4 h-4" /></Button>
          <span className="text-sm font-medium min-w-[180px] text-center">{rangeLabel}</span>
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => navigate(1)}><ChevronRight className="w-4 h-4" /></Button>
          <Button size="sm" variant="ghost" className="text-xs h-8" onClick={() => setAnchor(new Date())}>Today</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card><CardContent className="p-3 text-center"><Users className="w-4 h-4 mx-auto mb-1 text-indigo-600" /><p className="text-xl font-bold">{employees.length}</p><p className="text-[10px] text-muted-foreground mt-0.5">{ROLE_LABELS[role]} on Roster</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><Clock className="w-4 h-4 mx-auto mb-1 text-blue-600" /><p className="text-xl font-bold">{shifts.length}</p><p className="text-[10px] text-muted-foreground mt-0.5">Shifts in View</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><CircleDot className="w-4 h-4 mx-auto mb-1 text-green-600" /><p className="text-xl font-bold">{onDutyNow.length}</p><p className="text-[10px] text-muted-foreground mt-0.5">On Duty Right Now</p></CardContent></Card>
      </div>

      {onDutyNow.length > 0 && (
        <Card className="border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10">
          <CardContent className="p-4">
            <h3 className="font-semibold text-sm mb-2 flex items-center gap-2"><CircleDot className="w-4 h-4 text-green-600" /> Currently On Duty — {ROLE_LABELS[role]}</h3>
            <div className="flex flex-wrap gap-1.5">
              {onDutyNow.map(s => (
                <Badge key={s.id} variant="secondary" className="text-xs">{s.staffName} · {s.startTime}–{s.endTime}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {loadingShifts || loadingEmployees ? (
        <div className="flex items-center justify-center h-40"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : error ? (
        <DataError message="We couldn't load the shift schedule." />
      ) : (
        <div className={viewMode === "month" ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2" : "space-y-3"}>
          {days.map(day => {
            const key = format(day, "yyyy-MM-dd");
            const dayShifts = shiftsByDay.get(key) ?? [];
            const compact = viewMode === "month";
            return (
              <Card key={key} className={isToday(day) ? "border-primary/50" : ""}>
                <CardContent className={compact ? "p-2" : "p-4"}>
                  <div className="flex items-center justify-between mb-2">
                    <p className={`font-semibold ${compact ? "text-xs" : "text-sm"}`}>
                      {format(day, compact ? "MMM d" : "EEEE, MMM d")}
                      {isToday(day) && <span className="ml-1.5 text-[10px] text-primary font-normal">Today</span>}
                    </p>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => openCreate(key)}><Plus className="w-3.5 h-3.5" /></Button>
                  </div>
                  {dayShifts.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">No shifts scheduled</p>
                  ) : (
                    <div className="space-y-1.5">
                      {dayShifts.map(s => (
                        <button
                          key={s.id} onClick={() => openEdit(s)}
                          className="w-full text-left bg-muted/50 hover:bg-muted rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2"
                        >
                          <span className={compact ? "text-[10px] truncate" : "text-xs"}>
                            <span className="font-medium">{s.staffName}</span>{!compact && <> · {s.label}</>}
                          </span>
                          <span className="text-[10px] text-muted-foreground shrink-0">{s.startTime}–{s.endTime}{s.endsNextDay ? "+1" : ""}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ShiftFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        role={role}
        employees={employees.map((e: any) => ({ id: e.id, name: e.name }))}
        defaultDate={dialogDefaultDate}
        editingShift={editingShift}
        seriesShifts={seriesShiftsFor(editingShift)}
      />
    </div>
  );
}
