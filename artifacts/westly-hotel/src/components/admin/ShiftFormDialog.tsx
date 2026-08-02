import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, AlertTriangle } from "lucide-react";
import { ROLE_LABELS, type Role } from "@/lib/rbac";
import {
  createShift, updateShiftInstance, cancelShiftInstance, cancelShiftSeries,
  type ShiftDoc, type ConflictInfo,
} from "@/lib/shifts";

const WEEKDAYS = [
  { value: 0, label: "Sun" }, { value: 1, label: "Mon" }, { value: 2, label: "Tue" },
  { value: 3, label: "Wed" }, { value: 4, label: "Thu" }, { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

interface ShiftFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: Role;
  employees: { id: string; name: string }[];
  /** Pre-filled defaults for a brand-new shift, e.g. the clicked calendar date. */
  defaultDate?: string;
  /** If set, this dialog edits/cancels an existing occurrence instead of creating one. */
  editingShift?: ShiftDoc | null;
  /** All active shifts in the same series as editingShift, for "cancel whole series". */
  seriesShifts?: ShiftDoc[];
  onDone?: () => void;
}

export default function ShiftFormDialog({
  open, onOpenChange, role, employees, defaultDate, editingShift, seriesShifts, onDone,
}: ShiftFormDialogProps) {
  const { adminUser } = useAuth();
  const { toast } = useToast();

  const [staffId, setStaffId] = useState("");
  const [label, setLabel] = useState("");
  const [date, setDate] = useState(defaultDate ?? new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("16:00");
  const [endsNextDay, setEndsNextDay] = useState(false);
  const [notes, setNotes] = useState("");
  const [recurrenceType, setRecurrenceType] = useState<"none" | "daily" | "weekly">("none");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [until, setUntil] = useState("");
  const [saving, setSaving] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([]);

  useEffect(() => {
    if (!open) return;
    if (editingShift) {
      setStaffId(editingShift.staffId);
      setLabel(editingShift.label);
      setDate(editingShift.date);
      setStartTime(editingShift.startTime);
      setEndTime(editingShift.endTime);
      setEndsNextDay(editingShift.endsNextDay);
      setNotes(editingShift.notes ?? "");
      setRecurrenceType("none"); // editing an instance never re-expands recurrence
    } else {
      setStaffId(employees[0]?.id ?? "");
      setLabel("");
      setDate(defaultDate ?? new Date().toISOString().slice(0, 10));
      setStartTime("08:00");
      setEndTime("16:00");
      setEndsNextDay(false);
      setNotes("");
      setRecurrenceType("none");
      setDaysOfWeek([]);
      setUntil("");
    }
    setConflicts([]);
  }, [open, editingShift]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedEmployee = useMemo(() => employees.find(e => e.id === staffId), [employees, staffId]);

  const toggleDay = (d: number) => setDaysOfWeek(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  const handleSubmit = async () => {
    if (!adminUser) return;
    if (!staffId || !selectedEmployee) {
      toast({ title: "Select a staff member", variant: "destructive" });
      return;
    }
    if (!label.trim()) {
      toast({ title: "Give the shift a label", description: "e.g. Morning Shift, Night Shift", variant: "destructive" });
      return;
    }
    if (recurrenceType === "weekly" && daysOfWeek.length === 0) {
      toast({ title: "Pick at least one weekday", variant: "destructive" });
      return;
    }
    setSaving(true);
    setConflicts([]);
    try {
      if (editingShift) {
        const result = await updateShiftInstance(editingShift, {
          staffId, staffName: selectedEmployee.name, startTime, endTime, endsNextDay, label: label.trim(), notes: notes || null,
        }, { id: adminUser.id, name: adminUser.name });
        if (!result.ok) { setConflicts(result.conflicts); setSaving(false); return; }
        toast({ title: "Shift Updated" });
      } else {
        const result = await createShift({
          role, staffId, staffName: selectedEmployee.name, date, startTime, endTime, endsNextDay,
          label: label.trim(), notes: notes || undefined,
          recurrence: { type: recurrenceType, daysOfWeek: recurrenceType === "weekly" ? daysOfWeek : undefined, until: until || undefined },
        }, { id: adminUser.id, name: adminUser.name });
        if (!result.ok) { setConflicts(result.conflicts); setSaving(false); return; }
        toast({ title: "Shift Scheduled", description: result.count > 1 ? `${result.count} shifts created` : undefined });
      }
      onOpenChange(false);
      onDone?.();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const handleCancelInstance = async () => {
    if (!adminUser || !editingShift) return;
    setSaving(true);
    try {
      await cancelShiftInstance(editingShift, { id: adminUser.id, name: adminUser.name });
      toast({ title: "Shift Cancelled" });
      onOpenChange(false);
      onDone?.();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const handleCancelSeries = async () => {
    if (!adminUser || !editingShift || !seriesShifts) return;
    setSaving(true);
    try {
      await cancelShiftSeries(seriesShifts, editingShift.date, { id: adminUser.id, name: adminUser.name });
      toast({ title: "Series Cancelled", description: "This and every future shift in the series was cancelled." });
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
          <DialogTitle>{editingShift ? `Edit Shift — ${editingShift.label}` : `Schedule Shift · ${ROLE_LABELS[role]}`}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Staff Member *</Label>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
              <SelectContent>
                {employees.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">No active staff in this role yet.</div>}
                {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Shift Label *</Label>
            <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Morning Shift" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{editingShift ? "Date" : "Start Date *"}</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} disabled={!!editingShift} />
            </div>
            <div className="space-y-1.5">
              <Label className="opacity-0 select-none">.</Label>
              <label className="flex items-center gap-2 h-9 text-xs text-muted-foreground">
                <Checkbox checked={endsNextDay} onCheckedChange={c => setEndsNextDay(!!c)} /> Ends next day (overnight)
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start Time *</Label>
              <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>End Time *</Label>
              <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional handover notes" />
          </div>

          {!editingShift && (
            <div className="space-y-2 border-t border-border pt-3">
              <Label>Recurrence</Label>
              <Select value={recurrenceType} onValueChange={v => setRecurrenceType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Does not repeat</SelectItem>
                  <SelectItem value="daily">Repeats daily</SelectItem>
                  <SelectItem value="weekly">Repeats weekly on selected days</SelectItem>
                </SelectContent>
              </Select>
              {recurrenceType === "weekly" && (
                <div className="flex gap-1.5 flex-wrap">
                  {WEEKDAYS.map(d => (
                    <button
                      key={d.value} type="button" onClick={() => toggleDay(d.value)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-medium ${daysOfWeek.includes(d.value) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              )}
              {recurrenceType !== "none" && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Repeat until (optional, max ~3 months / 60 shifts)</Label>
                  <Input type="date" value={until} onChange={e => setUntil(e.target.value)} />
                </div>
              )}
            </div>
          )}

          {conflicts.length > 0 && (
            <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-900/10 dark:border-red-800 p-3 space-y-1.5">
              <p className="text-xs font-medium text-red-700 dark:text-red-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Scheduling conflict — {selectedEmployee?.name} is already booked
              </p>
              <ul className="text-[11px] text-red-600 dark:text-red-400 space-y-0.5">
                {conflicts.slice(0, 6).map((c, i) => (
                  <li key={i}>{c.date}: overlaps "{c.withLabel}" ({c.withTime})</li>
                ))}
                {conflicts.length > 6 && <li>+ {conflicts.length - 6} more conflicting date{conflicts.length - 6 !== 1 ? "s" : ""}</li>}
              </ul>
              <p className="text-[11px] text-muted-foreground">Pick a different staff member or time and try again.</p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          {editingShift && (
            <div className="flex gap-2 mr-auto">
              <Button variant="ghost" className="text-destructive h-8 text-xs" onClick={handleCancelInstance} disabled={saving}>
                Cancel This Shift
              </Button>
              {editingShift.seriesId && seriesShifts && seriesShifts.length > 1 && (
                <Button variant="ghost" className="text-destructive h-8 text-xs" onClick={handleCancelSeries} disabled={saving}>
                  Cancel Series
                </Button>
              )}
            </div>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={handleSubmit} disabled={saving} className="gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {editingShift ? "Save Changes" : "Schedule Shift"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
