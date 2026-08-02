import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCollection } from "@/hooks/useFirebase";
import { doc, updateDoc, serverTimestamp, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Wine, Search, Loader2 } from "lucide-react";
import { formatCurrency, formatDateTime, toFirestoreDate } from "@/lib/utils";
import { format } from "date-fns";
import { DataError } from "@/components/ui/data-error";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  served: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

export default function BarSalesHistoryPage() {
  const { adminUser, role } = useAuth();
  const { toast } = useToast();
  // Bar attendants see only their own sales; management/accountant see everything.
  const constraints = role === "bar_attendant" && adminUser ? [where("barAttendantId", "==", adminUser.id)] : [];
  const { data: orders, loading, error } = useCollection("bar_orders", constraints);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState(format(new Date(), "yyyy-MM"));
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return orders.filter((o: any) => {
      const d = toFirestoreDate(o.createdAt);
      const matchMonth = !monthFilter || (d && format(d, "yyyy-MM") === monthFilter);
      const matchSearch = !search || o.barAttendantName?.toLowerCase().includes(search.toLowerCase()) || o.customerName?.toLowerCase().includes(search.toLowerCase()) || o.roomNumber?.includes(search);
      const matchStatus = statusFilter === "all" || o.status === statusFilter;
      return matchMonth && matchSearch && matchStatus && !o.isDeleted;
    }).sort((a: any, b: any) => {
      const ta = toFirestoreDate(a.createdAt)?.getTime() ?? 0;
      const tb = toFirestoreDate(b.createdAt)?.getTime() ?? 0;
      return tb - ta;
    });
  }, [orders, monthFilter, search, statusFilter]);

  const total = filtered.filter(o => (o as any).status !== "cancelled").reduce((s: number, o: any) => s + (o.total || 0), 0);

  const updateStatus = async (order: any, newStatus: string) => {
    if (!adminUser) return;
    setBusyId(order.id);
    try {
      await updateDoc(doc(db, "bar_orders", order.id), { status: newStatus, updatedAt: serverTimestamp(), updatedBy: adminUser.id });
      toast({ title: "Sale Updated", description: `Status → ${newStatus}` });
    } catch (err: any) {
      toast({ title: "Update Failed", description: err.message, variant: "destructive" });
    }
    setBusyId(null);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-2xl font-bold">Bar Sales History</h1>
        <p className="text-muted-foreground text-sm">{filtered.length} sales · {formatCurrency(total)}</p>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search guest, room…" value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="served">Served</SelectItem>
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
            <DataError message="We couldn't load bar sales." />
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground"><Wine className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>No bar sales found</p></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Date</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Bar Attendant</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Guest / Room</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Items</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Total</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((o: any) => (
                    <tr key={o.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="py-2.5 px-4 text-xs text-muted-foreground">{formatDateTime(toFirestoreDate(o.createdAt))}</td>
                      <td className="py-2.5 px-4">{o.barAttendantName}</td>
                      <td className="py-2.5 px-4">
                        {o.customerName && <p>{o.customerName}</p>}
                        {o.roomNumber && <p className="text-xs text-muted-foreground">Room {o.roomNumber}</p>}
                        {o.tableNumber && <p className="text-xs text-muted-foreground">Table {o.tableNumber}</p>}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex flex-wrap gap-1">
                          {o.items?.slice(0, 2).map((item: any, i: number) => (
                            <Badge key={i} variant="secondary" className="text-[10px]">{item.name} ×{item.quantity}</Badge>
                          ))}
                          {o.items?.length > 2 && <Badge variant="secondary" className="text-[10px]">+{o.items.length - 2}</Badge>}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 font-bold">{formatCurrency(o.total || 0)}</td>
                      <td className="py-2.5 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${STATUS_COLORS[o.status] || "bg-muted text-muted-foreground"}`}>{o.status}</span>
                      </td>
                      <td className="py-2.5 px-4">
                        {o.status === "pending" && (
                          <Button variant="ghost" size="sm" className="h-6 text-[10px] text-green-600" onClick={() => updateStatus(o, "served")} disabled={busyId === o.id}>
                            {busyId === o.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Mark Served"}
                          </Button>
                        )}
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
