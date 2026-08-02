import { useCollection } from "@/hooks/useFirebase";
import { useRoomStatus } from "@/hooks/useRealtime";
import { where } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Sparkles, Wrench, AlertTriangle, CheckCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { DataError } from "@/components/ui/data-error";

export default function HousekeepingDashboard() {
  const { adminUser } = useAuth();
  const roomStatus = useRoomStatus();
  const { data: rooms, loading: l1, error: e1 } = useCollection("rooms");
  const { data: maintenance, loading: l2, error: e2 } = useCollection("maintenance", [where("status", "==", "open")]);
  const dashLoading = l1 || l2;
  const dashError = e1 || e2;

  const cleaningRooms = rooms.filter((r: any) => r.status === "cleaning");
  const maintenanceRooms = rooms.filter((r: any) => r.status === "maintenance");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold">Housekeeping</h1>
        <p className="text-muted-foreground text-sm">Welcome, {adminUser?.name} · {format(new Date(), "EEEE, MMMM d")}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Needs Cleaning", value: roomStatus.cleaning, color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-900/10" },
          { label: "Available", value: roomStatus.available, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/10" },
          { label: "Maintenance", value: roomStatus.maintenance, color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-900/10" },
          { label: "Open Requests", value: maintenance.length, color: "text-red-600", bg: "bg-red-50 dark:bg-red-900/10" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className={`p-4 ${s.bg}`}>
              <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/admin/housekeeping">
          <button className="w-full flex flex-col items-center justify-center gap-2 p-6 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
            <Sparkles className="w-6 h-6" />
            <span className="font-medium">Room Cleaning</span>
          </button>
        </Link>
        <Link href="/admin/maintenance">
          <button className="w-full flex flex-col items-center justify-center gap-2 p-6 rounded-xl bg-muted hover:bg-muted/80 transition-colors">
            <Wrench className="w-6 h-6" />
            <span className="font-medium">Maintenance</span>
          </button>
        </Link>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-yellow-500" /> Rooms Needing Cleaning
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dashLoading ? (
            <div className="flex items-center justify-center h-24">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : dashError ? (
            <DataError message="We couldn't load room status." />
          ) : cleaningRooms.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-4 text-green-600">
              <CheckCircle className="w-5 h-5" />
              <span className="text-sm">All rooms are clean!</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {cleaningRooms.map((room: any) => (
                <div key={room.id} className="flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-900/10 rounded-lg">
                  <div>
                    <p className="text-sm font-semibold">Room {room.number}</p>
                    <p className="text-xs text-muted-foreground">{room.type}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] border-yellow-400 text-yellow-700">Cleaning</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
