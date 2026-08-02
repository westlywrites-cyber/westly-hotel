import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCollection } from "@/hooks/useFirebase";
import { useRoomStatus, useActivityFeed } from "@/hooks/useRealtime";
import { where, orderBy, limit } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  BedDouble, Users, CalendarCheck, Banknote, TrendingUp,
  RefreshCw, CheckSquare, Clock, AlertTriangle, Activity,
  ArrowUpRight, Sparkles, Wrench
} from "lucide-react";
import { formatCurrency, formatDate, toFirestoreDate, timeAgo } from "@/lib/utils";
import { useRevenueLedger, approvedOnly, inRange, sumAmount } from "@/lib/revenue";
import { DataError } from "@/components/ui/data-error";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar
} from "recharts";
import { startOfMonth, endOfMonth, subMonths, format, eachDayOfInterval, startOfDay, endOfDay } from "date-fns";

export default function SuperAdminDashboard() {
  const { adminUser } = useAuth();
  const roomStatus = useRoomStatus();
  const activityFeed = useActivityFeed(8);

  // Real data from Firestore
  const { data: rooms, loading: l1, error: e1 } = useCollection("rooms");
  const { data: bookings, loading: l2, error: e2 } = useCollection("bookings", [where("isDeleted", "!=", true)]);
  const { data: expenses, loading: l3, error: e3 } = useCollection("expenses");
  // Same unified ledger (payments + sales + orders, approved-only) that the
  // Finance pages build on — this is what keeps the Dashboard's revenue
  // figure identical to Financial Reports / Revenue / Accountant views, and
  // it updates live via onSnapshot the instant a transaction is approved.
  const { transactions, loading: l4, error: e4 } = useRevenueLedger();
  const dashLoading = l1 || l2 || l3 || l4;
  const dashError = e1 || e2 || e3 || e4;

  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    // Room counts
    const totalRooms = rooms.length;
    const occupiedRooms = rooms.filter(r => (r as any).status === "occupied").length;
    const occupancyRate = totalRooms ? Math.round((occupiedRooms / totalRooms) * 100) : 0;

    // Bookings
    const pendingBookings = bookings.filter(b => (b as any).status === "pending").length;
    const todayCheckIns = bookings.filter(b => {
      const ci = toFirestoreDate((b as any).checkIn);
      return ci && ci >= startOfDay(now) && ci <= endOfDay(now);
    }).length;
    const todayCheckOuts = bookings.filter(b => {
      const co = toFirestoreDate((b as any).checkOut);
      return co && co >= startOfDay(now) && co <= endOfDay(now);
    }).length;

    // Revenue: approved payments + sales + orders this month, from the same
    // ledger and the same approvalStatus filter as every Finance page — a
    // transaction only counts once an Accountant has approved it.
    const approvedTxns = approvedOnly(transactions);
    const monthTxns = inRange(approvedTxns, monthStart, monthEnd);
    const totalRevenue = sumAmount(monthTxns);

    // Total expenses this month (excluding soft-deleted, same as Financial Reports)
    const totalExpenses = expenses.filter(e => {
      const d = toFirestoreDate((e as any).date);
      return d && d >= monthStart && d <= monthEnd && !(e as any).isDeleted;
    }).reduce((sum, e) => sum + ((e as any).amount || 0), 0);

    const netProfit = totalRevenue - totalExpenses;

    // Revenue last 7 days — same approved ledger, grouped by day
    const last7Days = eachDayOfInterval({
      start: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000),
      end: now,
    });
    const dailyRevenue = last7Days.map(day => {
      const dayRevenue = sumAmount(approvedTxns.filter(t => t.date && format(t.date, "yyyy-MM-dd") === format(day, "yyyy-MM-dd")));
      return { date: format(day, "MMM d"), revenue: dayRevenue };
    });

    // Last 5 bookings
    const recentBookings = [...bookings]
      .sort((a, b) => {
        const ta = toFirestoreDate((a as any).createdAt)?.getTime() ?? 0;
        const tb = toFirestoreDate((b as any).createdAt)?.getTime() ?? 0;
        return tb - ta;
      })
      .slice(0, 5);

    return {
      totalRooms, occupiedRooms, occupancyRate,
      pendingBookings, todayCheckIns, todayCheckOuts,
      totalRevenue, totalExpenses, netProfit,
      dailyRevenue, recentBookings,
    };
  }, [rooms, bookings, expenses, transactions]);

  const statusCards = [
    { label: "Available", count: roomStatus.available, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/20" },
    { label: "Occupied", count: roomStatus.occupied, color: "text-red-600", bg: "bg-red-50 dark:bg-red-900/20" },
    { label: "Cleaning", count: roomStatus.cleaning, color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-900/20" },
    { label: "Maintenance", count: roomStatus.maintenance, color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-900/20" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold">Good day, {adminUser?.name?.split(" ")[0]} 👋</h1>
          <p className="text-muted-foreground text-sm">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
        </div>
        <Link href="/admin/bookings">
          <Button size="sm">
            <CalendarCheck className="w-4 h-4 mr-2" /> View Bookings
          </Button>
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
      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Revenue (Month)</p>
                <p className="text-2xl font-bold mt-1">{formatCurrency(stats.totalRevenue)}</p>
                <p className="text-xs text-muted-foreground mt-1">Net: {formatCurrency(stats.netProfit)}</p>
              </div>
              <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center">
                <Banknote className="w-5 h-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Occupancy Rate</p>
                <p className="text-2xl font-bold mt-1">{stats.occupancyRate}%</p>
                <p className="text-xs text-muted-foreground mt-1">{stats.occupiedRooms}/{stats.totalRooms} rooms</p>
              </div>
              <div className="w-9 h-9 bg-secondary/20 rounded-lg flex items-center justify-center">
                <BedDouble className="w-5 h-5 text-secondary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Today's Activity</p>
                <p className="text-2xl font-bold mt-1">{stats.todayCheckIns + stats.todayCheckOuts}</p>
                <p className="text-xs text-muted-foreground mt-1">↑{stats.todayCheckIns} in · ↓{stats.todayCheckOuts} out</p>
              </div>
              <div className="w-9 h-9 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
                <Activity className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Pending Approvals</p>
                <p className="text-2xl font-bold mt-1">{stats.pendingBookings}</p>
                <p className="text-xs text-muted-foreground mt-1">Bookings awaiting review</p>
              </div>
              <div className="w-9 h-9 bg-orange-50 dark:bg-orange-900/20 rounded-lg flex items-center justify-center">
                <Clock className="w-5 h-5 text-orange-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Room Status Grid */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Live Room Status</CardTitle>
            <Link href="/admin/rooms">
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                Manage <ArrowUpRight className="w-3 h-3" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {statusCards.map(s => (
              <div key={s.label} className={`rounded-xl p-4 ${s.bg}`}>
                <p className={`text-3xl font-bold ${s.color}`}>{s.count}</p>
                <p className="text-sm text-muted-foreground mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Revenue Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Revenue — Last 7 Days</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={stats.dailyRevenue} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(220, 55%, 28%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(220, 55%, 28%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} tickLine={false} width={50} />
                <Tooltip formatter={(v: number) => [formatCurrency(v), "Revenue"]} />
                <Area type="monotone" dataKey="revenue" stroke="hsl(220,55%,28%)" fill="url(#revGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Recent Bookings */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Recent Bookings</CardTitle>
              <Link href="/admin/bookings">
                <Button variant="ghost" size="sm" className="h-7 text-xs">View all</Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {stats.recentBookings.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No bookings yet</p>
            ) : (
              <div className="space-y-2">
                {stats.recentBookings.map((booking: any) => (
                  <div key={booking.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-primary">{booking.guestName?.[0]?.toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{booking.guestName || "Guest"}</p>
                      <p className="text-xs text-muted-foreground">Room {booking.roomNumber} · {formatDate(toFirestoreDate(booking.checkIn))}</p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] shrink-0 ${
                        booking.status === "confirmed" ? "border-green-500 text-green-600" :
                        booking.status === "checked_in" ? "border-blue-500 text-blue-600" :
                        booking.status === "pending" ? "border-yellow-500 text-yellow-600" :
                        "border-muted text-muted-foreground"
                      }`}
                    >
                      {booking.status?.replace("_", " ")}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      </>
      )}

      {/* Activity Feed */}
      {activityFeed.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4" /> Live Activity Feed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {activityFeed.map((item, i) => (
                <div key={i} className="flex items-start gap-3 text-sm py-1.5 border-b border-border last:border-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                  <span className="flex-1 text-muted-foreground">{item.message}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{timeAgo(item.timestamp)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
