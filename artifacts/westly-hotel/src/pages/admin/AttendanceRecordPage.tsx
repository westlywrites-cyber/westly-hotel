import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCollection } from "@/hooks/useFirebase";
import { doc, setDoc, serverTimestamp, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logAction } from "@/lib/audit";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { usePinTaskComplete } from "@/hooks/usePinTaskComplete";
import { PinSessionEndingOverlay } from "@/components/admin/PinSessionEndingOverlay";
import { ClipboardCheck, Loader2, LogIn, LogOut, Search, Check, Save } from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";
import { DataError } from "@/components/ui/data-error";

// Attendance is stored as ONE document per staff member per calendar day.
// The document id is deterministic (`${staffId}__${dateKey}`), so recording
// a check-in and, later the same day, a check-out both write to the SAME
// document via setDoc(..., { merge: true }) instead of creating duplicates.
function attendanceDocId(staffId: string, dateKey: string) {
  return `${staffId}__${dateKey}`;
}

type RowState = {
  status: string;
  clockIn: string;
  clockOut: string;
  notes: string;
};

const STATUS_OPTIONS = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "late", label: "Late" },
  { value: "leave", label: "Leave" },
  { value: "half_day", label: "Half Day" },
];

const EMPTY_ROW: RowState = { status: "present", clockIn: "", clockOut: "", notes: "" };

