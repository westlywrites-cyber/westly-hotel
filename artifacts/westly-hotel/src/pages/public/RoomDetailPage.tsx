import { Link } from "wouter";
import { useDocument } from "@/hooks/useFirebase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Users, BedDouble, ArrowLeft, ArrowRight, CheckCircle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { DataError } from "@/components/ui/data-error";
import { useState } from "react";

export default function RoomDetailPage({ params }: { params: { id: string } }) {
  const { data: room, loading, error } = useDocument("rooms", params.id);
  const [activeImg, setActiveImg] = useState(0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4">
        <DataError message="We couldn't load this room. Please check your connection and try again." />
      </div>
    );
  }
  if (!room) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center"><p className="text-muted-foreground">Room not found.</p><Link href="/rooms"><Button variant="outline" className="mt-4">Back to Rooms</Button></Link></div>
      </div>
    );
  }

  const r = room as any;
  const images = r.images?.length ? r.images : ["https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800"];

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <Link href="/rooms" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Rooms
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            {/* Image gallery */}
            <div className="relative rounded-2xl overflow-hidden mb-4 h-80">
              <img src={images[activeImg]} alt={r.type} className="w-full h-full object-cover" />
              {images.length > 1 && (
                <>
                  <button onClick={() => setActiveImg(i => (i - 1 + images.length) % images.length)} className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70"><ArrowLeft className="w-4 h-4" /></button>
                  <button onClick={() => setActiveImg(i => (i + 1) % images.length)} className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70"><ArrowRight className="w-4 h-4" /></button>
                </>
              )}
            </div>
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {images.map((img: string, i: number) => (
                  <img key={i} src={img} alt="" onClick={() => setActiveImg(i)} className={`w-20 h-14 object-cover rounded-lg cursor-pointer flex-shrink-0 transition-all ${activeImg === i ? "ring-2 ring-primary" : "opacity-60 hover:opacity-100"}`} />
                ))}
              </div>
            )}

            <div className="mt-6">
              <h1 className="font-serif text-3xl font-bold">{r.type}</h1>
              <p className="text-muted-foreground mt-1">Floor {r.floor} · Room {r.number} · Up to {r.capacity} guests</p>
              <p className="text-foreground mt-4 leading-relaxed">{r.description}</p>

              {r.amenities?.length > 0 && (
                <div className="mt-6">
                  <h3 className="font-semibold mb-3">Room Amenities</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {r.amenities.map((a: string) => (
                      <div key={a} className="flex items-center gap-2 text-sm">
                        <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                        <span>{a}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Booking card */}
          <div>
            <Card className="sticky top-24">
              <CardContent className="p-5">
                <div className="text-center mb-4">
                  <p className="text-3xl font-bold text-primary">{formatCurrency(r.price)}</p>
                  <p className="text-muted-foreground text-sm">per night</p>
                </div>
                <div className="space-y-2 mb-5 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Room Type</span><span>{r.type}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Capacity</span><span>{r.capacity} guests</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Floor</span><span>{r.floor}</span></div>
                </div>
                <Link href={`/booking?type=${encodeURIComponent(r.type)}`}>
                  <Button className="w-full gap-2" size="lg">
                    Book This Room <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
                <div className="mt-4 text-xs text-muted-foreground text-center space-y-1">
                  <p>✓ Best rate guarantee</p>
                  <p>✓ Free cancellation · 48h notice</p>
                  <p>✓ Payment due at check-in</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
