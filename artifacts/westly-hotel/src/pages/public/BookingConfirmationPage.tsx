import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, Calendar, Mail, Home, Phone } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export default function BookingConfirmationPage() {
  const [location] = useLocation();
  const params = new URLSearchParams(location.split("?")[1] || "");
  const guestName = decodeURIComponent(params.get("name") || "Guest");
  const amount = parseFloat(params.get("amount") || "0");
  const bookingId = params.get("id")?.slice(0, 8).toUpperCase() || "—";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center py-16 px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-24 h-24 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle className="w-12 h-12 text-green-600" />
        </div>

        <div>
          <h1 className="font-serif text-3xl font-bold mb-2">Booking Requested!</h1>
          <p className="text-muted-foreground">
            Thank you, <strong>{guestName}</strong>! Your booking request has been received and is pending confirmation.
          </p>
        </div>

        <Card>
          <CardContent className="p-5 space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Booking Reference</span>
              <span className="font-mono font-bold text-primary">#{bookingId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Amount</span>
              <span className="font-bold">{formatCurrency(amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Payment</span>
              <span className="text-muted-foreground">Due at check-in</span>
            </div>
          </CardContent>
        </Card>

        <div className="bg-muted/50 rounded-xl p-4 text-sm text-left space-y-2">
          <p className="font-semibold">What happens next?</p>
          <ul className="space-y-1.5 text-muted-foreground">
            <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />Our team will review your request within 24 hours</li>
            <li className="flex items-start gap-2"><Mail className="w-4 h-4 text-primary shrink-0 mt-0.5" />You'll receive a confirmation email with all details</li>
            <li className="flex items-start gap-2"><Phone className="w-4 h-4 text-primary shrink-0 mt-0.5" />For urgent inquiries: +1 (555) 123-4567</li>
          </ul>
        </div>

        <div className="flex gap-3">
          <Link href="/" className="flex-1">
            <Button variant="outline" className="w-full gap-2">
              <Home className="w-4 h-4" /> Back to Home
            </Button>
          </Link>
          <Link href="/booking" className="flex-1">
            <Button className="w-full gap-2">
              <Calendar className="w-4 h-4" /> New Booking
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
