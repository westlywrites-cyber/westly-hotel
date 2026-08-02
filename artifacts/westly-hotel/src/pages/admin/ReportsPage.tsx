import { useMemo } from "react";
import { useCollection } from "@/hooks/useFirebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileBarChart, Download, TrendingUp, TrendingDown, BedDouble, Users } from "lucide-react";
import { formatCurrency, toFirestoreDate } from "@/lib/utils";
import { DataError } from "@/components/ui/data-error";
import { format, startOfMonth, endOfMonth, subMonths, eachMonthOfInterval, startOfYear, endOfYear } from "date-fns";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export default function ReportsPage() {
  const { data: bookings, loading: l1, error: e1 } = useCollection("bookings");
  const { data: payments, loading: l2, error: e2 } = useCollection("payments");
  const { data: expenses, loading: l3, error: e3 } = useCollection("expenses");
  const { data: sales, loading: l4, error: e4 } = useCollection("sales");
  const { data: rooms, loading: l5, error: e5 } = useCollection("rooms");
  const { data: barOrders, loading: l6, error: e6 } = useCollection("bar_orders");
  const { data: laundry, loading: l7, error: e7 } = useCollection("laundry_requests");
  const loading = l1 || l2 || l3 || l4 || l5 || l6 || l7;
  const error = e1 || e2 || e3 || e4 || e5 || e6 || e7;

  const report = useMemo(() => {
    const now = new Date();
    const yearStart = startOfYear(now);
    const yearEnd = endOfYear(now);

    const months = eachMonthOfInterval({ start: yearStart, end: now });
    const monthlyData = months.map(month => {
      const ms = startOfMonth(month);
      const me = endOfMonth(month);
      const revenue = [
        ...payments.filter(p => { const d = toFirestoreDate((p as any).createdAt); return d && d >= ms && d <= me; }).map(p => (p as any).amount || 0),
        ...sales.filter(s => { const d = toFirestoreDate((s as any).createdAt); return d && d >= ms && d <= me; }).map(s => (s as any).total || 0),
        ...barOrders.filter(o => { const d = toFirestoreDate((o as any).createdAt); return d && d >= ms && d <= me && (o as any).status !== "cancelled"; }).map(o => (o as any).total || 0),
        ...laundry.filter(l => { const d = toFirestoreDate((l as any).createdAt); return d && d >= ms && d <= me && (l as any).status !== "cancelled"; }).map(l => (l as any).charge || 0),
      ].reduce((a, b) => a + b, 0);
      const exp = expenses.filter(e => { const d = toFirestoreDate((e as any).date); return d && d >= ms && d <= me; }).reduce((s: number, e: any) => s + (e.amount || 0), 0);
      const bookingCount = bookings.filter(b => { const d = toFirestoreDate((b as any).createdAt); return d && d >= ms && d <= me; }).length;
      const occupancy = rooms.length ? Math.round((bookings.filter(b => (b as any).status === "occupied" || (b as any).status === "checked_in").length / rooms.length) * 100) : 0;
      return { month: format(month, "MMM"), revenue, expenses: exp, profit: revenue - exp, bookings: bookingCount, occupancy };
    });

    const totalRevenue = monthlyData.reduce((s, m) => s + m.revenue, 0);
    const totalExpenses = monthlyData.reduce((s, m) => s + m.expenses, 0);
    const totalBookings = monthlyData.reduce((s, m) => s + m.bookings, 0);
    const avgOccupancy = rooms.length ? Math.round((bookings.filter(b => (b as any).status === "checked_in").length / rooms.length) * 100) : 0;

    return { monthlyData, totalRevenue, totalExpenses, totalProfit: totalRevenue - totalExpenses, totalBookings, avgOccupancy };
  }, [bookings, payments, expenses, sales, rooms, barOrders, laundry]);

  const exportCSV = () => {
    const csv = [
      ["Month","Revenue","Expenses","Profit","Bookings"],
      ...report.monthlyData.map(m => [m.month, m.revenue, m.expenses, m.profit, m.bookings])
    ].map(r => r.map((c: any) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], {type:"text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=`annual-report-${format(new Date(),"yyyy")}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold">Annual Reports</h1>
          <p className="text-muted-foreground text-sm">{format(new Date(), "yyyy")} Year-to-Date</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={exportCSV}><Download className="w-4 h-4" />Export CSV</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <DataError message="We couldn't load report data." />
      ) : (
      <>
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "YTD Revenue", value: formatCurrency(report.totalRevenue), icon: TrendingUp, color: "text-green-600" },
          { label: "YTD Expenses", value: formatCurrency(report.totalExpenses), icon: TrendingDown, color: "text-red-500" },
          { label: "YTD Profit", value: formatCurrency(report.totalProfit), icon: TrendingUp, color: report.totalProfit >= 0 ? "text-primary" : "text-red-600" },
          { label: "Current Occupancy", value: `${report.avgOccupancy}%`, icon: BedDouble, color: "text-blue-600" },
        ].map(card => (
          <Card key={card.label}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div><p className="text-xs text-muted-foreground">{card.label}</p><p className={`text-xl font-bold mt-1 ${card.color}`}>{card.value}</p></div>
                <card.icon className={`w-5 h-5 ${card.color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Revenue vs Expenses */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Monthly Revenue vs Expenses</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={report.monthlyData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="month" tick={{fontSize:11}} tickLine={false} />
              <YAxis tick={{fontSize:11}} tickFormatter={v=>`$${v}`} tickLine={false} width={60} />
              <Tooltip formatter={(v:number,n:string) => [formatCurrency(v), n.charAt(0).toUpperCase()+n.slice(1)]} />
              <Legend />
              <Bar dataKey="revenue" name="Revenue" fill="hsl(220,55%,28%)" radius={[3,3,0,0]} />
              <Bar dataKey="expenses" name="Expenses" fill="hsl(0,65%,56%)" radius={[3,3,0,0]} />
              <Bar dataKey="profit" name="Profit" fill="hsl(158,64%,40%)" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Bookings trend */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Monthly Booking Volume</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={report.monthlyData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="month" tick={{fontSize:11}} tickLine={false} />
              <YAxis tick={{fontSize:11}} tickLine={false} width={35} />
              <Tooltip />
              <Line type="monotone" dataKey="bookings" stroke="hsl(38,55%,45%)" strokeWidth={2} dot={{fill:"hsl(38,55%,45%)"}} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      </>
      )}
    </div>
  );
}
