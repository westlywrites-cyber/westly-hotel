import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCollection } from "@/hooks/useFirebase";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DoorOpen, Sparkles, Wrench, Coffee, Wine, Shirt, LogIn, LogOut,
  ClipboardList, Users, AlertTriangle, Plus, ArrowRight, CalendarCheck2, CalendarClock,
} from "lucide-react";
import { toFirestoreDate } from "@/lib/utils";
import { format } from "date-fns";
import TaskAssignDialog from "@/components/admin/TaskAssignDialog";

export default function OperationsManagerDashboard() {
  const { adminUser } = useAuth();
  const { data: rooms, loading: lRooms } = useCollection<any>("rooms");
  const { data: bookings, loading: lBookings } = useCollection<any>("bookings");
  const { data: orders, loading: lOrders } = useCollection<any>("orders");
  const { data: barOrders, loading: lBar } = useCollection<any>("bar_orders");
  const { data: laundry, loading: lLaundry } = useCollection<any>("laundry_requests");
  const { data: maintenance, loading: lMaint } = useCollection<any>("maintenance");
  const { data: attendance, loading: lAtt } = useCollection<any>("attendance");
  const { data: tasks, loading: lTasks } = useCollection<any>("tasks");

  const [showAssign, setShowAssign] = useState<{ type?: any; title?: string; relatedCollection?: string; relatedId?: string; relatedLabel?: string } | null>(null);

  const loading = lRooms || lBookings || lOrders || lBar || lLaundry || lMaint || lAtt || lTasks;
  const today = format(new Date(), "yyyy-MM-dd");

  const roomStats = useMemo(() => {
    const active = rooms.filter((r: any) => !r.isDeleted);
    return {
      total: active.length,
      available: active.filter((r: any) => r.status === "available").length,
      occupied: active.filter((r: any) => r.status === "occupied").length,
      cleaning: active.filter((r: any) => r.status === "cleaning").length,
      maintenance: active.filter((r: any) => r.status === "maintenance").length,
      reserved: active.filter((r: any) => r.status === "reserved").length,
    };
  }, [rooms]);

  const dirtyRooms = useMemo(() => rooms.filter((r: any) => !r.isDeleted && r.status === "cleaning"), [rooms]);

  const checkedInToday = useMemo(() => bookings.filter((b: any) => {
    const d = toFirestoreDate(b.checkInAt || b.checkIn);
    return d && format(d, "yyyy-MM-dd") === today;
  }).length, [bookings, today]);

  const checkedOutToday = useMemo(() => bookings.filter((b: any) => {
    const d = toFirestoreDate(b.checkOutAt || b.checkOut);
    return d && format(d, "yyyy-MM-dd") === today;
  }).length, [bookings, today]);

  const pendingRoomReservations = useMemo(
    () => bookings.filter((b: any) => !b.isDeleted && b.status === "pending" && b.source !== "walk_in"),
    [bookings]
  );

  const pendingFoodOrders = useMemo(() => orders.filter((o: any) => !o.isDeleted && o.status === "pending" && (!o.waiterId || o.waiterId === "unassigned")), [orders]);
  const activeFoodOrders = useMemo(() => orders.filter((o: any) => !o.isDeleted && o.status === "pending"), [orders]);
  const activeBarOrders = useMemo(() => barOrders.filter((o: any) => !o.isDeleted && o.status === "pending"), [barOrders]);
  const activeLaundry = useMemo(() => laundry.filter((l: any) => !l.isDeleted && !["delivered", "cancelled"].includes(l.status)), [laundry]);
  const openMaintenance = useMemo(() => maintenance.filter((m: any) => !m.isDeleted && m.status !== "resolved"), [maintenance]);

  const staffOnDuty = useMemo(() => attendance.filter((a: any) => {
    const key = a.dateKey || (toFirestoreDate(a.date) ? format(toFirestoreDate(a.date)!, "yyyy-MM-dd") : null);
    return key === today && a.status === "present";
  }), [attendance, today]);

  const myActiveTasks = useMemo(() => tasks.filter((t: any) => !t.isDeleted && !["completed", "cancelled"].includes(t.status)), [tasks]);
  const overdueTasks = useMemo(() => myActiveTasks.filter((t: any) => t.dueAt && toFirestoreDate(t.dueAt)! < new Date()), [myActiveTasks]);

  const assignRoomToHousekeeping = (room: any) => {
    setShowAssign({
      type: "housekeeping",
      title: `Clean Room ${room.number}`,
      relatedCollection: "rooms",
      relatedId: room.id,
      relatedLabel: `Room ${room.number}`,
    });
  };

  const assignBooking = (booking: any) => {
    setShowAssign({
      type: "booking",
      title: `Confirm & process booking — ${booking.guestName || "Guest"}`,
      relatedCollection: "bookings",
      relatedId: booking.id,
      relatedLabel: booking.roomType ? `${booking.roomType}${booking.checkIn ? ` · ${booking.checkIn}` : ""}` : undefined,
    });
  };

  const assignLaundry = (request: any) => {
    setShowAssign({
      type: "laundry",
      title: `Handle laundry request — ${request.guestName || (request.roomNumber ? `Room ${request.roomNumber}` : "Guest")}`,
      relatedCollection: "laundry_requests",
      relatedId: request.id,
      relatedLabel: request.roomNumber ? `Room ${request.roomNumber}` : undefined,
    });
  };

  const assignOrder = (order: any, kind: "food_order" | "drink_order") => {
    setShowAssign({
      type: kind,
      title: kind === "food_order" ? `Fulfill food order — ${order.customerName || order.roomNumber || order.tableNumber || "Guest"}` : `Fulfill drink order — ${order.customerName || order.roomNumber || order.tableNumber || "Guest"}`,
      relatedCollection: kind === "food_order" ? "orders" : "bar_orders",
      relatedId: order.id,
      relatedLabel: order.roomNumber ? `Room ${order.roomNumber}` : order.tableNumber ? `Table ${order.tableNumber}` : undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold">Operations Overview</h1>
          <p className="text-muted-foreground text-sm">Welcome, {adminUser?.name} · {format(new Date(), "EEEE, MMMM d")}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/shifts"><Button variant="outline" className="gap-2"><CalendarClock className="w-4 h-4" /> Shift Scheduling</Button></Link>
          <Link href="/admin/tasks"><Button variant="outline" className="gap-2"><ClipboardList className="w-4 h-4" /> All Tasks</Button></Link>
          <Button className="gap-2" onClick={() => setShowAssign({})}><Plus className="w-4 h-4" /> Assign Task</Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <>
          {/* Alerts row */}
          {(overdueTasks.length > 0 || openMaintenance.length > 0 || pendingRoomReservations.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {pendingRoomReservations.length > 0 && (
                <Badge variant="outline" className="border-blue-400 text-blue-600 gap-1.5 py-1.5 px-3"><CalendarCheck2 className="w-3.5 h-3.5" /> {pendingRoomReservations.length} unconfirmed reservation{pendingRoomReservations.length !== 1 ? "s" : ""}</Badge>
              )}
              {overdueTasks.length > 0 && (
                <Badge variant="outline" className="border-red-400 text-red-600 gap-1.5 py-1.5 px-3"><AlertTriangle className="w-3.5 h-3.5" /> {overdueTasks.length} overdue task{overdueTasks.length !== 1 ? "s" : ""}</Badge>
              )}
              {openMaintenance.length > 0 && (
                <Badge variant="outline" className="border-orange-400 text-orange-600 gap-1.5 py-1.5 px-3"><Wrench className="w-3.5 h-3.5" /> {openMaintenance.length} open maintenance request{openMaintenance.length !== 1 ? "s" : ""}</Badge>
              )}
            </div>
          )}

          {/* Daily operational summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Rooms Occupied", value: `${roomStats.occupied}/${roomStats.total}`, icon: DoorOpen, color: "text-blue-600" },
              { label: "Check-ins Today", value: checkedInToday, icon: LogIn, color: "text-green-600" },
              { label: "Check-outs Today", value: checkedOutToday, icon: LogOut, color: "text-slate-600" },
              { label: "Staff On Duty", value: staffOnDuty.length, icon: Users, color: "text-indigo-600" },
              { label: "Active Tasks", value: myActiveTasks.length, icon: ClipboardList, color: "text-purple-600" },
              { label: "Open Maintenance", value: openMaintenance.length, icon: Wrench, color: "text-orange-600" },
            ].map(s => (
              <Card key={s.label}>
                <CardContent className="p-3 text-center">
                  <s.icon className={`w-4 h-4 mx-auto mb-1 ${s.color}`} />
                  <p className="text-xl font-bold">{s.value}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Room reservations awaiting front-desk confirmation */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm flex items-center gap-2"><CalendarCheck2 className="w-4 h-4" /> Room Reservations</h3>
                  <Link href="/admin/room-reservations"><span className="text-xs text-primary flex items-center gap-1">View All <ArrowRight className="w-3 h-3" /></span></Link>
                </div>
                <p className="text-xs text-muted-foreground mb-2">{pendingRoomReservations.length} unconfirmed reservation{pendingRoomReservations.length !== 1 ? "s" : ""} awaiting front-desk action</p>
                {pendingRoomReservations.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No unconfirmed reservations.</p>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {pendingRoomReservations.slice(0, 6).map((b: any) => (
                      <div key={b.id} className="flex items-center justify-between text-xs bg-muted/40 rounded-lg px-2.5 py-1.5">
                        <span className="truncate">{b.guestName || "Guest"}{b.roomType ? ` · ${b.roomType}` : ""}</span>
                        <Button size="sm" variant="ghost" className="h-6 text-[11px] gap-1" onClick={() => assignBooking(b)}>
                          <Plus className="w-3 h-3" /> Assign
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Room readiness / housekeeping */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm flex items-center gap-2"><Sparkles className="w-4 h-4" /> Room Readiness</h3>
                  <Link href="/admin/housekeeping"><span className="text-xs text-primary flex items-center gap-1">Housekeeping <ArrowRight className="w-3 h-3" /></span></Link>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center mb-3">
                  <div><p className="text-lg font-bold text-green-600">{roomStats.available}</p><p className="text-[10px] text-muted-foreground">Available</p></div>
                  <div><p className="text-lg font-bold text-blue-600">{roomStats.occupied}</p><p className="text-[10px] text-muted-foreground">Occupied</p></div>
                  <div><p className="text-lg font-bold text-yellow-600">{roomStats.cleaning}</p><p className="text-[10px] text-muted-foreground">Needs Cleaning</p></div>
                  <div><p className="text-lg font-bold text-orange-600">{roomStats.maintenance}</p><p className="text-[10px] text-muted-foreground">Maintenance</p></div>
                </div>
                {dirtyRooms.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No rooms currently awaiting cleaning.</p>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {dirtyRooms.slice(0, 6).map((r: any) => (
                      <div key={r.id} className="flex items-center justify-between text-xs bg-muted/40 rounded-lg px-2.5 py-1.5">
                        <span>Room {r.number}</span>
                        <Button size="sm" variant="ghost" className="h-6 text-[11px] gap-1" onClick={() => assignRoomToHousekeeping(r)}>
                          <Plus className="w-3 h-3" /> Assign
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Maintenance */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm flex items-center gap-2"><Wrench className="w-4 h-4" /> Maintenance</h3>
                  <Link href="/admin/maintenance"><span className="text-xs text-primary flex items-center gap-1">View All <ArrowRight className="w-3 h-3" /></span></Link>
                </div>
                {openMaintenance.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No open maintenance requests.</p>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {openMaintenance.slice(0, 6).map((m: any) => (
                      <div key={m.id} className="flex items-center justify-between text-xs bg-muted/40 rounded-lg px-2.5 py-1.5">
                        <span className="truncate">{m.issue || m.title || m.roomOrArea}</span>
                        <Button size="sm" variant="ghost" className="h-6 text-[11px] gap-1" onClick={() => setShowAssign({ type: "maintenance", title: `Resolve: ${m.issue || m.title || "maintenance issue"}`, relatedCollection: "maintenance", relatedId: m.id, relatedLabel: m.roomOrArea })}>
                          <Plus className="w-3 h-3" /> Assign
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Restaurant */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm flex items-center gap-2"><Coffee className="w-4 h-4" /> Restaurant</h3>
                  <Link href="/admin/orders/history"><span className="text-xs text-primary flex items-center gap-1">View All <ArrowRight className="w-3 h-3" /></span></Link>
                </div>
                <p className="text-xs text-muted-foreground mb-2">{activeFoodOrders.length} active order{activeFoodOrders.length !== 1 ? "s" : ""} · {pendingFoodOrders.length} unassigned</p>
                {pendingFoodOrders.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No unassigned food orders.</p>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {pendingFoodOrders.slice(0, 6).map((o: any) => (
                      <div key={o.id} className="flex items-center justify-between text-xs bg-muted/40 rounded-lg px-2.5 py-1.5">
                        <span className="truncate">{o.customerName || (o.roomNumber ? `Room ${o.roomNumber}` : o.tableNumber ? `Table ${o.tableNumber}` : "Guest")}</span>
                        <Button size="sm" variant="ghost" className="h-6 text-[11px] gap-1" onClick={() => assignOrder(o, "food_order")}>
                          <Plus className="w-3 h-3" /> Assign
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Bar */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm flex items-center gap-2"><Wine className="w-4 h-4" /> Bar</h3>
                  <Link href="/admin/bar/sales-history"><span className="text-xs text-primary flex items-center gap-1">View All <ArrowRight className="w-3 h-3" /></span></Link>
                </div>
                <p className="text-xs text-muted-foreground mb-2">{activeBarOrders.length} pending sale{activeBarOrders.length !== 1 ? "s" : ""}</p>
                {activeBarOrders.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No pending bar sales.</p>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {activeBarOrders.slice(0, 6).map((o: any) => (
                      <div key={o.id} className="flex items-center justify-between text-xs bg-muted/40 rounded-lg px-2.5 py-1.5">
                        <span className="truncate">{o.customerName || (o.roomNumber ? `Room ${o.roomNumber}` : o.tableNumber ? `Table ${o.tableNumber}` : "Guest")}</span>
                        <Button size="sm" variant="ghost" className="h-6 text-[11px] gap-1" onClick={() => assignOrder(o, "drink_order")}>
                          <Plus className="w-3 h-3" /> Assign
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Laundry */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm flex items-center gap-2"><Shirt className="w-4 h-4" /> Laundry</h3>
                  <Link href="/admin/laundry"><span className="text-xs text-primary flex items-center gap-1">View All <ArrowRight className="w-3 h-3" /></span></Link>
                </div>
                <p className="text-xs text-muted-foreground mb-2">{activeLaundry.length} active request{activeLaundry.length !== 1 ? "s" : ""}</p>
                {activeLaundry.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No active laundry requests.</p>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {activeLaundry.slice(0, 6).map((l: any) => (
                      <div key={l.id} className="flex items-center justify-between text-xs bg-muted/40 rounded-lg px-2.5 py-1.5">
                        <span className="truncate">{l.guestName || (l.roomNumber ? `Room ${l.roomNumber}` : "Guest")}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Badge variant="outline" className="text-[10px] capitalize">{l.status}</Badge>
                          <Button size="sm" variant="ghost" className="h-6 text-[11px] gap-1" onClick={() => assignLaundry(l)}>
                            <Plus className="w-3 h-3" /> Assign
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Staff on duty */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm flex items-center gap-2"><Users className="w-4 h-4" /> Staff On Duty</h3>
                  <Link href="/admin/attendance"><span className="text-xs text-primary flex items-center gap-1">Attendance <ArrowRight className="w-3 h-3" /></span></Link>
                </div>
                {staffOnDuty.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No attendance recorded yet today.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {staffOnDuty.slice(0, 10).map((a: any) => (
                      <Badge key={a.id} variant="secondary" className="text-[10px]">{a.staffName}</Badge>
                    ))}
                    {staffOnDuty.length > 10 && <Badge variant="outline" className="text-[10px]">+{staffOnDuty.length - 10} more</Badge>}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <TaskAssignDialog
        open={!!showAssign}
        onOpenChange={(o) => !o && setShowAssign(null)}
        defaults={showAssign ?? undefined}
      />
    </div>
  );
}
