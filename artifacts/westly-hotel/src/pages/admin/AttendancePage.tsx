import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCollection } from "@/hooks/useFirebase";
import { hasPermission } from "@/lib/rbac";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { ClipboardCheck, Search, Plus, ChevronDown, ChevronRight, ShieldAlert } from "lucide-react";
import { toFirestoreDate } from "@/lib/utils";
import { DataError } from "@/components/ui/data-error";
import { format, startOfMonth } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  present: "bg-green-100 text-green-800",
  absent: "bg-red-100 text-red-800",
  late: "bg-yellow-100 text-yellow-800",
  leave: "bg-blue-100 text-blue-800",
  half_day: "bg-orange-100 text-orange-800",
};

// Falls back to the legacy `date` Timestamp field for records created before
// `dateKey` existed, so old attendance history still groups correctly.
function recordDateKey(a: any): string | null {
  if (a.dateKey) return a.dateKey;
  const d = toFirestoreDate(a.date);
  return d ? format(d, "yyyy-MM-dd") : null;
}

export default function AttendancePage() {
  const { role } = useAuth();
  const { data: attendance, loading, error } = useCollection<any>("attendance");
  const { data: users } = useCollection<any>("users");

  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const canView = !role || hasPermission(role, "view:attendance");

  const grouped = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const a of attendance) {
      if (a.isDeleted) continue;
      const key = recordDateKey(a);
      if (!key) continue;
      if (fromDate && key < fromDate) continue;
      if (toDate && key > toDate) continue;
      if (search && !a.staffName?.toLowerCase().includes(search.toLowerCase())) continue;
      (groups[key] ||= []).push(a);
    }
    return Object.entries(groups)
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([dateKey, records]) => ({
        dateKey,
        records: records.sort((a, b) => (a.staffName || "").localeCompare(b.staffName || "")),
      }));
  }, [attendance, fromDate, toDate, search]);

  const isExpanded = (dateKey: string, index: number) => {
    if (dateKey in expanded) return expanded[dateKey];
    // Default: expand the most recent date, collapse the rest.
    return index === 0;
  };

  const today = format(new Date(), "yyyy-MM-dd");
  const todayRecords = attendance.filter((a: any) => !a.isDeleted && recordDateKey(a) === today);
  const summary = {
    presentToday: todayRecords.filter((a: any) => a.status === "present").length,
    absentToday: todayRecords.filter((a: any) => a.status === "absent").length,
    lateToday: todayRecords.filter((a: any) => a.status === "late").length,
    total: users.filter((u: any) => !u.isDeleted).length,
  };

  if (!canView) {
    return (
      <div className="max-w-md mx-auto pt-16 text-center space-y-3">
        <ShieldAlert className="w-10 h-10 mx-auto text-muted-foreground" />
        <h2 className="font-serif text-xl font-bold">Access Restricted</h2>
        <p className="text-muted-foreground text-sm">You don't have permission to view the attendance register.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold">Attendance Register</h1>
          <p className="text-muted-foreground text-sm">Complete attendance history for all staff, grouped by date</p>
        </div>
        <Link href="/admin/attendance/record">
          <Button className="gap-2">
            <Plus className="w-4 h-4" /> Record Attendance
          </Button>
        </Link>
      </div>

      {/* Today's summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Present Today", value: summary.presentToday, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/10" },
          { label: "Absent Today", value: summary.absentToday, color: "text-red-600", bg: "bg-red-50 dark:bg-red-900/10" },
          { label: "Late Today", value: summary.lateToday, color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-900/10" },
          { label: "Total Staff", value: summary.total, color: "text-primary", bg: "bg-primary/10" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className={`p-4 ${s.bg}`}>
              <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search staff…" value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">From</span>
          <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-40" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">To</span>
          <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-40" />
        </div>
      </div>

      {/* Register, grouped by date */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <DataError message="We couldn't load attendance records." />
      ) : grouped.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            <ClipboardCheck className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>No attendance records found for this range</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {grouped.map(({ dateKey, records }, index) => {
            const open = isExpanded(dateKey, index);
            const presentCount = records.filter(r => r.status === "present").length;
            const absentCount = records.filter(r => r.status === "absent").length;
            const dateLabel = (() => {
              try {
                return format(new Date(`${dateKey}T00:00:00`), "EEEE, MMM d, yyyy");
              } catch {
                return dateKey;
              }
            })();
            return (
              <Card key={dateKey}>
                <button
                  type="button"
                  onClick={() => setExpanded(prev => ({ ...prev, [dateKey]: !open }))}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    <span className="font-medium">{dateLabel}</span>
                    {dateKey === today && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">TODAY</span>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{records.length} record{records.length !== 1 ? "s" : ""}</span>
                    <span className="text-green-600">{presentCount} present</span>
                    {absentCount > 0 && <span className="text-red-600">{absentCount} absent</span>}
                  </div>
                </button>
                {open && (
                  <CardContent className="p-0 border-t border-border">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-muted/40">
                            <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Staff</th>
                            <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Role</th>
                            <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Status</th>
                            <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Check In</th>
                            <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Check Out</th>
                            <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {records.map((a: any) => (
                            <tr key={a.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                              <td className="py-2.5 px-4 font-medium">{a.staffName}</td>
                              <td className="py-2.5 px-4 text-muted-foreground capitalize">{a.staffRole?.replace("_", " ") || "—"}</td>
                              <td className="py-2.5 px-4">
                                <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${STATUS_COLORS[a.status] || "bg-muted text-muted-foreground"}`}>
                                  {a.status}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 text-muted-foreground">{a.clockIn || "—"}</td>
                              <td className="py-2.5 px-4 text-muted-foreground">{a.clockOut || "—"}</td>
                              <td className="py-2.5 px-4 text-muted-foreground text-xs">{a.notes || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
