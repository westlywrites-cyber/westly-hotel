import { useState } from "react";
import { Link } from "wouter";
import { useCollection } from "@/hooks/useFirebase";
import { where } from "firebase/firestore";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { ArrowRight, Users2, Ruler, ImageOff, ChevronLeft, ChevronRight, Landmark } from "lucide-react";
import { DataError } from "@/components/ui/data-error";
import PageHeroBanner from "@/components/public/PageHeroBanner";

function VenueImageCarousel({ images, name }: { images: string[]; name: string }) {
  const [index, setIndex] = useState(0);
  if (!images || images.length === 0) {
    return (
      <div className="h-56 bg-muted flex items-center justify-center">
        <ImageOff className="w-8 h-8 text-muted-foreground" />
      </div>
    );
  }
  return (
    <div className="relative h-56 overflow-hidden group">
      <img src={images[index]} alt={name} className="w-full h-full object-cover transition-opacity duration-300" />
      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => setIndex((i) => (i - 1 + images.length) % images.length)}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setIndex((i) => (i + 1) % images.length)}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
            {images.map((_, i) => (
              <span key={i} className={`w-1.5 h-1.5 rounded-full ${i === index ? "bg-white" : "bg-white/50"}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function VenuePage() {
  const { data: allVenues, loading, error } = useCollection<any>("venues", [where("isDeleted", "!=", true)]);
  const venues = allVenues.filter((v: any) => v.available !== false);

  return (
    <div className="min-h-screen bg-background">
      <PageHeroBanner
        docId="venue_hero"
        fallbackTitle="Events & Venues"
        fallbackSubtitle="Spaces for Every Occasion"
        fallbackDescription="From intimate gatherings to grand celebrations, our venues provide the perfect backdrop"
        heightClass="h-80"
      />

      <div className="container mx-auto px-4 py-16">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <DataError message="We couldn't load venues. Please check your connection and try again." />
        ) : venues.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Landmark className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>Venue information is being updated — please check back soon.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {venues.map((venue: any) => (
              <Card key={venue.id} className="overflow-hidden group hover:shadow-xl transition-all duration-300">
                <VenueImageCarousel images={venue.images || []} name={venue.name} />
                <CardContent className="p-6">
                  <h3 className="font-serif text-lg font-bold mb-2">{venue.name}</h3>
                  {venue.description && (
                    <p className="text-muted-foreground text-sm mb-4 line-clamp-3">{venue.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
                    {venue.size && (
                      <span className="flex items-center gap-1.5"><Ruler className="w-4 h-4" /> {venue.size}</span>
                    )}
                    {venue.capacity && (
                      <span className="flex items-center gap-1.5"><Users2 className="w-4 h-4" /> Up to {venue.capacity} guests</span>
                    )}
                  </div>
                  {venue.amenities?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {venue.amenities.map((a: string) => (
                        <Badge key={a} variant="secondary" className="text-[11px]">{a}</Badge>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-3 border-t border-border">
                    <span className="font-bold text-primary">
                      {venue.price != null ? formatCurrency(venue.price) : "Contact for pricing"}
                    </span>
                    <Link href="/contact">
                      <Button size="sm" variant="outline" className="rounded-full gap-1.5">
                        Enquire <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="mt-16 text-center">
          <h2 className="font-serif text-3xl font-bold mb-4">Planning an Event?</h2>
          <p className="text-muted-foreground mb-6">Our team is ready to help you find the perfect space for your occasion.</p>
          <Link href="/contact"><Button size="lg" className="rounded-full px-10 gap-2">Contact Us <ArrowRight className="w-4 h-4" /></Button></Link>
        </div>
      </div>
    </div>
  );
}
