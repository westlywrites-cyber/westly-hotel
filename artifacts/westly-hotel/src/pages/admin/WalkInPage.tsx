import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCollection, useDocument } from "@/hooks/useFirebase";
import { runTransaction, doc, collection, serverTimestamp } from "firebase/firestore";
import { ref, set } from "firebase/database";
import { db, rtdb } from "@/lib/firebase";
import { logAction } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { pushActivity } from "@/hooks/useRealtime";
import { detectConflict } from "@/lib/roomLogic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { usePinTaskComplete } from "@/hooks/usePinTaskComplete";
import { UserPlus, Loader2, CheckCircle, BedDouble } from "lucide-react";
import {
  formatCurrency, formatDateTime, nightsBetween,
  toDateTimeLocalValue, parseDateTimeLocal, combineDateAndTime,
} from "@/lib/utils";
import { where } from "firebase/firestore";
import { format, addDays } from "date-fns";

export default function WalkInPage() {
  const { adminUser, role } = useAuth();
  const { toast } = useToast();
  const { isPinSession, endingSession, notifyTaskComplete } = usePinTaskComplete();
  // Only filter by isDeleted server-side (single-field, so no composite
  // index needed). Combining it with where("status","==","available")
  // would require a composite index that doesn't exist in
  // firestore.indexes.json — Firestore then rejects the live query after
  // briefly serving a locally-cached snapshot, which is why the room
  // dropdown appeared empty (nothing happened on click, no rooms listed).
  // Filtering "available" client-side avoids that entirely.
  const { data: allRooms, loading: roomsLoading, error: roomsError } = useCollection<any>("rooms", [where("isDeleted", "!=", true)]);
  const rooms = useMemo(() => allRooms.filter((r: any) => r.status === "available"), [allRooms]);
  // Live subscription — always reflects the Super Admin's latest saved
  // check-out time policy, never a stale/cached copy.
  const { data: settings } = useDocument<any>("settings", "hotel");
  const officialCheckOutTime: string = settings?.checkOutTime || "11:00";

  const [form, setForm] = useState({
    guestName: "", guestEmail: "", guestPhone: "", nationality: "",
    roomId: "", checkInDateTime: toDateTimeLocalValue(new Date()),
    checkOut: format(addDays(new Date(), 1), "yyyy-MM-dd"),
    adults: "1", children: "0", paymentMethod: "cash", idDocRef: "", notes: "",
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<any>(null);

  const selectedRoom = useMemo(() => rooms.find(r => r.id === form.roomId) as any, [rooms, form.roomId]);

  const nights = useMemo(() => {
    if (!form.checkInDateTime || !form.checkOut) return 1;
    return nightsBetween(new Date(form.checkInDateTime.slice(0, 10)), new Date(form.checkOut));
  }, [form.checkInDateTime, form.checkOut]);

  const totalAmount = useMemo(() =>
    selectedRoom ? selectedRoom.price * nights : 0,
    [selectedRoom, nights]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminUser || !form.roomId || !form.guestName) return;

    const checkIn = parseDateTimeLocal(form.checkInDateTime);
    if (!form.checkInDateTime || isNaN(checkIn.getTime())) {
      toast({ title: "Walk-In Failed", description: "Please enter a valid check-in date and time.", variant: "destructive" });
      return;
    }
    // Check-out date combined with the hotel's official check-out time —
    // always the latest value set by the Super Admin in Settings.
    const checkOut = combineDateAndTime(form.checkOut, officialCheckOutTime);

    if (checkOut <= checkIn) {
      toast({ title: "Walk-In Failed", description: "Check-out must be after check-in.", variant: "destructive" });
      return;
    }

    setLoading(true);

    try {
      // Check for conflicts before transaction
      const hasConflict = await detectConflict(form.roomId, checkIn, checkOut);
      if (hasConflict) throw new Error("This room is already booked for the selected dates.");

      // ── Firestore Transaction: all writes are atomic ─────────────────────
      let bookingId: string;
      await runTransaction(db, async (transaction) => {
        // Verify room is still available inside the transaction
        const roomRef = doc(db, "rooms", form.roomId);
        const roomSnap = await transaction.get(roomRef);
        if (!roomSnap.exists()) throw new Error("Room not found.");
        if (roomSnap.data().status !== "available") throw new Error("Room is no longer available.");

        // 1. Create guest record
        const guestRef = doc(collection(db, "guests"));
        transaction.set(guestRef, {
          name: form.guestName,
          email: form.guestEmail || null,
          phone: form.guestPhone || null,
          nationality: form.nationality || null,
          idDocumentRef: form.idDocRef || null,
          firstVisit: serverTimestamp(),
          totalStays: 1,
          isDeleted: false,
        });

        // 2. Create booking record
        const bookingRef = doc(collection(db, "bookings"));
        bookingId = bookingRef.id;
        transaction.set(bookingRef, {
          bookingId: "WI-" + bookingId.slice(0, 6).toUpperCase(),
          guestId: guestRef.id,
          guestName: form.guestName,
          guestEmail: form.guestEmail || null,
          guestPhone: form.guestPhone || null,
          roomId: form.roomId,
          roomNumber: selectedRoom.number,
          roomType: selectedRoom.type,
          checkIn,
          checkOut,
          checkInAt: checkIn,
          nights,
          adults: parseInt(form.adults),
          children: parseInt(form.children),
          totalAmount,
          paymentMethod: form.paymentMethod,
          status: "checked_in",
          source: "walk_in",
          createdAt: serverTimestamp(),
          createdBy: adminUser.id,
          createdByName: adminUser.name,
          notes: form.notes || null,
          isDeleted: false,
        });

        // 2b. Mirror into booking_dates (PII-free, publicly readable) so the
        // public booking page's conflict check also sees this room as taken.
        transaction.set(doc(db, "booking_dates", bookingRef.id), {
          roomId: form.roomId,
          checkIn,
          checkOut,
          status: "checked_in",
        });

        // 3. Create check-in record
        const checkinRef = doc(collection(db, "checkins"));
        transaction.set(checkinRef, {
          bookingId: bookingRef.id,
          roomId: form.roomId,
          roomNumber: selectedRoom.number,
          guestName: form.guestName,
          checkInTime: serverTimestamp(), // system audit timestamp (record creation)
          checkInAt: checkIn,             // exact date/time entered by the Receptionist
          expectedCheckOutAt: checkOut,
          staffId: adminUser.id,
          staffName: adminUser.name,
          idDocumentRef: form.idDocRef || null,
          notes: form.notes || null,
          isDeleted: false,
        });

        // 4. Update room to occupied
        transaction.update(roomRef, {
          status: "occupied",
          currentGuest: form.guestName,
          currentBookingId: bookingRef.id,
          statusUpdatedAt: serverTimestamp(),
        });

        // 5. Create payment record
        const paymentRef = doc(collection(db, "payments"));
        transaction.set(paymentRef, {
          bookingId: bookingRef.id,
          guestName: form.guestName,
          roomNumber: selectedRoom.number,
          amount: totalAmount,
          paymentMethod: form.paymentMethod,
          type: "walk_in_payment",
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

      // Post-transaction operations (best-effort)
      await set(ref(rtdb, `roomStatus/${form.roomId}`), {
        status: "occupied", currentGuest: form.guestName, updatedAt: Date.now(),
      }).catch(() => {});

      logAction(adminUser.id, adminUser.name, "walk_in_checkin", "bookings", bookingId!, null,
        { guestName: form.guestName, roomNumber: selectedRoom.number, checkInAt: checkIn, checkOut }, role ?? undefined
      ).catch(() => {});

      notify({ type: "walk_in", title: "New Walk-In", message: `${form.guestName} checked into Room ${selectedRoom.number}`, forRoles: ["super_admin", "manager"] }).catch(() => {});

      pushActivity({ message: `Walk-in: ${form.guestName} → Room ${selectedRoom.number}`, type: "walk_in", userName: adminUser.name, userId: adminUser.id }).catch(() => {});

      setSuccess({ guestName: form.guestName, roomNumber: selectedRoom.number, checkOut, amount: totalAmount });
      setForm({
        guestName: "", guestEmail: "", guestPhone: "", nationality: "", roomId: "",
        checkInDateTime: toDateTimeLocalValue(new Date()),
        checkOut: format(addDays(new Date(), 1), "yyyy-MM-dd"),
        adults: "1", children: "0", paymentMethod: "cash", idDocRef: "", notes: "",
      });

      toast({ title: "Walk-In Complete!", description: `${form.guestName} is now checked in.` });
      notifyTaskComplete();
    } catch (err: any) {
      toast({ title: "Walk-In Failed", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  };

  if (success) {
    return (
      <div className="max-w-md mx-auto pt-12 text-center space-y-5">
        <div className="w-20 h-20 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>
        <div>
          <h2 className="font-serif text-2xl font-bold">Walk-In Registered!</h2>
          <p className="text-muted-foreground mt-2">
            <strong>{success.guestName}</strong> is now checked in to Room <strong>{success.roomNumber}</strong>.
          </p>
        </div>
        <div className="bg-muted rounded-xl p-4 text-sm text-left space-y-2">
          <div className="flex justify-between"><span className="text-muted-foreground">Check-Out</span><span>{formatDateTime(success.checkOut)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Total Paid</span><span className="font-bold">{formatCurrency(success.amount)}</span></div>
        </div>
        {isPinSession ? (
          <p className="text-sm text-muted-foreground">
            {endingSession ? "Ending session for security — enter your PIN again to register another guest." : "Walk-in saved."}
          </p>
        ) : (
          <Button onClick={() => setSuccess(null)} className="w-full">Register Another Walk-In</Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="font-serif text-2xl font-bold">Check-In</h1>
        <p className="text-muted-foreground text-sm">Register a walk-in guest who arrived without a prior booking and check them in</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Guest details */}
        <Card>
          <CardHeader><CardTitle className="text-base">Guest Information</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <Input required value={form.guestName} onChange={e => setForm({...form, guestName: e.target.value})} placeholder="John Doe" />
            </div>
            <div className="space-y-2">
              <Label>Phone *</Label>
              <Input required value={form.guestPhone} onChange={e => setForm({...form, guestPhone: e.target.value})} placeholder="+1 555…" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={form.guestEmail} onChange={e => setForm({...form, guestEmail: e.target.value})} placeholder="optional" />
            </div>
            <div className="space-y-2">
              <Label>Nationality</Label>
              <Input value={form.nationality} onChange={e => setForm({...form, nationality: e.target.value})} placeholder="optional" />
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label>ID Document Reference</Label>
              <Input value={form.idDocRef} onChange={e => setForm({...form, idDocRef: e.target.value})} placeholder="Passport / National ID number (recommended)" />
            </div>
          </CardContent>
        </Card>

        {/* Room & Dates */}
        <Card>
          <CardHeader><CardTitle className="text-base">Room & Dates</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label>Select Room *</Label>
              <Select required value={form.roomId} onValueChange={v => setForm({...form, roomId: v})} disabled={roomsLoading}>
                <SelectTrigger><SelectValue placeholder={roomsLoading ? "Loading rooms…" : "Choose available room…"} /></SelectTrigger>
                <SelectContent>
                  {rooms.map((room: any) => (
                    <SelectItem key={room.id} value={room.id}>
                      Room {room.number} — {room.type} ({formatCurrency(room.price)}/night)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {roomsError && (
                <p className="text-xs text-destructive">Couldn't load rooms. Check your connection and reload.</p>
              )}
              {!roomsLoading && !roomsError && rooms.length === 0 && (
                <p className="text-xs text-muted-foreground">No rooms are currently available.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Check-In Date &amp; Time *</Label>
              <Input
                required
                type="datetime-local"
                value={form.checkInDateTime}
                onChange={e => setForm({...form, checkInDateTime: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Check-Out Date *</Label>
              <Input
                required
                type="date"
                value={form.checkOut}
                min={form.checkInDateTime ? form.checkInDateTime.slice(0, 10) : undefined}
                onChange={e => setForm({...form, checkOut: e.target.value})}
              />
              <p className="text-xs text-muted-foreground">
                Check-out time will be recorded as <strong>{officialCheckOutTime}</strong>, the hotel's official
                check-out time (set by the Super Admin in Settings).
              </p>
            </div>
            <div className="space-y-2">
              <Label>Adults</Label>
              <Select value={form.adults} onValueChange={v => setForm({...form, adults: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{[1,2,3,4].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Children</Label>
              <Select value={form.children} onValueChange={v => setForm({...form, children: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{[0,1,2,3].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Payment */}
        <Card>
          <CardHeader><CardTitle className="text-base">Payment</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {selectedRoom && (
              <div className="bg-muted rounded-lg p-4 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">{formatCurrency(selectedRoom.price)} × {nights} night{nights !== 1 ? "s" : ""}</span><span className="font-bold">{formatCurrency(totalAmount)}</span></div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={form.paymentMethod} onValueChange={v => setForm({...form, paymentMethod: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="credit_card">Credit Card</SelectItem>
                  <SelectItem value="debit_card">Debit Card</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Optional notes" />
            </div>
          </CardContent>
        </Card>

        <Button type="submit" disabled={loading || !form.roomId} className="w-full gap-2" size="lg">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
          {loading ? "Processing…" : "Register Walk-In & Check In"}
        </Button>
      </form>
    </div>
  );
}
