import { useMemo } from "react";
import { useCollection } from "@/hooks/useFirebase";
import { where } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart2, Users, TrendingUp } from "lucide-react";
import { formatCurrency, toFirestoreDate } from "@/lib/utils";
import { DataError } from "@/components/ui/data-error";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function StaffPerformancePage() {
  const now = new Date();
  const ms = startOfMonth(now);
  const me = endOfMonth(now);

  // Only filter by isDeleted server-side (single-field, no composite index
  // needed); filter "active" client-side to avoid the same missing-index
  // issue that broke the Check-Out and Walk-In room/guest lists.
  const { data: allUsers, loading: l1, error: e1 } = useCollection<any>("users", [where("isDeleted", "!=", true)]);
  const users = useMemo(() => allUsers.filter((u: any) => u.status === "active"), [allUsers]);
  const { data: checkins, loading: l2, error: e2 } = useCollection("checkins");
  const { data: checkouts, loading: l3, error: e3 } = useCollection("checkouts");
  const { data: sales, loading: l4, error: e4 } = useCollection("sales");
  const { data: orders, loading: l5, error: e5 } = useCollection("orders");
  const { data: attendance, loading: l6, error: e6 } = useCollection("attendance");
  const loading = l1 || l2 || l3 || l4 || l5 || l6;
  const error = e1 || e2 || e3 || e4 || e5 || e6;

  const performance = useMemo(() => {
    return users.map((user: any) => {
      const monthCheckins = checkins.filter((c: any) => {
        const d = toFirestoreDate(c.checkInAt);
        return c.staffId === user.id && d && d >= ms && d <= me;
      }).length;
      const monthCheckouts = checkouts.filter((c: any) => {
        const d = toFirestoreDate(c.checkOutAt);
        return c.staffId === user.id && d && d >= ms && d <= me;
      }).length;
      const monthSales = sales.filter((s: any) => {
        const d = toFirestoreDate(s.createdAt);
        return s.staffId === user.id && d && d >= ms && d <= me;
      });
      const monthOrders = orders.filter((o: any) => {
        const d = toFirestoreDate(o.createdAt);
        return o.waiterId === user.id && d && d >= ms && d <= me;
      });
      const monthAttendance = attendance.filter((a: any) => {
        const d = toFirestoreDate(a.date);
        return a.staffId === user.id && d && d >= ms && d <= me;
      });
      const presentDays = monthAttendance.filter((a: any) => a.status === "present" || a.status === "late").length;
      const totalSalesRevenue = monthSales.reduce((s: number, sa: any) => s + (sa.total || 0), 0);
      const totalOrdersRevenue = monthOrders.reduce((s: number, o: any) => s + (o.total || 0), 0);

      return {
        id: user.id,
        name: user.name,
        role: user.role,
        checkins: monthCheckins,
        checkouts: monthCheckouts,
        sales: monthSales.length,
        salesRevenue: totalSalesRevenue,
        orders: monthOrders.length,
        ordersRevenue: totalOrdersRevenue,
        presentDays,
        totalActivities: monthCheckins + monthCheckouts + monthSales.length + monthOrders.length,
      };
    }).sort((a, b) => b.totalActivities - a.totalActivities);
  }, [users, checkins, checkouts, sales, orders, attendance]);

  const chartData = performance.slice(0, 8).map(p => ({
    name: p.name.split(" ")[0],
    checkins: p.checkins,
    checkouts: p.checkouts,
    sales: p.sales,
    orders: p.orders,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-2xl font-bold">Staff Performance</h1>
        <p className="text-muted-foreground text-sm">{format(now, "MMMM yyyy")} — all roles</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <DataError message="We couldn't load staff performance data." />
      ) : (
      <>
      {/* Activity chart */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Activity by Staff — {format(now, "MMMM")}</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="name" tick={{fontSize:11}} tickLine={false} />
              <YAxis tick={{fontSize:11}} tickLine={false} width={30} />
              <Tooltip />
              <Bar dataKey="checkins" name="Check-Ins" fill="hsl(220,55%,28%)" radius={[2,2,0,0]} stackId="a" />
              <Bar dataKey="checkouts" name="Check-Outs" fill="hsl(38,55%,45%)" radius={[2,2,0,0]} stackId="a" />
              <Bar dataKey="sales" name="Sales" fill="hsl(158,64%,40%)" radius={[2,2,0,0]} stackId="a" />
              <Bar dataKey="orders" name="Orders" fill="hsl(262,52%,47%)" radius={[2,2,0,0]} stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Leaderboard */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Users className="w-4 h-4" />Staff Activity Leaderboard</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">#</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Staff</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Role</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Check-Ins</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Sales</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Revenue</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Attendance</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Total Activities</th>
                </tr>
              </thead>
              <tbody>
                {performance.map((p, i) => (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                    <td className="py-2.5 px-4">
                      <span className={`font-bold ${i === 0 ? "text-yellow-500" : i === 1 ? "text-gray-400" : i === 2 ? "text-amber-600" : "text-muted-foreground"}`}>
                        #{i + 1}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-medium">{p.name}</td>
                    <td className="py-2.5 px-4"><Badge variant="secondary" className="text-[10px] capitalize">{p.role?.replace("_"," ")}</Badge></td>
                    <td className="py-2.5 px-4">{p.checkins + p.checkouts}</td>
                    <td className="py-2.5 px-4">{p.sales + p.orders}</td>
                    <td className="py-2.5 px-4 font-medium">{formatCurrency(p.salesRevenue + p.ordersRevenue)}</td>
                    <td className="py-2.5 px-4"><Badge variant="outline" className="text-[10px]">{p.presentDays}d</Badge></td>
                    <td className="py-2.5 px-4">
                      <span className={`font-bold text-sm ${p.totalActivities > 10 ? "text-primary" : "text-foreground"}`}>{p.totalActivities}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      </>
      )}
    </div>
  );
}
