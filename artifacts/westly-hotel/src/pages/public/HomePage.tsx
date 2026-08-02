import { Link } from "wouter";
import { useDocument, useCollection } from "@/hooks/useFirebase";
import { where } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight, Star, Waves, Utensils, Sparkles, Dumbbell, Building2, Wifi, ArrowRight, BedDouble } from "lucide-react";
import { motion } from "framer-motion";
import { formatCurrency, asArray } from "@/lib/utils";
import { DataError } from "@/components/ui/data-error";

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  Waves, Utensils, Sparkles, Dumbbell, Building2, Wifi,
};

export default function HomePage() {
  const { data: heroDoc } = useDocument("cms_content", "hero");
  const { data: aboutDoc } = useDocument("cms_content", "about");
  const { data: facilitiesDoc } = useDocument("cms_content", "facilities");
  const { data: testimonialsDoc } = useDocument("cms_content", "testimonials");
  const { data: rooms, loading: roomsLoading, error: roomsError } = useCollection("rooms", [where("isDeleted", "!=", true)]);

  const hero = (heroDoc as any)?.data;
  const about = (aboutDoc as any)?.data;
  const facilities = asArray<any>((facilitiesDoc as any)?.data);
  const testimonials = asArray<any>((testimonialsDoc as any)?.data);

  // Feature a spread of rooms straight from what's managed in the admin panel:
  // the cheapest, the most expensive, and one from the middle of the pack.
  const featuredRooms = (() => {
    const sorted = [...(rooms as any[])].filter(r => r.price != null).sort((a, b) => a.price - b.price);
    if (sorted.length <= 3) return sorted;
    const mid = sorted[Math.floor(sorted.length / 2)];
    return [sorted[0], mid, sorted[sorted.length - 1]];
  })();

  return (
    <div>
      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {hero?.backgroundImage ? (
          <img
            src={hero.backgroundImage}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--secondary)) 100%)" }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/70" />
        <div className="relative z-10 text-center text-white px-4 max-w-4xl mx-auto">
          <motion.p
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="text-sm md:text-base uppercase tracking-[0.3em] text-white/70 mb-4"
          >
            Welcome to Westly Demo Hotel
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            className="font-serif text-5xl md:text-7xl font-bold mb-6 leading-tight"
          >
            {hero?.headline || "Experience Unmatched Luxury"}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
            className="text-lg md:text-xl text-white/80 mb-10 max-w-2xl mx-auto"
          >
            {hero?.subheadline || "Where every detail is crafted to perfection."}
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <Link href="/booking">
              <Button size="lg" className="rounded-full px-10 text-base font-semibold bg-secondary hover:bg-secondary/90 text-foreground">
                {hero?.ctaText || "Book Your Stay"}
              </Button>
            </Link>
            <Link href="/rooms">
              <Button size="lg" variant="outline" className="rounded-full px-10 text-base border-white/40 text-white hover:bg-white/10">
                Explore Rooms <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-white/50">
          <p className="text-xs tracking-widest uppercase">Scroll</p>
          <div className="w-px h-12 bg-white/20 relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 w-full h-1/2 bg-white/60 animate-bounce" />
          </div>
        </div>
      </section>

      {/* Quick booking teaser */}
      <section className="bg-primary py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-primary-foreground">
              <h2 className="font-serif text-xl font-bold">Ready to experience luxury?</h2>
              <p className="text-primary-foreground/70 text-sm">Best rate guarantee · Free cancellation</p>
            </div>
            <Link href="/booking">
              <Button size="lg" className="bg-secondary hover:bg-secondary/90 text-foreground rounded-full px-8 font-semibold">
                Check Availability
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* About */}
      {about && (
        <section className="py-24 bg-background">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              <div>
                <p className="text-secondary text-sm uppercase tracking-widest font-medium mb-4">Our Story</p>
                <h2 className="font-serif text-4xl md:text-5xl font-bold mb-6 leading-tight">{about.title}</h2>
                <p className="text-muted-foreground text-lg leading-relaxed mb-8">{about.content}</p>
                <div className="flex gap-8 mb-8">
                  {[
                    { label: "Years of Excellence", value: new Date().getFullYear() - parseInt(about.established || "1985") + "+" },
                    { label: "Luxury Rooms", value: about.totalRooms + "+" },
                    { label: "Happy Guests", value: "50K+" },
                  ].map(stat => (
                    <div key={stat.label}>
                      <p className="font-serif text-3xl font-bold text-primary">{stat.value}</p>
                      <p className="text-sm text-muted-foreground">{stat.label}</p>
                    </div>
                  ))}
                </div>
                <Link href="/about">
                  <Button variant="outline" className="rounded-full gap-2">Our Story <ArrowRight className="w-4 h-4" /></Button>
                </Link>
              </div>
              {about.image && (
                <div className="relative">
                  <img src={about.image} alt="About" className="rounded-2xl w-full h-[500px] object-cover shadow-2xl" />
                  <div className="absolute -bottom-6 -left-6 bg-secondary rounded-2xl p-6 shadow-xl hidden md:block">
                    <p className="font-serif text-3xl font-bold">{new Date().getFullYear() - parseInt(about.established || "1985")}</p>
                    <p className="text-sm">Years of Luxury</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Facilities */}
      {facilities.length > 0 && (
        <section className="py-24 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <p className="text-secondary text-sm uppercase tracking-widest font-medium mb-3">What We Offer</p>
              <h2 className="font-serif text-4xl font-bold">World-Class Facilities</h2>
              <p className="text-muted-foreground mt-4 max-w-xl mx-auto">
                Every amenity designed to elevate your experience beyond expectations.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {facilities.map((facility: any, i: number) => {
                const Icon = ICON_MAP[facility.icon] || Sparkles;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    viewport={{ once: true }}
                  >
                    <Card className="group hover:shadow-lg transition-all duration-300 overflow-hidden">
                      {facility.image && (
                        <div className="h-48 overflow-hidden">
                          <img src={facility.image} alt={facility.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                        </div>
                      )}
                      <CardContent className="p-5">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                            <Icon className="w-5 h-5 text-primary" />
                          </div>
                          <h3 className="font-semibold">{facility.name}</h3>
                        </div>
                        <p className="text-sm text-muted-foreground">{facility.description}</p>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Room preview */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <p className="text-secondary text-sm uppercase tracking-widest font-medium mb-3">Accommodations</p>
            <h2 className="font-serif text-4xl font-bold">Rooms & Suites</h2>
            <p className="text-muted-foreground mt-4 max-w-xl mx-auto">
              From intimate rooms to palatial suites, each space is a private sanctuary.
            </p>
          </div>
          {roomsLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : roomsError ? (
            <DataError message="We couldn't load rooms. Please check your connection and try again." />
          ) : featuredRooms.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <BedDouble className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Rooms will appear here as soon as they're added in the admin panel.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
              {featuredRooms.map((room: any) => (
                <Link key={room.id} href={`/rooms/${room.id}`}>
                  <Card className="overflow-hidden group hover:shadow-xl transition-all duration-300 cursor-pointer h-full">
                    <div className="h-56 overflow-hidden">
                      <img
                        src={room.images?.[0] || "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800"}
                        alt={room.name || room.type}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    </div>
                    <CardContent className="p-5">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-serif font-bold text-lg">{room.name || room.type}</h3>
                          <p className="text-muted-foreground text-sm">Starting from</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-xl text-primary">{formatCurrency(room.price)}</p>
                          <p className="text-xs text-muted-foreground">per night</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
          <div className="text-center">
            <Link href="/rooms">
              <Button variant="outline" size="lg" className="rounded-full gap-2">
                View All Rooms <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      {testimonials.length > 0 && (
        <section className="py-24 bg-primary text-primary-foreground">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <p className="text-primary-foreground/60 text-sm uppercase tracking-widest font-medium mb-3">Guest Stories</p>
              <h2 className="font-serif text-4xl font-bold">What Our Guests Say</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {testimonials.map((t: any, i: number) => (
                <Card key={i} className="bg-white/10 border-white/20 text-primary-foreground">
                  <CardContent className="p-6">
                    <div className="flex gap-0.5 mb-3">
                      {Array.from({length: t.rating || 5}).map((_, j) => (
                        <Star key={j} className="w-4 h-4 fill-secondary text-secondary" />
                      ))}
                    </div>
                    <p className="italic text-primary-foreground/90 mb-4">"{t.text}"</p>
                    <p className="font-semibold text-sm">— {t.author}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Final CTA */}
      <section className="py-24 bg-background text-center">
        <div className="container mx-auto px-4 max-w-2xl">
          <p className="text-secondary text-sm uppercase tracking-widest font-medium mb-3">Make a Reservation</p>
          <h2 className="font-serif text-4xl font-bold mb-6">Your Perfect Stay Awaits</h2>
          <p className="text-muted-foreground mb-8">Experience the pinnacle of hospitality. Book now and receive our best available rate.</p>
          <Link href="/booking">
            <Button size="lg" className="rounded-full px-12 text-base font-semibold gap-2">
              Book Now <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