export default function AttendanceRecordPage() {
  const { adminUser, role } = useAuth();
  const { toast } = useToast();
  const { isPinSession, endingSession, notifyTaskComplete } = usePinTaskComplete();
  // Only filter by isDeleted server-side (already indexed). Combining it with
  // where("status","==","active") would need a composite index that doesn't
  // exist in firestore.indexes.json — Firestore then rejects the live query
  // after briefly serving a cached snapshot, which is why the list used to
  // flash in and then go blank. Filtering "active" client-side avoids that
  // entirely, with no index deploy/build wait required.
  const { data: allUsers, error: usersError } = useCollection<any>("users", [where("isDeleted", "!=", true)]);
  const users = useMemo(() => allUsers.filter((u: any) => u.status === "active"), [allUsers]);
  // Fetch the whole collection (rules already scope read access to management/receptionist)
  // and filter client-side by dateKey — avoids re-subscribing per date change.
  const { data: attendance, loading: attendanceLoading, error: attendanceError } = useCollection<any>("attendance");
  const hasLoadError = !!(usersError || attendanceError);

  const [dateKey, setDateKey] = useState(format(new Date(), "yyyy-MM-dd"));
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Record<string, number>>({});
  const [bulkSaving, setBulkSaving] = useState(false);

  const existingForDate = useMemo(() => {
    const map: Record<string, any> = {};
    for (const rec of attendance) {
      if (rec.dateKey === dateKey && !rec.isDeleted) map[rec.staffId] = rec;
    }
    return map;
  }, [attendance, dateKey]);

  // Re-seed the editable rows whenever the selected date changes, or once the
  // attendance collection finishes its first load — but NOT on every realtime
  // update, so we don't clobber whatever the person is currently typing.
  useEffect(() => {
    const seeded: Record<string, RowState> = {};
    for (const [staffId, rec] of Object.entries(existingForDate)) {
      seeded[staffId] = {
        status: (rec as any).status || "present",
        clockIn: (rec as any).clockIn || "",
        clockOut: (rec as any).clockOut || "",
        notes: (rec as any).notes || "",
      };
    }
    setRows(seeded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey, attendanceLoading]);

  const filteredUsers = useMemo(() => {
    if (!search) return users;
    return users.filter((u: any) => u.name?.toLowerCase().includes(search.toLowerCase()));
  }, [users, search]);

  const updateRow = (userId: string, field: keyof RowState, value: string) => {
    setRows(prev => ({
      ...prev,
      [userId]: { ...EMPTY_ROW, ...prev[userId], [field]: value },
    }));
  };

  const saveRow = async (userId: string, overrides?: Partial<RowState>): Promise<boolean> => {
    if (!adminUser) return false;
    if (hasLoadError) {
      toast({ title: "Can't save yet", description: "Staff or attendance data failed to load. Reload the page before saving to avoid overwriting existing records.", variant: "destructive" });
      return false;
    }
    const user = users.find((u: any) => u.id === userId) as any;
    const row: RowState = { ...EMPTY_ROW, ...rows[userId], ...overrides };
    const docId = attendanceDocId(userId, dateKey);
    const existing = existingForDate[userId];

    setSavingId(userId);
    try {
      await setDoc(
        doc(db, "attendance", docId),
        {
          staffId: userId,
          staffName: user?.name || "Unknown",
          staffRole: user?.role || null,
          dateKey,
          date: new Date(`${dateKey}T00:00:00`),
          status: row.status || "present",
          clockIn: row.clockIn || null,
          clockOut: row.clockOut || null,
          notes: row.notes || null,
          recordedBy: adminUser.id,
          recordedByName: adminUser.name,
          updatedAt: serverTimestamp(),
          ...(existing ? {} : { createdAt: serverTimestamp() }),
          isDeleted: false,
        },
        { merge: true }
      );
      await logAction(
        adminUser.id,
        adminUser.name,
        existing ? "attendance_updated" : "attendance_recorded",
        "attendance",
        docId,
        existing ? { status: existing.status, clockIn: existing.clockIn, clockOut: existing.clockOut } : null,
        { status: row.status, clockIn: row.clockIn, clockOut: row.clockOut, date: dateKey },
        role ?? undefined
      );
      setRows(prev => ({ ...prev, [userId]: row }));
      setSavedIds(prev => ({ ...prev, [userId]: Date.now() }));
      toast({
        title: existing ? "Attendance Updated" : "Attendance Recorded",
        description: `${user?.name || "Staff"} — ${format(new Date(`${dateKey}T00:00:00`), "MMM d, yyyy")}`,
      });
      return true;
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      return false;
    }
    setSavingId(null);
  };

  const handleCheckIn = (userId: string) => {
    const now = format(new Date(), "HH:mm");
    saveRow(userId, { clockIn: now, status: rows[userId]?.status || "present" }).then(ok => ok && notifyTaskComplete());
  };

  const handleCheckOut = (userId: string) => {
    const now = format(new Date(), "HH:mm");
    saveRow(userId, { clockOut: now }).then(ok => ok && notifyTaskComplete());
  };

  const handleSaveAll = async () => {
    setBulkSaving(true);
    for (const user of filteredUsers as any[]) {
      if (rows[user.id]) {
        await saveRow(user.id);
      }
    }
    setBulkSaving(false);
  };

  return (
    <div className="space-y-5 max-w-5xl">
      <PinSessionEndingOverlay visible={isPinSession && endingSession} />
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold">Record Attendance</h1>
          <p className="text-muted-foreground text-sm">
            One record per staff member per day — check them in now, and check them out later without losing the entry.
          </p>
        </div>
        <Input type="date" value={dateKey} onChange={e => setDateKey(e.target.value)} className="w-44" />
      </div>

      <div className="flex gap-3 flex-wrap items-center justify-between">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search staff…" value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Button variant="outline" onClick={handleSaveAll} disabled={bulkSaving} className="gap-2">
          {bulkSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save All Edited Rows
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {hasLoadError && (
            <div className="p-4">
              <DataError message="Staff or attendance data failed to load. Reload before saving, or existing records may be overwritten." />
            </div>
          )}
          {attendanceLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Staff Member</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground w-36">Status</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground w-40">Check In</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground w-40">Check Out</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Notes</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground w-20">Save</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user: any) => {
                    const rec = rows[user.id] || EMPTY_ROW;
                    const hasRecordToday = !!existingForDate[user.id];
                    const isSavingRow = savingId === user.id;
                    const justSaved = savedIds[user.id] && Date.now() - savedIds[user.id] < 2000;
                    return (
                      <tr key={user.id} className="border-b border-border last:border-0 align-top">
                        <td className="py-2.5 px-4">
                          <p className="font-medium flex items-center gap-1.5">
                            {user.name}
                            {hasRecordToday && <Check className="w-3.5 h-3.5 text-green-600" />}
                          </p>
                          <p className="text-xs text-muted-foreground capitalize">{user.role?.replace("_", " ")}</p>
                        </td>
                        <td className="py-2 px-4">
                          <Select value={rec.status} onValueChange={v => updateRow(user.id, "status", v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {STATUS_OPTIONS.map(o => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-2 px-4">
                          <div className="flex gap-1">
                            <Input
                              type="time"
                              value={rec.clockIn}
                              onChange={e => updateRow(user.id, "clockIn", e.target.value)}
                              className="h-8 text-xs"
                            />
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="h-8 w-8 shrink-0"
                              title="Check in now"
                              onClick={() => handleCheckIn(user.id)}
                              disabled={isSavingRow}
                            >
                              <LogIn className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                        <td className="py-2 px-4">
                          <div className="flex gap-1">
                            <Input
                              type="time"
                              value={rec.clockOut}
                              onChange={e => updateRow(user.id, "clockOut", e.target.value)}
                              className="h-8 text-xs"
                            />
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="h-8 w-8 shrink-0"
                              title="Check out now"
                              onClick={() => handleCheckOut(user.id)}
                              disabled={isSavingRow}
                            >
                              <LogOut className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                        <td className="py-2 px-4">
                          <Input
                            value={rec.notes}
                            onChange={e => updateRow(user.id, "notes", e.target.value)}
                            placeholder="Optional"
                            className="h-8 text-xs"
                          />
                        </td>
                        <td className="py-2 px-4">
                          <Button
                            type="button"
                            size="icon"
                            variant={justSaved ? "default" : "ghost"}
                            className="h-8 w-8"
                            title="Save this record"
                            onClick={() => saveRow(user.id)}
                            disabled={isSavingRow}
                          >
                            {isSavingRow ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : justSaved ? <Check className="w-3.5 h-3.5" /> : <ClipboardCheck className="w-3.5 h-3.5" />}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-10 text-muted-foreground">No staff match your search</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Link href="/admin/attendance"><Button variant="outline" type="button">View Attendance Register</Button></Link>
      </div>
    </div>
  );
}
