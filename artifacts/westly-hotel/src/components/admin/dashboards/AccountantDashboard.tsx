import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCollection } from "@/hooks/useFirebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Banknote, TrendingUp, TrendingDown, Receipt, BarChart2, Clock } from "lucide-react";
import { formatCurrency, toFirestoreDate } from "@/lib/utils";
import { DataError } from "@/components/ui/data-error";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useRevenueLedger, approvedOnly, pendingOnly, inRange, sumAmount } from "@/lib/revenue";

export default function AccountantDashboard() {
  const { adminUser } = useAuth();
  const { transactions, loading: l1, error: e1 } = useRevenueLedger();
  const { data: expenses, loading: l2, error: e2 } = useCollection("expenses");
  const dashLoading = l1 || l2;
  const dashError = e1 || e2;

  const stats = useMemo(() => {
    const now = new Date();
    const ms = startOfMonth(now);
    const me = endOfMonth(now);
    const approved = approvedOnly(transactions);
    const pendingCount = pendingOnly(transactions).length;

    const monthRevenue = sumAmount(inRange(approved, ms, me));

    const monthExpenses = expenses.filter((e: any) => {
      const d = toFirestoreDate(e.date);
      return d && d >= ms && d <= me && !e.isDeleted;
    }).reduce((sum: number, e: any) => sum + (e.amount || 0), 0);

    const netProfit = monthRevenue - monthExpenses;
    const margin = monthRevenue ? Math.round((netProfit / monthRevenue) * 100) : 0;

    // Last 6 months breakdown
    const last6 = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const ms2 = startOfMonth(d);
      const me2 = endOfMonth(d);
      const rev = sumAmount(inRange(approved, ms2, me2));
      const exp = expenses.filter((e: any) => { const dd = toFirestoreDate(e.date); return dd && dd >= ms2 && dd <= me2 && !e.isDeleted; }).reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
      return { month: format(d, "MMM"), revenue: rev, expenses: exp };
    });

    return { monthRevenue, monthExpenses, netProfit, margin, last6, pendingCount };
  }, [transactions, expenses]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-2xl font-bold">Finance Overview</h1>
          <p className="text-muted-foreground text-sm">Welcome, {adminUser?.name} · {format(new Date(), "MMMM yyyy")}</p>
        </div>
        {stats.pendingCount > 0 && (
          <Link href="/admin/approvals">
            <Button className="gap-2 bg-amber-600 hover:bg-amber-700">
              <Clock className="w-4 h-4" />{stats.pendingCount} payment{stats.pendingCount === 1 ? "" : "s"} awaiting your approval
            </Button>
          </Link>
        )}
      </div>

      {dashLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : dashError ? (
        <DataError message="We couldn't load some financial data." />
      ) : (
      <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Monthly Revenue", value: formatCurrency(stats.monthRevenue), icon: TrendingUp, color: "text-green-600" },
          { label: "Monthly Expenses", value: formatCurrency(stats.monthExpenses), icon: TrendingDown, color: "text-red-500" },
          { label: "Net Profit", value: formatCurrency(stats.netProfit), icon: Banknote, color: stats.netProfit >= 0 ? "text-blue-600" : "text-red-600" },
          { label: "Profit Margin", value: `${stats.margin}%`, icon: BarChart2, color: "text-purple-600" },
        ].map(card => (
          <Card key={card.label}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                  <p className={`text-xl font-bold mt-1 ${card.color}`}>{card.value}</p>
                </div>
                <card.icon className={`w-5 h-5 ${card.color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Revenue vs Expenses (6 Months)</CardTitle>
            <Link href="/admin/financial-reports">
              <Button variant="ghost" size="sm" className="h-7 text-xs">Full Report</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stats.last6} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₦${v}`} tickLine={false} width={55} />
              <Tooltip formatter={(v: number, name: string) => [formatCurrency(v), name === "revenue" ? "Revenue" : "Expenses"]} />
              <Bar dataKey="revenue" fill="hsl(220,55%,28%)" radius={[3,3,0,0]} />
              <Bar dataKey="expenses" fill="hsl(0,65%,56%)" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      </>
      )}

      <div className="flex gap-3 flex-wrap">
        <Link href="/admin/approvals"><Button variant="outline" className="gap-2"><Clock className="w-4 h-4" />Approvals{stats.pendingCount > 0 ? ` (${stats.pendingCount})` : ""}</Button></Link>
        <Link href="/admin/expenses"><Button variant="outline" className="gap-2"><Receipt className="w-4 h-4" />Record Expense</Button></Link>
        <Link href="/admin/revenue"><Button variant="outline" className="gap-2"><TrendingUp className="w-4 h-4" />Revenue Details</Button></Link>
        <Link href="/admin/financial-reports"><Button variant="outline" className="gap-2"><BarChart2 className="w-4 h-4" />Generate Report</Button></Link>
      </div>
    </div>
  );
}
