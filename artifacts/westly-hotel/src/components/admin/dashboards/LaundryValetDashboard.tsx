import { useAuth } from "@/contexts/AuthContext";
import { useCollection } from "@/hooks/useFirebase";
import { where } from "firebase/firestore";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { Shirt, History } from "lucide-react";
import { toFirestoreDate } from "@/lib/utils";
import { DataError } from "@/components/ui/data-error";
import { format, startOfDay, endOfDay } from "date-fns";

const ACTIVE_STATUSES = ["received", "washing", "drying", "ironing", "ready"];

export default function LaundryValetDashboard() {
  const { adminUser } = useAuth();
  const { data: requests, loading, error } = useCollection("laundry_requests", adminUser ? [where("laundryValetId", "==", adminUser.id)] : []);

  const now = new Date();
  const active = requests.filter((r: any) => ACTIVE_STATUSES.includes(r.status));
  const readyForCollection = requests.filter((r: any) => r.status === "ready");
  const deliveredToday = requests.filter((r: any) => {
    const d = toFirestoreDate((r as any).deliveredAt);
    return r.status === "delivered" && d && d >= startOfDay(now) && d <= endOfDay(now);
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold">Laundry</h1>
        <p className="text-muted-foreground text-sm">Welcome, {adminUser?.name} · {format(now, "EEEE, MMMM d")}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Link href="/admin/laundry">
          <button className="w-full flex flex-col items-center justify-center gap-2 p-8 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
            <Shirt className="w-8 h-8" />
            <span className="font-semibold">Manage Laundry</span>
          </button>
        </Link>
        <Link href="/admin/laundry/history">
          <button className="w-full flex flex-col items-center justify-center gap-2 p-8 rounded-xl bg-muted hover:bg-muted/80 transition-colors">
            <History className="w-8 h-8 text-muted-foreground" />
            <span className="font-semibold">History</span>
          </button>
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <DataError message="We couldn't load your laundry requests." />
      ) : (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Active Requests", value: active.length, color: "text-blue-600" },
          { label: "Ready for Collection", value: readyForCollection.length, color: "text-orange-600" },
          { label: "Delivered Today", value: deliveredToday.length, color: "text-green-600" },
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
