import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCollection } from "@/hooks/useFirebase";
import { where } from "firebase/firestore";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shirt, Search, Download } from "lucide-react";
import { formatCurrency, formatDateTime, toFirestoreDate } from "@/lib/utils";
import { format } from "date-fns";
import { DataError } from "@/components/ui/data-error";
import { STATUS_LABELS, type LaundryStatus } from "@/pages/admin/LaundryPage";

const STATUS_COLORS: Record<string, string> = {
  received: "bg-slate-100 text-slate-800 dark:bg-slate-800/40 dark:text-slate-300",
  washing: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  drying: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400",
  ironing: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  ready: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  delivered: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

export default function LaundryHistoryPage() {
  const { adminUser, role } = useAuth();
  // Laundry valets see their own logged requests; management/accountant see everything.
  const constraints = role === "laundry_valet" && adminUser ? [where("laundryValetId", "==", adminUser.id)] : [];
  const { data: requests, loading, error } = useCollection("laundry_requests", constraints);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState(format(new Date(), "yyyy-MM"));

  const filtered = useMemo(() => {
    return requests.filter((r: any) => {
      const d = toFirestoreDate(r.createdAt);
      const matchMonth = !monthFilter || (d && format(d, "yyyy-MM") === monthFilter);
      const matchSearch = !search || r.guestName?.toLowerCase().includes(search.toLowerCase()) || r.roomNumber?.includes(search) || r.laundryValetName?.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || r.status === statusFilter;
      return matchMonth && matchSearch && matchStatus && !r.isDeleted;
    }).sort((a: any, b: any) => (toFirestoreDate(b.createdAt)?.getTime() ?? 0) - (toFirestoreDate(a.createdAt)?.getTime() ?? 0));
  }, [requests, monthFilter, search, statusFilter]);

  const totalCharges = filtered.filter((r: any) => r.status !== "cancelled").reduce((s: number, r: any) => s + (r.charge || 0), 0);

  const exportCSV = () => {
    const csv = [
      ["Date","Guest","Room","Items","Item Count","Status","Charge","Payment Status","Logged By","Delivered At"],
      ...filtered.map((r: any) => [
        formatDateTime(toFirestoreDate(r.createdAt)), r.guestName || "", r.roomNumber || "", r.itemsDescription || "",
        r.itemCount || "", STATUS_LABELS[r.status as LaundryStatus] || r.status, r.charge || 0, r.paymentStatus || "unpaid",
        r.laundryValetName || "", r.deliveredAt ? formatDateTime(toFirestoreDate(r.deliveredAt)) : "",
      ])
    ].map(row => row.map(c => `"${String(c ?? "").replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `laundry-history-${monthFilter}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold">Laundry History</h1>
          <p className="text-muted-foreground text-sm">{filtered.length} requests · {formatCurrency(totalCharges)}</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={exportCSV}><Download className="w-4 h-4" />Export CSV</Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search guest, room, valet…" value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {Object.entries(STATUS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Input type="month" value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className="w-44" />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-40"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : error ? (
            <DataError message="We couldn't load laundry history." />
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground"><Shirt className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>No laundry requests found</p></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Date</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Guest / Room</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Items</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Logged By</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Charge</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Payment</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r: any) => (
                    <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="py-2.5 px-4 text-xs text-muted-foreground">{formatDateTime(toFirestoreDate(r.createdAt))}</td>
                      <td className="py-2.5 px-4">
                        {r.guestName && <p>{r.guestName}</p>}
                        {r.roomNumber && <p className="text-xs text-muted-foreground">Room {r.roomNumber}</p>}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-muted-foreground max-w-[220px] truncate">{r.itemsDescription || "—"} {r.itemCount ? `(${r.itemCount})` : ""}</td>
                      <td className="py-2.5 px-4">{r.laundryValetName}</td>
                      <td className="py-2.5 px-4 font-bold">{formatCurrency(r.charge || 0)}</td>
                      <td className="py-2.5 px-4">
                        <Badge variant={r.paymentStatus === "paid" ? "default" : "outline"} className="text-[10px]">{r.paymentStatus === "paid" ? "Paid" : "Unpaid"}</Badge>
                      </td>
                      <td className="py-2.5 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_COLORS[r.status] || "bg-muted text-muted-foreground"}`}>{STATUS_LABELS[r.status as LaundryStatus] || r.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
