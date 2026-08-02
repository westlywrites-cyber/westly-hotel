import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { collection, doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { detectConflict, findAvailableRooms } from "@/lib/roomLogic";
import { notifyNewBooking } from "@/lib/notifications";
import { useCollection } from "@/hooks/useFirebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { DataError } from "@/components/ui/data-error";
import { Calendar, BedDouble, User, AlertTriangle, Loader2, CheckCircle } from "lucide-react";
import { formatCurrency, nightsBetween } from "@/lib/utils";
import { where } from "firebase/firestore";
import { format, addDays } from "date-fns";

const ROOM_TYPES = ["Standard Room", "Deluxe Room", "Junior Suite", "Executive Suite", "Presidential Suite"];

export default function BookingPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: rooms, loading: roomsLoading, error: roomsError } = useCollection("rooms", [where("isDeleted", "!=", true)]);

  const [step, setStep] = useState<"dates" | "guest" | "confirm">("dates");
  const [loading, setLoading] = useState(false);
  const [conflictCheck, setConflictCheck] = useState<"idle" | "checking" | "available" | "conflict">("idle");

  const [form, setForm] = useState({
    roomType: "Standard Room",
    roomId: "",
    checkIn: format(addDays(new Date(), 1), "yyyy-MM-dd"),
    checkOut: format(addDays(new Date(), 3), "yyyy-MM-dd"),
    adults: "2",
    children: "0",
    guestName: "",
    guestEmail: "",
    guestPhone: "",
    nationality: "",
    specialRequests: "",
  });

  const nights = useMemo(() => nightsBetween(new Date(form.checkIn), new Date(form.checkOut)), [form.checkIn, form.checkOut]);

  // Price comes straight from the actual room's Firestore price so it always
  // matches what's set in the admin panel — never a hardcoded value.
  const pricePerNight = useMemo(() => {
    const selectedRoom = (rooms as any[]).find(r => r.id === form.roomId);
    if (selectedRoom?.price != null) return selectedRoom.price;
    const roomsOfType = (rooms as any[]).filter(r => r.type === form.roomType && r.price != null);
    if (roomsOfType.length === 0) return 0;
    return Math.min(...roomsOfType.map(r => r.price));
  }, [rooms, form.roomId, form.roomType]);

  const totalAmount = pricePerNight * nights;

  const checkAvailability = async () => {
    if (!form.checkIn || !form.checkOut) {
      toast({ title: "Select dates", description: "Please select check-in and check-out dates.", variant: "destructive" });
      return;
    }
    if (new Date(form.checkOut) <= new Date(form.checkIn)) {
      toast({ title: "Invalid dates", description: "Check-out must be after check-in.", variant: "destructive" });
      return;
    }

    setConflictCheck("checking");
    try {
      const checkIn = new Date(form.checkIn);
      const checkOut = new Date(form.checkOut);

      // Find available rooms of the selected type
      const available = await findAvailableRooms(form.roomType, checkIn, checkOut);

      if (available.length === 0) {
        setConflictCheck("conflict");
      } else {
        // Auto-select the first available room
        setForm(f => ({ ...f, roomId: available[0].id }));
        setConflictCheck("available");
        setTimeout(() => setStep("guest"), 500);
      }
    } catch (err: any) {
      setConflictCheck("idle");
      console.error("[checkAvailability]", err);
      toast({
        title: "Error checking availability",
        description: err?.message || err?.code || "Unknown error — check browser console.",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.guestName || !form.guestEmail || !form.roomId) return;
    setLoading(true);

    try {
      const checkIn = new Date(form.checkIn);
      const checkOut = new Date(form.checkOut);

      // Final conflict check before submitting
      const hasConflict = await detectConflict(form.roomId, checkIn, checkOut);
      if (hasConflict) {
        toast({ title: "Sorry!", description: "This room was just taken. Please try different dates or a different room type.", variant: "destructive" });
        setConflictCheck("conflict");
        setStep("dates");
        setLoading(false);
        return;
      }

      const selectedRoom = rooms.find((r: any) => r.id === form.roomId) as any;
      const bookingId = "BK-" + Math.random().toString(36).slice(2, 8).toUpperCase();

      // Written as a batch so the guest-facing booking record and its
      // PII-free booking_dates mirror (used for public availability checks)
      // land together or not at all. See firestore.rules / roomLogic.ts.
      const bookingRef = doc(collection(db, "bookings"));
      const batch = writeBatch(db);

      batch.set(bookingRef, {
        bookingId,
        guestName: form.guestName,
        guestEmail: form.guestEmail,
        guestPhone: form.guestPhone || null,
        nationality: form.nationality || null,
        roomId: form.roomId,
        roomNumber: selectedRoom?.number || "",
        roomType: form.roomType,
        checkIn,
        checkOut,
        nights,
        adults: parseInt(form.adults),
        children: parseInt(form.children),
        totalAmount,
        pricePerNight,
        specialRequests: form.specialRequests || null,
        status: "pending",
        source: "website",
        createdAt: serverTimestamp(),
        isDeleted: false,
      });

      batch.set(doc(db, "booking_dates", bookingRef.id), {
        roomId: form.roomId,
        checkIn,
        checkOut,
        status: "pending",
      });

      await batch.commit();
      const docRef = bookingRef;

      // Notify management
      notifyNewBooking(form.guestName, form.roomType, format(checkIn, "MMM d"), format(checkOut, "MMM d")).catch(() => {});

      toast({ title: "Booking Request Sent!", description: `Booking ID: ${bookingId}` });
      setLocation(`/booking/confirmation?id=${docRef.id}&name=${encodeURIComponent(form.guestName)}&amount=${totalAmount}`);
    } catch (err: any) {
      toast({ title: "Booking Failed", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  };

  if (roomsError) {
    return (
      <div className="min-h-screen bg-background py-16">
        <div className="container mx-auto px-4 max-w-2xl">
          <DataError message="We couldn't load room availability. Please check your connection and try again." />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-16">
      <div className="container mx-auto px-4 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-12">
          <p className="text-secondary text-sm uppercase tracking-widest font-medium mb-3">Reserve Your Stay</p>
          <h1 className="font-serif text-4xl font-bold">Book a Room</h1>
          <p className="text-muted-foreground mt-3">Best rate guarantee · Secure booking</p>
        </div>

        {roomsLoading && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-6">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading room availability…
          </div>
        )}

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-4 mb-10">
          {(["dates", "guest", "confirm"] as const).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                step === s ? "bg-primary text-primary-foreground" :
                (i < ["dates","guest","confirm"].indexOf(step)) ? "bg-green-500 text-white" : "bg-muted text-muted-foreground"
              }`}>
                {i < ["dates","guest","confirm"].indexOf(step) ? "✓" : i + 1}
              </div>
              <span className={`text-sm capitalize hidden sm:block ${step === s ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                {s === "dates" ? "Room & Dates" : s === "guest" ? "Guest Info" : "Confirm"}
              </span>
              {i < 2 && <div className="w-8 h-px bg-border hidden sm:block" />}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            {/* Step 1: Room & Dates */}
            {step === "dates" && (
              <Card>
                <CardHeader><CardTitle>Choose Room & Dates</CardTitle></CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <Label>Room Type</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {ROOM_TYPES.map(type => {
                        const typeRooms = (rooms as any[]).filter(r => r.type === type && r.price != null);
                        const fromPrice = typeRooms.length ? Math.min(...typeRooms.map(r => r.price)) : null;
                        return (
                          <button
                            key={type}
                            onClick={() => { setForm(f => ({...f, roomType: type, roomId: ""})); setConflictCheck("idle"); }}
                            className={`p-3 rounded-xl border-2 text-left transition-all ${
                              form.roomType === type ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                            }`}
                          >
                            <p className="font-medium text-sm">{type}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {fromPrice != null ? `From ${formatCurrency(fromPrice)}/night` : "No rooms available"}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Check-In Date</Label>
                      <Input
                        type="date"
                        value={form.checkIn}
                        min={format(new Date(), "yyyy-MM-dd")}
                        onChange={e => { setForm(f => ({...f, checkIn: e.target.value})); setConflictCheck("idle"); }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Check-Out Date</Label>
                      <Input
                        type="date"
                        value={form.checkOut}
                        min={form.checkIn}
                        onChange={e => { setForm(f => ({...f, checkOut: e.target.value})); setConflictCheck("idle"); }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Adults</Label>
                      <Select value={form.adults} onValueChange={v => setForm(f => ({...f, adults: v}))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{[1,2,3,4].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Children</Label>
                      <Select value={form.children} onValueChange={v => setForm(f => ({...f, children: v}))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{[0,1,2,3].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>

                  {conflictCheck === "conflict" && (
                    <Alert variant="destructive">
                      <AlertTriangle className="w-4 h-4" />
                      <AlertDescription>
                        No {form.roomType}s are available for those dates. Please try different dates or a different room type.
                      </AlertDescription>
                    </Alert>
                  )}

                  {conflictCheck === "available" && (
                    <Alert className="border-green-500 bg-green-50 dark:bg-green-900/10">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <AlertDescription className="text-green-700 dark:text-green-400">
                        Room available! Taking you to the next step…
                      </AlertDescription>
                    </Alert>
                  )}

                  <Button
                    className="w-full gap-2"
                    size="lg"
                    onClick={checkAvailability}
                    disabled={conflictCheck === "checking" || roomsLoading}
                  >
                    {conflictCheck === "checking" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
                    {conflictCheck === "checking" ? "Checking Availability…" : "Check Availability"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Step 2: Guest Info */}
            {step === "guest" && (
              <Card>
                <CardHeader>
                  <CardTitle>Guest Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={(e) => { e.preventDefault(); setStep("confirm"); }} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2 sm:col-span-2">
                        <Label>Full Name *</Label>
                        <Input required value={form.guestName} onChange={e => setForm(f => ({...f, guestName: e.target.value}))} placeholder="John Doe" />
                      </div>
                      <div className="space-y-2">
                        <Label>Email Address *</Label>
                        <Input required type="email" value={form.guestEmail} onChange={e => setForm(f => ({...f, guestEmail: e.target.value}))} placeholder="john@example.com" />
                      </div>
                      <div className="space-y-2">
                        <Label>Phone Number</Label>
                        <Input type="tel" value={form.guestPhone} onChange={e => setForm(f => ({...f, guestPhone: e.target.value}))} placeholder="+1 555…" />
                      </div>
                      <div className="space-y-2">
                        <Label>Nationality</Label>
                        <Input value={form.nationality} onChange={e => setForm(f => ({...f, nationality: e.target.value}))} placeholder="Optional" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Special Requests</Label>
                      <textarea
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-none"
                        value={form.specialRequests}
                        onChange={e => setForm(f => ({...f, specialRequests: e.target.value}))}
                        placeholder="Dietary requirements, room preferences, accessibility needs…"
                      />
                    </div>
                    <div className="flex gap-3">
                      <Button type="button" variant="outline" onClick={() => setStep("dates")}>Back</Button>
                      <Button type="submit" className="flex-1">Continue to Confirm</Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}

            {/* Step 3: Confirm */}
            {step === "confirm" && (
              <Card>
                <CardHeader><CardTitle>Confirm Your Booking</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="bg-muted/50 rounded-xl p-4 space-y-3 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">Guest</span><span className="font-medium">{form.guestName}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span>{form.guestEmail}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Room Type</span><span className="font-medium">{form.roomType}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Check-In</span><span>{format(new Date(form.checkIn), "EEEE, MMM d, yyyy")}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Check-Out</span><span>{format(new Date(form.checkOut), "EEEE, MMM d, yyyy")}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Duration</span><span>{nights} night{nights !== 1 ? "s" : ""}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Guests</span><span>{form.adults} adult{parseInt(form.adults) !== 1 ? "s" : ""}{parseInt(form.children) > 0 ? `, ${form.children} children` : ""}</span></div>
                      <div className="border-t border-border pt-3 flex justify-between font-bold text-base">
                        <span>Total Amount</span>
                        <span className="text-primary">{formatCurrency(totalAmount)}</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Your booking request will be confirmed by our team within 24 hours. Payment is due at check-in.
                    </p>
                    <div className="flex gap-3">
                      <Button type="button" variant="outline" onClick={() => setStep("guest")}>Back</Button>
                      <Button className="flex-1 gap-2" onClick={handleSubmit} disabled={loading}>
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {loading ? "Submitting…" : "Confirm Booking Request"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Booking summary */}
          <div>
            <Card className="sticky top-24">
              <CardHeader className="pb-3"><CardTitle className="text-base">Booking Summary</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Room</span><span>{form.roomType}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Check-In</span><span>{format(new Date(form.checkIn), "MMM d, yyyy")}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Check-Out</span><span>{format(new Date(form.checkOut), "MMM d, yyyy")}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Duration</span><span>{nights} night{nights !== 1 ? "s" : ""}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Guests</span><span>{form.adults} adults</span></div>
                <div className="border-t border-border pt-3">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>{formatCurrency(pricePerNight)} × {nights} nights</span>
                    <span>{formatCurrency(totalAmount)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-base">
                    <span>Total</span>
                    <span className="text-primary">{formatCurrency(totalAmount)}</span>
                  </div>
                </div>
                <div className="bg-green-50 dark:bg-green-900/10 rounded-lg p-3 text-xs text-green-700 dark:text-green-400">
                  ✓ Best rate guarantee<br />
                  ✓ Free cancellation (48h notice)<br />
                  ✓ Payment at check-in
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
