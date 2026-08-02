import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCollection, useDocument } from "@/hooks/useFirebase";
import { runTransaction, doc, collection, serverTimestamp } from "firebase/firestore";
import { ref, set } from "firebase/database";
import { db, rtdb } from "@/lib/firebase";
import { logAction } from "@/lib/audit";
import { notifyCheckOut } from "@/lib/notifications";
import { pushActivity } from "@/hooks/useRealtime";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { usePinTaskComplete } from "@/hooks/usePinTaskComplete";
import { Search, LogOut, Loader2, CheckCircle, BedDouble, Calendar } from "lucide-react";
import { DataError } from "@/components/ui/data-error";
import {
  formatDateTime, formatCurrency, toFirestoreDate, nightsBetween,
  toDateTimeLocalValue, parseDateTimeLocal, combineDateAndTime,
} from "@/lib/utils";
import { where } from "firebase/firestore";
import { format } from "date-fns";

export default function CheckOutPage() {
  const { adminUser, role } = useAuth();
  const { toast } = useToast();
  const { isPinSession, endingSession, notifyTaskComplete } = usePinTaskComplete();
  // Only filter by isDeleted server-side (single-field, so no composite
  // index needed). Combining it with where("status","==","checked_in")
  // would require a composite index that doesn't exist in
  // firestore.indexes.json — Firestore then rejects the live query after
  // briefly serving a locally-cached snapshot, which is why the checked-in
  // guest list used to flash on screen for a moment and then go blank.
  // Filtering "checked_in" client-side avoids that entirely.
  const { data: allBookings, loading: bookingsLoading, error: bookingsError } = useCollection<any>("bookings", [where("isDeleted", "!=", true)]);
  const bookings = useMemo(() => allBookings.filter((b: any) => b.status === "checked_in"), [allBookings]);
  // Live subscription — always reflects the Super Admin's latest saved
  // check-out time policy, never a stale/cached copy.
  const { data: settings } = useDocument<any>("settings", "hotel");
  const officialCheckOutTime: string = settings?.checkOutTime || "11:00";

  const [search, setSearch] = useState("");
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [extraCharges, setExtraCharges] = useState("");
  const [notes, setNotes] = useState("");
  const [checkOutDateTime, setCheckOutDateTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<any>(null);

  // Open the dialog for a booking, seeding the exact check-out date/time.
  // Defaults to today's date at the hotel's official check-out time (the
  // latest value the Super Admin saved in Settings) — the Receptionist can
  // still edit it to record the guest's actual departure time.
  const handleSelectBooking = (booking: any) => {
    setSelectedBooking(booking);
    setCheckOutDateTime(
      toDateTimeLocalValue(combineDateAndTime(format(new Date(), "yyyy-MM-dd"), officialCheckOutTime))
    );
  };

  const closeDialog = () => {
    setSelectedBooking(null);
    setCheckOutDateTime("");
  };

  const filtered = useMemo(() => {
    if (!search) return bookings;
    const q = search.toLowerCase();
    return bookings.filter((b: any) =>
      b.guestName?.toLowerCase().includes(q) ||
      b.roomNumber?.includes(q) ||
      b.guestEmail?.toLowerCase().includes(q)
    );
  }, [bookings, search]);

  const totalDue = (booking: any) => {
    const base = booking.totalAmount || 0;
    const extra = parseFloat(extraCharges) || 0;
    return base + extra;
  };

  const handleCheckOut = async () => {
    if (!selectedBooking || !adminUser) return;

    // Exact check-out date/time entered by the Receptionist (defaults to
    // today + the Super Admin's official check-out time, but editable to
    // record the guest's actual departure time).
    const checkOutAtDate = parseDateTimeLocal(checkOutDateTime);
    if (!checkOutDateTime || isNaN(checkOutAtDate.getTime())) {
      toast({ title: "Check-Out Failed", description: "Please enter a valid check-out date and time.", variant: "destructive" });
      return;
    }
    const actualCheckIn = toFirestoreDate(selectedBooking.checkInAt) || toFirestoreDate(selectedBooking.checkIn);
    if (actualCheckIn && checkOutAtDate < actualCheckIn) {
      toast({ title: "Check-Out Failed", description: "Check-out time cannot be before the guest's check-in time.", variant: "destructive" });
      return;
    }

    setLoading(true);

    try {
      const finalAmount = totalDue(selectedBooking);

      // ── Firestore Transaction: all writes are atomic ─────────────────────
      await runTransaction(db, async (transaction) => {
        const bookingRef = doc(db, "bookings", selectedBooking.id);
        const bookingSnap = await transaction.get(bookingRef);

        if (!bookingSnap.exists()) throw new Error("Booking not found.");
        const currentData = bookingSnap.data();
        if (currentData.status !== "checked_in") throw new Error("Booking is not in checked-in state.");

        // 1. Update booking to checked_out with the exact date/time entered
        transaction.update(bookingRef, {
          status: "checked_out",
          checkOutAt: checkOutAtDate,
          checkedOutBy: adminUser.id,
          checkedOutByName: adminUser.name,
          finalAmount,
          extraCharges: parseFloat(extraCharges) || 0,
          paymentMethod,
          checkOutNotes: notes || null,
          updatedAt: serverTimestamp(),
        });

        // 1b. Mirror status into booking_dates — checked_out is excluded from
        // the conflict-check status list, so this frees the room up publicly.
        transaction.set(doc(db, "booking_dates", selectedBooking.id), {
          roomId: selectedBooking.roomId,
          checkIn: currentData.checkIn,
          checkOut: currentData.checkOut,
          status: "checked_out",
        }, { merge: true });

        // 2. Update room status to cleaning (post-checkout SOP)
        if (selectedBooking.roomId) {
          const roomRef = doc(db, "rooms", selectedBooking.roomId);
          transaction.update(roomRef, {
            status: "cleaning",
            currentGuest: null,
            currentBookingId: null,
            statusUpdatedAt: serverTimestamp(),
          });
        }

        // 3. Create dedicated checkout record
        const checkoutRef = doc(collection(db, "checkouts"));
        transaction.set(checkoutRef, {
          bookingId: selectedBooking.id,
          roomId: selectedBooking.roomId || null,
          roomNumber: selectedBooking.roomNumber,
          guestName: selectedBooking.guestName,
          guestEmail: selectedBooking.guestEmail || null,
          checkOutTime: serverTimestamp(), // system audit timestamp (record creation)
          checkOutAt: checkOutAtDate,      // exact date/time entered by the Receptionist
          baseAmount: selectedBooking.totalAmount || 0,
          extraCharges: parseFloat(extraCharges) || 0,
          finalAmount,
          paymentMethod,
          staffId: adminUser.id,
          staffName: adminUser.name,
          notes: notes || null,
          isDeleted: false,
        });

        // 4. Create payment record
        const paymentRef = doc(collection(db, "payments"));
        transaction.set(paymentRef, {
          bookingId: selectedBooking.id,
          guestName: selectedBooking.guestName,
          roomNumber: selectedBooking.roomNumber,
          amount: finalAmount,
          paymentMethod,
          type: "room_payment",
          recordedBy: adminUser.id,
          recordedByName: adminUser.name,
          createdAt: serverTimestamp(),
          // Every payment starts as Pending Approval — it only counts as
          // company revenue once the Accountant reviews and approves it.
          approvalStatus: "pending",
          approvedBy: null,
          approvedByName: null,
          approvedAt: null,
          rejectedReason: null,
          isDeleted: false,
        });
      });
      // ── Transaction complete ─────────────────────────────────────────────

      // Post-transaction non-atomic operations (best-effort)
      await set(ref(rtdb, `roomStatus/${selectedBooking.roomId}`), {
        status: "cleaning",
        updatedAt: Date.now(),
      }).catch(() => {});

      logAction(adminUser.id, adminUser.name, "check_out", "bookings", selectedBooking.id,
        { status: "checked_in" }, { status: "checked_out", checkOutAt: checkOutAtDate, finalAmount }, role ?? undefined
      ).catch(() => {});

      notifyCheckOut(selectedBooking.guestName, selectedBooking.roomNumber, adminUser.name).catch(() => {});

      pushActivity({
        message: `${adminUser.name} checked out ${selectedBooking.guestName} (Room ${selectedBooking.roomNumber})`,
        type: "check_out",
        userName: adminUser.name,
        userId: adminUser.id,
      }).catch(() => {});

      setSuccess({ booking: selectedBooking, amount: finalAmount, time: format(checkOutAtDate, "h:mm a") });
      closeDialog();
      setExtraCharges("");
      setNotes("");

      toast({ title: "Check-Out Complete", description: `${selectedBooking.guestName} has checked out.` });
      notifyTaskComplete();
    } catch (err: any) {
      toast({ title: "Check-Out Failed", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  };

  if (success) {
    return (
      <div className="max-w-md mx-auto pt-12 text-center space-y-5">
        <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle className="w-10 h-10 text-blue-600" />
        </div>
        <div>
          <h2 className="font-serif text-2xl font-bold">Check-Out Complete!</h2>
          <p className="text-muted-foreground mt-2">
            <strong>{success.booking.guestName}</strong> checked out of Room <strong>{success.booking.roomNumber}</strong>.
          </p>
          <p className="text-sm text-muted-foreground">Room has been queued for cleaning.</p>
        </div>
        <div className="bg-muted rounded-xl p-4 text-sm text-left space-y-2">
          <div className="flex justify-between"><span className="text-muted-foreground">Payment</span><span className="font-bold">{formatCurrency(success.amount)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Method</span><span className="capitalize">{paymentMethod}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Time</span><span>{success.time}</span></div>
        </div>
        {isPinSession ? (
          <p className="text-sm text-muted-foreground">
            {endingSession ? "Ending session for security — enter your PIN again to check out another guest." : "Check-out saved."}
          </p>
        ) : (
          <Button onClick={() => setSuccess(null)} className="w-full">Check Out Another Guest</Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="font-serif text-2xl font-bold">Check Out</h1>
        <p className="text-muted-foreground text-sm">{bookings.length} guest{bookings.length !== 1 ? "s" : ""} currently checked in</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by guest name, room number, email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {bookingsLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : bookingsError ? (
        <DataError message="We couldn't load checked-in guests." />
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <LogOut className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p>No guests currently checked in</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((booking: any) => (
            <Card key={booking.id} className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => handleSelectBooking(booking)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
                      <span className="text-sm font-bold text-blue-600">{booking.guestName?.[0]}</span>
                    </div>
                    <div>
                      <p className="font-semibold">{booking.guestName}</p>
                      <p className="text-xs text-muted-foreground">{booking.guestEmail}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-2 justify-end">
                      <BedDouble className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">Room {booking.roomNumber}</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                      <Calendar className="w-3 h-3" />
                      <span>Due: {formatDateTime(toFirestoreDate(booking.checkOut))}</span>
                    </div>
                    <p className="text-sm font-bold mt-0.5">{formatCurrency(booking.totalAmount || 0)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Check-Out Dialog */}
      {selectedBooking && (
        <Dialog open={!!selectedBooking} onOpenChange={() => closeDialog()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Check-Out</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Guest</span><span className="font-medium">{selectedBooking.guestName}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Room</span><span>Room {selectedBooking.roomNumber}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Room Charges</span><span>{formatCurrency(selectedBooking.totalAmount || 0)}</span></div>
                {parseFloat(extraCharges) > 0 && (
                  <div className="flex justify-between text-orange-600"><span>Extra Charges</span><span>+{formatCurrency(parseFloat(extraCharges))}</span></div>
                )}
                <div className="flex justify-between font-bold border-t pt-2 mt-2 border-border">
                  <span>Total Due</span>
                  <span>{formatCurrency(totalDue(selectedBooking))}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Check-Out Date &amp; Time *</Label>
                <Input
                  type="datetime-local"
                  required
                  value={checkOutDateTime}
                  onChange={e => setCheckOutDateTime(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Defaults to the hotel's official check-out time (<strong>{officialCheckOutTime}</strong>, set by the
                  Super Admin in Settings) — adjust this to record the guest's actual departure time.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Extra Charges (e.g. minibar, damages)</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  min="0"
                  value={extraCharges}
                  onChange={e => setExtraCharges(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="credit_card">Credit Card</SelectItem>
                    <SelectItem value="debit_card">Debit Card</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="mobile_payment">Mobile Payment</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Input placeholder="Any notes" value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => closeDialog()}>Cancel</Button>
              <Button onClick={handleCheckOut} disabled={loading || !checkOutDateTime} className="gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                {loading ? "Processing…" : "Complete Check-Out"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
