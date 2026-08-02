import { useAuth } from "@/contexts/AuthContext";
import { useCollection } from "@/hooks/useFirebase";
import { where } from "firebase/firestore";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { Wine, History } from "lucide-react";
import { formatCurrency, toFirestoreDate } from "@/lib/utils";
import { DataError } from "@/components/ui/data-error";
import { format, startOfDay, endOfDay } from "date-fns";

export default function BarAttendantDashboard() {
  const { adminUser } = useAuth();
  const { data: orders, loading, error } = useCollection("bar_orders", adminUser ? [where("barAttendantId", "==", adminUser.id)] : []);

  const now = new Date();
  const todayOrders = orders.filter(o => {
    const d = toFirestoreDate((o as any).createdAt);
    return d && d >= startOfDay(now) && d <= endOfDay(now);
  });
  const pendingOrders = orders.filter(o => (o as any).status === "pending");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold">Bar</h1>
        <p className="text-muted-foreground text-sm">Welcome, {adminUser?.name} · {format(now, "EEEE, MMMM d")}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Link href="/admin/bar/new-sale">
          <button className="w-full flex flex-col items-center justify-center gap-2 p-8 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
            <Wine className="w-8 h-8" />
            <span className="font-semibold">New Sale</span>
          </button>
        </Link>
        <Link href="/admin/bar/sales-history">
          <button className="w-full flex flex-col items-center justify-center gap-2 p-8 rounded-xl bg-muted hover:bg-muted/80 transition-colors">
            <History className="w-8 h-8 text-muted-foreground" />
            <span className="font-semibold">Sales History</span>
          </button>
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <DataError message="We couldn't load your bar sales." />
      ) : (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Today's Sales", value: todayOrders.length, color: "text-blue-600" },
          { label: "Pending", value: pendingOrders.length, color: "text-orange-600" },
          { label: "Today's Revenue", value: formatCurrency(todayOrders.reduce((s: number, o: any) => s + (o.total || 0), 0)), color: "text-green-600" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-4 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      )}
    </div>
  );
}
