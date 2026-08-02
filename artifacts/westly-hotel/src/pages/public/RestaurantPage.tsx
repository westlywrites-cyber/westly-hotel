import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight, Clock, Utensils } from "lucide-react";
import { useDocument } from "@/hooks/useFirebase";
import { formatCurrency, asArray } from "@/lib/utils";
import { DataError } from "@/components/ui/data-error";
import PageHeroBanner from "@/components/public/PageHeroBanner";
import {
  MENU_CATEGORIES,
  CATEGORY_LABELS,
  type MenuItem,
} from "@/pages/admin/RestaurantManagementPage";

export default function RestaurantPage() {
  const { data: menuDoc, loading, error } = useDocument("cms_content", "restaurant_menu");
  const items = asArray<MenuItem>((menuDoc as any)?.data).filter((i) => i.available);

  const sections = MENU_CATEGORIES.map((cat) => ({
    category: cat,
    items: items.filter((i) => i.category === cat),
  })).filter((s) => s.items.length > 0);

  return (
    <div className="min-h-screen bg-background">
      <PageHeroBanner
        docId="restaurant_hero"
        fallbackTitle="Fine Dining"
        fallbackSubtitle="Culinary Excellence"
        fallbackDescription="Contemporary international cuisine"
        heightClass="h-80"
      />

      <div className="container mx-auto px-4 py-16 max-w-4xl">
        {/* Restaurant info */}
        <div className="text-center mb-12">
          <p className="text-muted-foreground max-w-xl mx-auto">
            Our award-winning restaurant offers an unparalleled dining experience. Executive Chef combines classical techniques with local, seasonal ingredients to create dishes that are both beautiful and unforgettable.
          </p>
          <div className="flex justify-center gap-6 mt-6 text-sm">
            {[
              { icon: Clock, label: "Breakfast", value: "7:00 AM – 10:30 AM" },
              { icon: Clock, label: "Lunch", value: "12:00 PM – 3:00 PM" },
              { icon: Clock, label: "Dinner", value: "6:00 PM – 10:30 PM" },
            ].map(item => (
              <div key={item.label} className="text-center">
                <p className="font-semibold">{item.label}</p>
                <p className="text-muted-foreground">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Menu */}
        <h2 className="font-serif text-2xl font-bold mb-6">Menu</h2>
        {loading ? (
          <p className="text-center text-muted-foreground py-12">Loading menu…</p>
        ) : error ? (
          <DataError message="We couldn't load the menu. Please check your connection and try again." />
        ) : sections.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">
            Our menu is being updated — please check back soon.
          </p>
        ) : (
          <div className="space-y-10">
            {sections.map((section) => (
              <div key={section.category}>
                <h3 className="font-semibold text-lg mb-3 text-primary border-b border-border pb-2">
                  {CATEGORY_LABELS[section.category]}
                </h3>
                <div className="space-y-4">
                  {section.items.map((item) => (
                    <div key={item.id} className="flex items-start gap-4">
                      {item.image && (
                        <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0">
                          <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="flex-1 flex items-start justify-between gap-4">
                        <div>
                          <p className="font-medium">{item.name}</p>
                          {item.description && (
                            <p className="text-sm text-muted-foreground">{item.description}</p>
                          )}
                        </div>
                        <p className="font-bold text-primary shrink-0">{formatCurrency(item.price)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-12 text-center bg-muted/40 rounded-2xl p-8">
          <Utensils className="w-8 h-8 text-primary mx-auto mb-3" />
          <h3 className="font-serif text-2xl font-bold mb-2">Make a Reservation</h3>
          <p className="text-muted-foreground mb-6">Table reservations for hotel guests are given priority. Contact our concierge for special dining arrangements.</p>
          <div className="flex gap-3 justify-center">
            <Link href="/contact"><Button variant="outline" className="rounded-full gap-2">Reserve a Table <ArrowRight className="w-4 h-4" /></Button></Link>
          </div>
        </div>
      </div>
    </div>
  );
}
