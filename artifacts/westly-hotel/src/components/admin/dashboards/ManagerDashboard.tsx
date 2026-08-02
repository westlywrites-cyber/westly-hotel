import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCollection } from "@/hooks/useFirebase";
import { useRoomStatus } from "@/hooks/useRealtime";
import { where } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { BedDouble, CalendarCheck, Users, TrendingUp, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { formatCurrency, toFirestoreDate, formatDate } from "@/lib/utils";
import { DataError } from "@/components/ui/data-error";
import { format, startOfDay as fnsStartOfDay, endOfDay as fnsEndOfDay } from "date-fns";

// using @/lib/utils partial
import { nightsBetween } from "@/lib/utils";

export default function ManagerDashboard() {
  const { adminUser } = useAuth();
  const roomStatus = useRoomStatus();
  const { data: bookings, loading: l1, error: e1 } = useCollection("bookings", [where("isDeleted", "!=", true)]);
  const { data: rooms, loading: l2, error: e2 } = useCollection("rooms");
  const { data: inventory, loading: l3, error: e3 } = useCollection("inventory");
  const dashLoading = l1 || l2 || l3;
  const dashError = e1 || e2 || e3;

  const stats = useMemo(() => {
    const now = new Date();
    const today = fnsStartOfDay(now);
    const todayEnd = fnsEndOfDay(now);

    const todayCheckIns = bookings.filter(b => {
      const ci = toFirestoreDate((b as any).checkIn);
      return ci && ci >= today && ci <= todayEnd;
    });
    const todayCheckOuts = bookings.filter(b => {
      const co = toFirestoreDate((b as any).checkOut);
      return co && co >= today && co <= todayEnd;
    });
    const pendingBookings = bookings.filter(b => (b as any).status === "pending");
    const lowStockItems = inventory.filter(i => (i as any).quantity <= (i as any).minStock);

    return { todayCheckIns, todayCheckOuts, pendingBookings, lowStockItems };
  }, [bookings, inventory]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold">Manager Dashboard</h1>
        <p className="text-muted-foreground text-sm">Welcome, {adminUser?.name} · {format(new Date(), "EEEE, MMMM d")}</p>
      </div>

      {dashLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : dashError ? (
        <DataError message="We couldn't load some dashboard data." />
      ) : (
      <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Available Rooms", value: roomStatus.available, icon: BedDouble, color: "text-green-600" },
          { label: "Today Check-Ins", value: stats.todayCheckIns.length, icon: CalendarCheck, color: "text-blue-600" },
          { label: "Today Check-Outs", value: stats.todayCheckOuts.length, icon: CalendarCheck, color: "text-orange-600" },
          { label: "Pending Approvals", value: stats.pendingBookings.length, icon: Clock, color: "text-yellow-600" },
        ].map(card => (
          <Card key={card.label}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                  <p className={`text-3xl font-bold mt-1 ${card.color}`}>{card.value}</p>
                </div>
                <card.icon className={`w-5 h-5 ${card.color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {stats.lowStockItems.length > 0 && (
        <Card className="border-orange-200 bg-orange-50 dark:bg-orange-900/10 dark:border-orange-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-orange-700 dark:text-orange-400">
              <AlertTriangle className="w-4 h-4" /> Low Stock Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {stats.lowStockItems.map((item: any) => (
                <Badge key={item.id} variant="outline" className="border-orange-400 text-orange-700 text-xs">
                  {item.name}: {item.quantity} left
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Today's Check-Ins</CardTitle></CardHeader>
          <CardContent>
            {stats.todayCheckIns.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No check-ins today</p>
            ) : (
              <div className="space-y-2">
                {stats.todayCheckIns.slice(0, 5).map((b: any) => (
                  <div key={b.id} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                    <div>
                      <p className="text-sm font-medium">{b.guestName}</p>
                      <p className="text-xs text-muted-foreground">Room {b.roomNumber}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">{b.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Pending Bookings</CardTitle></CardHeader>
          <CardContent>
            {stats.pendingBookings.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No pending bookings</p>
            ) : (
              <div className="space-y-2">
                {stats.pendingBookings.slice(0, 5).map((b: any) => (
                  <div key={b.id} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                    <div>
                      <p className="text-sm font-medium">{b.guestName}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(toFirestoreDate(b.checkIn))}</p>
                    </div>
                    <Link href="/admin/bookings">
                      <Button variant="outline" size="sm" className="h-7 text-xs">Review</Button>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      </>
      )}
    </div>
  );
}
