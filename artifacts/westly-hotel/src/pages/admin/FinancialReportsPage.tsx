import { useMemo, useState } from "react";
import { useCollection } from "@/hooks/useFirebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download } from "lucide-react";
import { formatCurrency, toFirestoreDate } from "@/lib/utils";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { useRevenueLedger, approvedOnly, inRange, sumByCategory, sumAmount } from "@/lib/revenue";
import { DataError } from "@/components/ui/data-error";

const COLORS = ["hsl(220,55%,28%)","hsl(38,55%,45%)","hsl(158,64%,40%)","hsl(262,52%,47%)","hsl(0,72%,51%)","hsl(200,70%,50%)"];

export default function FinancialReportsPage() {
  const [month, setMonth] = useState(format(new Date(), "yyyy-MM"));
  const { transactions, loading: txLoading, error: txError } = useRevenueLedger();
  const { data: expenses, loading: expLoading, error: expError } = useCollection("expenses");
  const loading = txLoading || expLoading;
  const error = txError || expError;

  const report = useMemo(() => {
    const [year, mon] = month.split("-").map(Number);
    const ms = startOfMonth(new Date(year, mon - 1, 1));
    const me = endOfMonth(new Date(year, mon - 1, 1));

    // Same ledger, same approved-only filter, same category logic as every
    // other financial page — this is what keeps totals identical across pages.
    const approved = approvedOnly(transactions);
    const monthTxns = inRange(approved, ms, me);
    const byCat = sumByCategory(monthTxns);
    const { room: roomRevenue, restaurant: restaurantRevenue, sales: salesRevenue, bar: barRevenue, laundry: laundryRevenue, other: otherRevenue } = byCat;
    const totalRevenue = sumAmount(monthTxns);

    const monthExpenses = expenses.filter((e: any) => { const d = toFirestoreDate(e.date); return d && d >= ms && d <= me && !e.isDeleted; });
    const expenseByCategory: Record<string, number> = {};
    monthExpenses.forEach((e: any) => { expenseByCategory[e.category || "other"] = (expenseByCategory[e.category || "other"] || 0) + (e.amount || 0); });
    const totalExpenses = Object.values(expenseByCategory).reduce((a, b) => a + b, 0);

    const netProfit = totalRevenue - totalExpenses;
    const margin = totalRevenue ? Math.round((netProfit / totalRevenue) * 100) : 0;

    const revBreakdown = [
      { name: "Room Revenue", value: roomRevenue },
      { name: "Sales", value: salesRevenue },
      { name: "Restaurant", value: restaurantRevenue },
      { name: "Bar", value: barRevenue },
      { name: "Laundry", value: laundryRevenue },
      { name: "Other Income", value: otherRevenue },
    ].filter(b => b.value > 0);

    const expBreakdown = Object.entries(expenseByCategory).map(([cat, val]) => ({
      name: cat.replace("_"," "), value: val
    })).sort((a,b) => b.value - a.value);

    return { roomRevenue, salesRevenue, restaurantRevenue, barRevenue, laundryRevenue, otherRevenue, totalRevenue, totalExpenses, netProfit, margin, revBreakdown, expBreakdown, transactionCount: monthTxns.length };
  }, [transactions, expenses, month]);

  const exportPDF = () => {
    window.print();
  };

  return (
    <div className="space-y-5 print:bg-white">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold">Financial Report</h1>
          <p className="text-muted-foreground text-sm">{format(new Date(month + "-01"), "MMMM yyyy")} · {report.transactionCount} approved transaction{report.transactionCount === 1 ? "" : "s"}</p>
        </div>
        <div className="flex gap-2">
          <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-44" />
          <Button variant="outline" className="gap-2" onClick={exportPDF}><Download className="w-4 h-4" />Print / PDF</Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <DataError message="We couldn't load financial data." />
      ) : (
      <>
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Revenue", value: formatCurrency(report.totalRevenue), color: "text-green-600" },
          { label: "Total Expenses", value: formatCurrency(report.totalExpenses), color: "text-red-500" },
          { label: "Net Profit", value: formatCurrency(report.netProfit), color: report.netProfit >= 0 ? "text-primary" : "text-red-600" },
          { label: "Profit Margin", value: `${report.margin}%`, color: "text-purple-600" },
        ].map(card => (
          <Card key={card.label}>
            <CardContent className="p-5">
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <p className={`text-xl font-bold mt-1 ${card.color}`}>{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Revenue breakdown */}
        {report.revBreakdown.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Revenue Breakdown</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={report.revBreakdown} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value">
                    {report.revBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v:number) => [formatCurrency(v)]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-1">
                {report.revBreakdown.map((b, i) => (
                  <div key={b.name} className="flex justify-between text-xs">
                    <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full" style={{background: COLORS[i % COLORS.length]}} /><span>{b.name}</span></div>
                    <span className="font-medium">{formatCurrency(b.value)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Expense breakdown */}
        {report.expBreakdown.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Expense Breakdown</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {report.expBreakdown.map((b, i) => (
                  <div key={b.name} className="space-y-0.5">
                    <div className="flex justify-between text-xs">
                      <span className="capitalize">{b.name}</span>
                      <span className="font-medium">{formatCurrency(b.value)}</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5">
                      <div className="h-1.5 rounded-full bg-destructive/70" style={{width: `${report.totalExpenses ? Math.round((b.value / report.totalExpenses) * 100) : 0}%`}} />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* P&L Summary table */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Income Statement Summary</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-border"><td className="py-2 text-muted-foreground">Room Revenue</td><td className="py-2 text-right font-medium">{formatCurrency(report.roomRevenue)}</td></tr>
              <tr className="border-b border-border"><td className="py-2 text-muted-foreground">Sales Revenue</td><td className="py-2 text-right font-medium">{formatCurrency(report.salesRevenue)}</td></tr>
              <tr className="border-b border-border"><td className="py-2 text-muted-foreground">Restaurant Revenue</td><td className="py-2 text-right font-medium">{formatCurrency(report.restaurantRevenue)}</td></tr>
              <tr className="border-b border-border"><td className="py-2 text-muted-foreground">Bar Revenue</td><td className="py-2 text-right font-medium">{formatCurrency(report.barRevenue)}</td></tr>
              <tr className="border-b border-border"><td className="py-2 text-muted-foreground">Laundry Revenue</td><td className="py-2 text-right font-medium">{formatCurrency(report.laundryRevenue)}</td></tr>
              {report.otherRevenue > 0 && <tr className="border-b border-border"><td className="py-2 text-muted-foreground">Other Income</td><td className="py-2 text-right font-medium">{formatCurrency(report.otherRevenue)}</td></tr>}
              <tr className="border-b-2 border-border font-bold"><td className="py-2">Total Revenue</td><td className="py-2 text-right text-green-600">{formatCurrency(report.totalRevenue)}</td></tr>
              <tr className="border-b border-border"><td className="py-2 text-muted-foreground">Total Expenses</td><td className="py-2 text-right font-medium text-red-500">({formatCurrency(report.totalExpenses)})</td></tr>
              <tr className="font-bold text-base"><td className="py-3">Net Profit</td><td className={`py-3 text-right ${report.netProfit >= 0 ? "text-primary" : "text-red-600"}`}>{formatCurrency(report.netProfit)}</td></tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
      </>
      )}
    </div>
  );
}
