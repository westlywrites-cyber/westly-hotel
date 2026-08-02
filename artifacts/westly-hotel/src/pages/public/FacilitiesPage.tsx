import { useDocument } from "@/hooks/useFirebase";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { asArray } from "@/lib/utils";
import { Waves, Utensils, Sparkles, Dumbbell, Building2, Wifi, ArrowRight } from "lucide-react";
import { DataError } from "@/components/ui/data-error";
import PageHeroBanner from "@/components/public/PageHeroBanner";

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  Waves, Utensils, Sparkles, Dumbbell, Building2, Wifi,
};

export default function FacilitiesPage() {
  const { data: facilitiesDoc, loading, error } = useDocument("cms_content", "facilities");
  const facilities = asArray<any>((facilitiesDoc as any)?.data);

  return (
    <div className="min-h-screen bg-background">
      <PageHeroBanner
        docId="facilities_hero"
        fallbackTitle="World-Class Facilities"
        fallbackSubtitle="Amenities"
        fallbackDescription="Every amenity designed to elevate your experience"
        heightClass="h-72"
      />

      <div className="container mx-auto px-4 py-16">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <DataError message="We couldn't load facilities. Please check your connection and try again." />
        ) : facilities.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">Facilities information is being updated — please check back soon.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {facilities.map((facility: any, i: number) => {
              const Icon = ICON_MAP[facility.icon] || Sparkles;
              return (
                <Card key={i} className="overflow-hidden group hover:shadow-xl transition-all duration-300">
                  {facility.image && (
                    <div className="h-52 overflow-hidden">
                      <img src={facility.image} alt={facility.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    </div>
                  )}
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
                        <Icon className="w-6 h-6 text-primary" />
                      </div>
                      <h3 className="font-serif text-lg font-bold">{facility.name}</h3>
                    </div>
                    <p className="text-muted-foreground">{facility.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <div className="mt-16 text-center">
          <h2 className="font-serif text-3xl font-bold mb-4">Ready to Experience It?</h2>
          <p className="text-muted-foreground mb-6">All facilities are available to hotel guests during their stay.</p>
          <Link href="/booking"><Button size="lg" className="rounded-full px-10 gap-2">Book Your Stay <ArrowRight className="w-4 h-4" /></Button></Link>
        </div>
      </div>
    </div>
  );
}
