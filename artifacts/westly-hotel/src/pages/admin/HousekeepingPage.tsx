import { useAuth } from "@/contexts/AuthContext";
import { useCollection } from "@/hooks/useFirebase";
import { doc, updateDoc, addDoc, collection, serverTimestamp, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { updateRoomStatus } from "@/lib/roomLogic";
import { logAction } from "@/lib/audit";
import { notifyHousekeepingDone, notifyMaintenanceRequest } from "@/lib/notifications";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { usePinTaskComplete } from "@/hooks/usePinTaskComplete";
import { Sparkles, CheckCircle, BedDouble, Clock, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useState } from "react";
import { DataError } from "@/components/ui/data-error";
import { PinSessionEndingOverlay } from "@/components/admin/PinSessionEndingOverlay";

export default function HousekeepingPage() {
  const { adminUser, role } = useAuth();
  const { toast } = useToast();
  const { isPinSession, endingSession, notifyTaskComplete } = usePinTaskComplete();
  const { data: rooms, loading, error } = useCollection("rooms", [where("isDeleted", "!=", true)]);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Show cleaning and available rooms (housekeeping concern)
  const cleaningRooms = rooms.filter((r: any) => r.status === "cleaning");
  const allRooms = rooms.filter((r: any) => ["cleaning", "available", "maintenance"].includes(r.status));

  const markClean = async (room: any) => {
    if (!adminUser) return;
    setBusyId(room.id);
    try {
      await updateRoomStatus(room.id, "available");
      // Log the housekeeping task
      await addDoc(collection(db, "housekeeping_tasks"), {
        roomId: room.id,
        roomNumber: room.number,
        type: "cleaning",
        status: "completed",
        completedBy: adminUser.id,
        completedByName: adminUser.name,
        completedAt: serverTimestamp(),
        isDeleted: false,
      });
      await logAction(adminUser.id, adminUser.name, "room_cleaned", "rooms", room.id, { status: "cleaning" }, { status: "available" }, role ?? undefined);
      toast({ title: "Room Marked Clean", description: `Room ${room.number} is now available.` });
      notifyHousekeepingDone(room.number, adminUser.name).catch(() => {});
      notifyTaskComplete();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setBusyId(null);
  };

  const markMaintenance = async (room: any) => {
    if (!adminUser) return;
    setBusyId(room.id);
    try {
      await updateRoomStatus(room.id, "maintenance");
      await logAction(adminUser.id, adminUser.name, "room_maintenance", "rooms", room.id, { status: room.status }, { status: "maintenance" }, role ?? undefined);
      toast({ title: "Room Sent to Maintenance", description: `Room ${room.number} flagged for maintenance.` });
      notifyMaintenanceRequest(`Room ${room.number}`, "Flagged by housekeeping", adminUser.name).catch(() => {});
      notifyTaskComplete();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setBusyId(null);
  };

  return (
    <div className="space-y-5">
      <PinSessionEndingOverlay visible={isPinSession && endingSession} />
      <div>
        <h1 className="font-serif text-2xl font-bold">Housekeeping</h1>
        <p className="text-muted-foreground text-sm">{cleaningRooms.length} room{cleaningRooms.length !== 1 ? "s" : ""} need cleaning today</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Needs Cleaning", value: rooms.filter((r: any) => r.status === "cleaning").length, color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-900/10" },
          { label: "Maintenance", value: rooms.filter((r: any) => r.status === "maintenance").length, color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-900/10" },
          { label: "Available", value: rooms.filter((r: any) => r.status === "available").length, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/10" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className={`p-4 ${s.bg}`}>
              <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <DataError message="We couldn't load room status." />
      ) : cleaningRooms.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="font-semibold text-lg">All rooms are clean!</h3>
          <p className="text-muted-foreground text-sm mt-1">No rooms currently need cleaning.</p>
        </div>
      ) : (
        <div>
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-yellow-500" /> Rooms Awaiting Cleaning
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {cleaningRooms.map((room: any) => (
              <Card key={room.id} className="border-yellow-200 dark:border-yellow-800">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-lg">Room {room.number}</h3>
                      <p className="text-xs text-muted-foreground">{room.type} · Floor {room.floor}</p>
                    </div>
                    <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 text-[11px]">
                      Cleaning
                    </Badge>
                  </div>

                  {room.amenities?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {room.amenities.slice(0, 3).map((a: string) => (
                        <Badge key={a} variant="secondary" className="text-[10px]">{a}</Badge>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 gap-2 bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => markClean(room)}
                      disabled={busyId === room.id}
                    >
                      {busyId === room.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                      {busyId === room.id ? "Updating…" : "Mark Clean"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 border-orange-400 text-orange-600 hover:bg-orange-50"
                      onClick={() => markMaintenance(room)}
                      disabled={busyId === room.id}
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
