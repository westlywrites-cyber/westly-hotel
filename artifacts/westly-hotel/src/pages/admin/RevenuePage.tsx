import { useMemo } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, BedDouble, ShoppingCart, Coffee, Clock, Wine, Shirt } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, subMonths } from "date-fns";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";
import { useRevenueLedger, approvedOnly, pendingOnly, inRange, sumByCategory, sumAmount } from "@/lib/revenue";
import { DataError } from "@/components/ui/data-error";

const COLORS = ["hsl(220,55%,28%)", "hsl(38,55%,45%)", "hsl(158,64%,40%)", "hsl(262,52%,47%)", "hsl(0,72%,51%)"];

export default function RevenuePage() {
  const { transactions, loading, error } = useRevenueLedger();

  const stats = useMemo(() => {
    const now = new Date();
    // Only approved transactions count toward revenue anywhere in the app.
    const approved = approvedOnly(transactions);
    const pendingCount = pendingOnly(transactions).length;

    // Last 6 months bar chart
    const last6 = Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(now, 5 - i);
      const ms = startOfMonth(d);
      const me = endOfMonth(d);
      const monthTxns = inRange(approved, ms, me);
      const byCat = sumByCategory(monthTxns);
      return { month: format(d, "MMM"), rooms: byCat.room, sales: byCat.sales, restaurant: byCat.restaurant, bar: byCat.bar, laundry: byCat.laundry };
    });

    // This month
    const ms = startOfMonth(now);
    const me = endOfMonth(now);
    const monthTxns = inRange(approved, ms, me);
    const byCat = sumByCategory(monthTxns);
    const monthTotal = sumAmount(monthTxns);

    const breakdown = [
      { name: "Room Revenue", value: byCat.room },
      { name: "Sales", value: byCat.sales },
      { name: "Restaurant", value: byCat.restaurant },
      { name: "Bar", value: byCat.bar },
      { name: "Laundry", value: byCat.laundry },
    ].filter(b => b.value > 0);

    // Daily for current month
    const days = eachDayOfInterval({ start: ms, end: now });
    const dailyData = days.map(day => {
      const dayTxns = monthTxns.filter(t => t.date && format(t.date, "yyyy-MM-dd") === format(day, "yyyy-MM-dd"));
      return { date: format(day, "d"), revenue: sumAmount(dayTxns) };
    });

    return { last6, monthRoomRev: byCat.room, monthSalesRev: byCat.sales, monthOrdersRev: byCat.restaurant, monthBarRev: byCat.bar, monthLaundryRev: byCat.laundry, monthTotal, breakdown, dailyData, pendingCount };
  }, [transactions]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold">Revenue</h1>
          <p className="text-muted-foreground text-sm">{format(new Date(), "MMMM yyyy")} · Approved revenue only</p>
        </div>
        {stats.pendingCount > 0 && (
          <Link href="/admin/approvals">
            <Button variant="outline" size="sm" className="gap-2 text-amber-600 border-amber-300">
              <Clock className="w-4 h-4" />{stats.pendingCount} pending approval{stats.pendingCount === 1 ? "" : "s"}
            </Button>
          </Link>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <DataError message="We couldn't load revenue data." />
      ) : (
      <>
      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total This Month", value: formatCurrency(stats.monthTotal), icon: TrendingUp, color: "text-primary" },
          { label: "Room Revenue", value: formatCurrency(stats.monthRoomRev), icon: BedDouble, color: "text-blue-600" },
          { label: "Sales Revenue", value: formatCurrency(stats.monthSalesRev), icon: ShoppingCart, color: "text-green-600" },
          { label: "Restaurant Revenue", value: formatCurrency(stats.monthOrdersRev), icon: Coffee, color: "text-orange-600" },
          { label: "Bar Revenue", value: formatCurrency(stats.monthBarRev), icon: Wine, color: "text-fuchsia-600" },
          { label: "Laundry Revenue", value: formatCurrency(stats.monthLaundryRev), icon: Shirt, color: "text-cyan-600" },
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Monthly daily chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-base">Daily Revenue — {format(new Date(), "MMMM")}</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={stats.dailyData} margin={{top:5,right:5,bottom:0,left:0}}>
                <defs>
                  <linearGradient id="revG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(220,55%,28%)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(220,55%,28%)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{fontSize:11}} tickLine={false} />
                <YAxis tick={{fontSize:11}} tickFormatter={v=>`₦${v}`} tickLine={false} width={55} />
                <Tooltip formatter={(v:number) => [formatCurrency(v),"Revenue"]} />
                <Area type="monotone" dataKey="revenue" stroke="hsl(220,55%,28%)" fill="url(#revG)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Breakdown pie */}
        {stats.breakdown.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Revenue Mix</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={stats.breakdown} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value">
                    {stats.breakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v:number) => [formatCurrency(v)]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {stats.breakdown.map((b, i) => (
                  <div key={b.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{background: COLORS[i % COLORS.length]}} />
                      <span>{b.name}</span>
                    </div>
                    <span className="font-medium">{formatCurrency(b.value)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* 6-month bar chart */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Revenue by Source — Last 6 Months</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stats.last6} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="month" tick={{fontSize:11}} tickLine={false} />
              <YAxis tick={{fontSize:11}} tickFormatter={v=>`₦${v}`} tickLine={false} width={55} />
              <Tooltip formatter={(v:number,name:string) => [formatCurrency(v), name.charAt(0).toUpperCase()+name.slice(1)]} />
              <Legend />
              <Bar dataKey="rooms" name="Rooms" fill="hsl(220,55%,28%)" radius={[3,3,0,0]} />
              <Bar dataKey="sales" name="Sales" fill="hsl(38,55%,45%)" radius={[3,3,0,0]} />
              <Bar dataKey="restaurant" name="Restaurant" fill="hsl(158,64%,40%)" radius={[3,3,0,0]} />
              <Bar dataKey="bar" name="Bar" fill="hsl(292,55%,50%)" radius={[3,3,0,0]} />
              <Bar dataKey="laundry" name="Laundry" fill="hsl(190,65%,45%)" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      </>
      )}
    </div>
  );
}
