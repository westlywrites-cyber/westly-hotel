import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCollection } from "@/hooks/useFirebase";
import { doc, updateDoc, serverTimestamp, where, orderBy, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logAction } from "@/lib/audit";
import { notifyBookingCancelled, notifyBookingModified } from "@/lib/notifications";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Search, CalendarCheck, Eye, CheckCircle, XCircle, Clock, User,
  BedDouble, Calendar, Phone, Mail, Download, RefreshCw
} from "lucide-react";
import { formatDate, formatDateTime, formatCurrency, toFirestoreDate, nightsBetween } from "@/lib/utils";
import { format } from "date-fns";
import { DataError } from "@/components/ui/data-error";

type BookingStatus = "pending" | "confirmed" | "checked_in" | "checked_out" | "cancelled" | "rejected" | "no_show";

const STATUS_COLORS: Record<BookingStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  confirmed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  checked_in: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  checked_out: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  no_show: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
};

export default function BookingsPage() {
  const { adminUser, role } = useAuth();
  const { toast } = useToast();
  const { data: bookings, loading, error } = useCollection("bookings");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const filtered = useMemo(() => {
    return bookings.filter((b: any) => {
      if (b.isDeleted) return false;
      const matchSearch = !search ||
        b.guestName?.toLowerCase().includes(search.toLowerCase()) ||
        b.guestEmail?.toLowerCase().includes(search.toLowerCase()) ||
        b.roomNumber?.toLowerCase().includes(search.toLowerCase()) ||
        b.bookingId?.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || b.status === statusFilter;
      return matchSearch && matchStatus;
    }).sort((a: any, b: any) => {
      const ta = toFirestoreDate(a.createdAt)?.getTime() ?? 0;
      const tb = toFirestoreDate(b.createdAt)?.getTime() ?? 0;
      return tb - ta;
    });
  }, [bookings, search, statusFilter]);

  const handleStatusChange = async (bookingId: string, newStatus: BookingStatus, booking: any) => {
    if (!adminUser) return;
    setIsUpdating(true);
    try {
      const prevStatus = booking.status;
      // Batched so bookings and its booking_dates mirror never drift apart —
      // e.g. a cancelled booking must stop blocking the room on the public
      // availability check.
      const batch = writeBatch(db);
      batch.update(doc(db, "bookings", bookingId), {
        status: newStatus,
        updatedAt: serverTimestamp(),
        updatedBy: adminUser.id,
        updatedByName: adminUser.name,
      });
      batch.set(doc(db, "booking_dates", bookingId), {
        roomId: booking.roomId,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        status: newStatus,
      }, { merge: true });
      await batch.commit();

      // Audit log for every status change
      await logAction(
        adminUser.id,
        adminUser.name,
        `booking_status_changed:${prevStatus}→${newStatus}`,
        "bookings",
        bookingId,
        { status: prevStatus },
        { status: newStatus },
        role ?? undefined
      );

      toast({ title: "Status Updated", description: `Booking ${newStatus.replace("_", " ")}.` });

      // Check-in/check-out have their own dedicated, richer notifications
      // (see CheckOutPage/RoomReservationsPage) — avoid double-firing here.
      if (newStatus === "cancelled") {
        notifyBookingCancelled(booking.guestName, booking.roomType ?? "room", adminUser.name).catch(() => {});
      } else if (newStatus !== "checked_in" && newStatus !== "checked_out") {
        notifyBookingModified(booking.guestName, `${prevStatus} → ${newStatus}`, adminUser.name).catch(() => {});
      }

      setSelectedBooking(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setIsUpdating(false);
  };

  const canApprove = role === "super_admin" || role === "manager" || role === "receptionist";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold">Bookings</h1>
          <p className="text-muted-foreground text-sm">{filtered.length} booking{filtered.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by guest, room, booking ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="checked_in">Checked In</SelectItem>
            <SelectItem value="checked_out">Checked Out</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="no_show">No Show</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Status summary tabs */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "pending", "confirmed", "checked_in", "checked_out"] as const).map(s => {
          const count = s === "all" ? bookings.filter((b: any) => !b.isDeleted).length
            : bookings.filter((b: any) => !b.isDeleted && b.status === s).length;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                statusFilter === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {s === "all" ? "All" : s.replace("_", " ")} ({count})
            </button>
          );
        })}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <DataError message="We couldn't load bookings." />
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CalendarCheck className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>No bookings found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Guest</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Room</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Check-In</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Check-Out</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Amount</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((booking: any) => (
                    <tr key={booking.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4">
                        <p className="font-medium">{booking.guestName}</p>
                        <p className="text-xs text-muted-foreground">{booking.guestEmail}</p>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-medium">Room {booking.roomNumber}</p>
                        <p className="text-xs text-muted-foreground">{booking.roomType}</p>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">{formatDateTime(toFirestoreDate(booking.checkInAt || booking.checkIn))}</td>
                      <td className="py-3 px-4 whitespace-nowrap">{formatDateTime(toFirestoreDate(booking.checkOutAt || booking.checkOut))}</td>
                      <td className="py-3 px-4 font-medium">{formatCurrency(booking.totalAmount || 0)}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${STATUS_COLORS[booking.status as BookingStatus] || ""}`}>
                          {booking.status?.replace("_", " ")}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 text-xs"
                          onClick={() => setSelectedBooking(booking)}
                        >
                          <Eye className="w-3.5 h-3.5" /> View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      {selectedBooking && (
        <Dialog open={!!selectedBooking} onOpenChange={() => setSelectedBooking(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Booking Details</DialogTitle>
              <DialogDescription>
                {selectedBooking.bookingId || selectedBooking.id?.slice(0, 8).toUpperCase()}
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Guest</p>
                  <p className="font-medium">{selectedBooking.guestName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Email</p>
                  <p>{selectedBooking.guestEmail || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Phone</p>
                  <p>{selectedBooking.guestPhone || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Guests</p>
                  <p>{selectedBooking.adults || 1} adults, {selectedBooking.children || 0} children</p>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Room</p>
                  <p className="font-medium">Room {selectedBooking.roomNumber}</p>
                  <p className="text-muted-foreground text-xs">{selectedBooking.roomType}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Check-In</p>
                  <p>{formatDateTime(toFirestoreDate(selectedBooking.checkInAt || selectedBooking.checkIn))}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Check-Out</p>
                  <p>{formatDateTime(toFirestoreDate(selectedBooking.checkOutAt || selectedBooking.checkOut))}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Amount</p>
                  <p className="font-bold text-base">{formatCurrency(selectedBooking.totalAmount || 0)}</p>
                </div>
              </div>
            </div>

            {selectedBooking.specialRequests && (
              <div className="mt-3 p-3 bg-muted rounded-lg text-sm">
                <p className="text-xs text-muted-foreground mb-1">Special Requests</p>
                <p>{selectedBooking.specialRequests}</p>
              </div>
            )}

            {canApprove && (
              <div className="mt-4">
                <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">Change Status</p>
                <div className="flex flex-wrap gap-2">
                  {selectedBooking.status === "pending" && (
                    <>
                      <Button
                        size="sm"
                        className="gap-1 bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => handleStatusChange(selectedBooking.id, "confirmed", selectedBooking)}
                        disabled={isUpdating}
                      >
                        <CheckCircle className="w-3.5 h-3.5" /> Confirm
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="gap-1"
                        onClick={() => handleStatusChange(selectedBooking.id, "rejected", selectedBooking)}
                        disabled={isUpdating}
                      >
                        <XCircle className="w-3.5 h-3.5" /> Reject
                      </Button>
                    </>
                  )}
                  {selectedBooking.status === "confirmed" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 border-orange-400 text-orange-600"
                      onClick={() => handleStatusChange(selectedBooking.id, "cancelled", selectedBooking)}
                      disabled={isUpdating}
                    >
                      <XCircle className="w-3.5 h-3.5" /> Cancel
                    </Button>
                  )}
                  {selectedBooking.status === "confirmed" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 border-orange-400 text-orange-600"
                      onClick={() => handleStatusChange(selectedBooking.id, "no_show", selectedBooking)}
                      disabled={isUpdating}
                    >
                      <Clock className="w-3.5 h-3.5" /> No Show
                    </Button>
                  )}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedBooking(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
