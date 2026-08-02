import { useDocument } from "@/hooks/useFirebase";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight, Award, Star } from "lucide-react";
import { DataError } from "@/components/ui/data-error";

export default function AboutPage() {
  const { data: aboutDoc, loading, error } = useDocument("cms_content", "about");
  const about = (aboutDoc as any)?.data;

  return (
    <div className="min-h-screen bg-background">
      <div className="relative h-72 overflow-hidden">
        {about?.image ? (
          <img src={about.image} alt="About" className="w-full h-full object-cover" />
        ) : (
          <div
            className="w-full h-full"
            style={{ background: "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--secondary)) 100%)" }}
          />
        )}
        <div className="absolute inset-0 bg-black/60" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-center">
          <p className="text-sm uppercase tracking-widest text-white/70 mb-2">Our Heritage</p>
          <h1 className="font-serif text-4xl md:text-5xl font-bold">About Westly</h1>
        </div>
      </div>

      <div className="container mx-auto px-4 py-16 max-w-4xl">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <DataError message="We couldn't load this page. Please check your connection and try again." />
        ) : about && (
          <>
            <div className="text-center mb-16">
              <h2 className="font-serif text-3xl font-bold mb-6">{about.title}</h2>
              <p className="text-muted-foreground text-lg leading-relaxed">{about.content}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-16">
              {[
                { label: "Year Established", value: about.established || "1985" },
                { label: "Luxury Rooms", value: `${about.totalRooms || 55}+` },
                { label: "Guest Reviews", value: "4.9 ★" },
              ].map(stat => (
                <div key={stat.label} className="text-center p-6 bg-muted/40 rounded-2xl">
                  <p className="font-serif text-4xl font-bold text-primary">{stat.value}</p>
                  <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
                </div>
              ))}
            </div>

            {about.awards?.length > 0 && (
              <div className="mb-16">
                <h3 className="font-serif text-2xl font-bold mb-6 text-center">Awards & Recognition</h3>
                <div className="flex flex-wrap gap-3 justify-center">
                  {about.awards.map((award: string, i: number) => (
                    <div key={i} className="flex items-center gap-2 bg-secondary/10 px-4 py-2 rounded-full">
                      <Award className="w-4 h-4 text-secondary" />
                      <span className="text-sm font-medium">{award}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div className="text-center bg-primary rounded-2xl p-10 text-primary-foreground">
          <h2 className="font-serif text-3xl font-bold mb-4">Experience the Difference</h2>
          <p className="text-primary-foreground/80 mb-6">Every guest is our most important guest. Join us for an unforgettable stay.</p>
          <Link href="/booking"><Button size="lg" className="bg-secondary hover:bg-secondary/90 text-foreground rounded-full px-10 gap-2">Book Your Stay <ArrowRight className="w-4 h-4" /></Button></Link>
        </div>
      </div>
    </div>
  );
}
