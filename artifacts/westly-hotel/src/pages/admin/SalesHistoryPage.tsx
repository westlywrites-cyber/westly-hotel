import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCollection } from "@/hooks/useFirebase";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Search, Download } from "lucide-react";
import { formatCurrency, formatDateTime, toFirestoreDate } from "@/lib/utils";
import { DataError } from "@/components/ui/data-error";
import { where } from "firebase/firestore";
import { format } from "date-fns";

export default function SalesHistoryPage() {
  const { adminUser, role } = useAuth();
  const constraints = role === "staff" && adminUser ? [where("staffId", "==", adminUser.id)] : [];
  const { data: sales, loading, error } = useCollection("sales", constraints);
  const [search, setSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState(format(new Date(), "yyyy-MM"));

  const filtered = useMemo(() => {
    return sales.filter((s: any) => {
      const d = toFirestoreDate(s.createdAt);
      const matchMonth = !monthFilter || (d && format(d, "yyyy-MM") === monthFilter);
      const matchSearch = !search || s.staffName?.toLowerCase().includes(search.toLowerCase()) || s.customerName?.toLowerCase().includes(search.toLowerCase());
      return matchMonth && matchSearch && !s.isDeleted;
    }).sort((a: any, b: any) => {
      const ta = toFirestoreDate(a.createdAt)?.getTime() ?? 0;
      const tb = toFirestoreDate(b.createdAt)?.getTime() ?? 0;
      return tb - ta;
    });
  }, [sales, monthFilter, search]);

  const total = filtered.reduce((s: number, sale: any) => s + (sale.total || 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold">Sales History</h1>
          <p className="text-muted-foreground text-sm">{filtered.length} sales · {formatCurrency(total)} total</p>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search staff, customer…" value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Input type="month" value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className="w-44" />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-40"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : error ? (
            <DataError message="We couldn't load sales history." />
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground"><ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>No sales found</p></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Date & Time</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Staff</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Customer</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Items</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Total</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((sale: any) => (
                    <tr key={sale.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="py-2.5 px-4 text-muted-foreground text-xs">{formatDateTime(toFirestoreDate(sale.createdAt))}</td>
                      <td className="py-2.5 px-4">{sale.staffName}</td>
                      <td className="py-2.5 px-4 text-muted-foreground">{sale.customerName || "Walk-in"}</td>
                      <td className="py-2.5 px-4">
                        <div className="flex flex-wrap gap-1">
                          {sale.items?.slice(0, 2).map((item: any, i: number) => (
                            <Badge key={i} variant="secondary" className="text-[10px]">{item.name} ×{item.quantity}</Badge>
                          ))}
                          {sale.items?.length > 2 && <Badge variant="secondary" className="text-[10px]">+{sale.items.length - 2}</Badge>}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 font-bold">{formatCurrency(sale.total || 0)}</td>
                      <td className="py-2.5 px-4 capitalize text-muted-foreground">{sale.paymentMethod?.replace("_"," ")}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/40">
                    <td colSpan={4} className="py-3 px-4 font-bold text-right">Total</td>
                    <td className="py-3 px-4 font-bold text-primary">{formatCurrency(total)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
