import { useAuth } from "@/contexts/AuthContext";
import { useCollection } from "@/hooks/useFirebase";
import { where } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ShoppingCart, History, Package, AlertTriangle } from "lucide-react";
import { formatCurrency, toFirestoreDate } from "@/lib/utils";
import { DataError } from "@/components/ui/data-error";
import { format, startOfDay, endOfDay } from "date-fns";

export default function StaffDashboard() {
  const { adminUser } = useAuth();
  const { data: sales, loading: l1, error: e1 } = useCollection("sales", adminUser ? [where("staffId", "==", adminUser.id)] : []);
  const { data: inventory, loading: l2, error: e2 } = useCollection("inventory");
  const dashLoading = l1 || l2;
  const dashError = e1 || e2;

  const todaySales = sales.filter(s => {
    const d = toFirestoreDate((s as any).createdAt);
    const now = new Date();
    return d && d >= startOfDay(now) && d <= endOfDay(now);
  });

  const lowStock = inventory.filter((i: any) => i.quantity <= i.minStock).slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold">My Dashboard</h1>
        <p className="text-muted-foreground text-sm">Welcome, {adminUser?.name} · {format(new Date(), "EEEE, MMMM d")}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Link href="/admin/sales/new">
          <button className="w-full flex flex-col items-center justify-center gap-2 p-8 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
            <ShoppingCart className="w-8 h-8" />
            <span className="font-semibold">New Sale</span>
          </button>
        </Link>
        <Link href="/admin/sales/history">
          <button className="w-full flex flex-col items-center justify-center gap-2 p-8 rounded-xl bg-muted hover:bg-muted/80 transition-colors">
            <History className="w-8 h-8 text-muted-foreground" />
            <span className="font-semibold">Sales History</span>
          </button>
        </Link>
      </div>

      {dashLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : dashError ? (
        <DataError message="We couldn't load some dashboard data." />
      ) : (
      <>
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Today's Sales</p>
            <p className="text-2xl font-bold text-primary mt-1">{todaySales.length}</p>
            <p className="text-sm text-muted-foreground">{formatCurrency(todaySales.reduce((s, sale: any) => s + (sale.total || 0), 0))}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Total My Sales</p>
            <p className="text-2xl font-bold text-primary mt-1">{sales.length}</p>
            <p className="text-sm text-muted-foreground">{formatCurrency(sales.reduce((s: number, sale: any) => s + (sale.total || 0), 0))}</p>
          </CardContent>
        </Card>
      </div>

      {lowStock.length > 0 && (
        <Card className="border-orange-200 bg-orange-50 dark:bg-orange-900/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-orange-700 dark:text-orange-400">
              <AlertTriangle className="w-4 h-4" /> Low Stock
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {lowStock.map((item: any) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span>{item.name}</span>
                  <span className="text-orange-600 font-medium">{item.quantity} left</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      </>
      )}
    </div>
  );
}
