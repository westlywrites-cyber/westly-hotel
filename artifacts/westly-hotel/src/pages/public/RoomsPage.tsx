import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useCollection } from "@/hooks/useFirebase";
import { where } from "firebase/firestore";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BedDouble, Users, Search, ArrowRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { DataError } from "@/components/ui/data-error";
import PageHeroBanner from "@/components/public/PageHeroBanner";

const ROOM_TYPES = ["All", "Standard Room", "Deluxe Room", "Junior Suite", "Executive Suite", "Presidential Suite"];

export default function RoomsPage() {
  const { data: rooms, loading, error } = useCollection("rooms", [where("isDeleted", "!=", true)]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [maxPrice, setMaxPrice] = useState("");
  const [minGuests, setMinGuests] = useState("");

  // Only show rooms that are publicly bookable
  const publicRooms = useMemo(() => {
    return rooms.filter((r: any) => {
      const matchType = typeFilter === "All" || r.type === typeFilter;
      const matchSearch = !search || r.type?.toLowerCase().includes(search.toLowerCase()) || r.description?.toLowerCase().includes(search.toLowerCase());
      const matchPrice = !maxPrice || (r.price || 0) <= parseFloat(maxPrice);
      const matchGuests = !minGuests || (r.capacity || 1) >= parseInt(minGuests);
      return matchType && matchSearch && matchPrice && matchGuests;
    }).sort((a: any, b: any) => a.price - b.price);
  }, [rooms, typeFilter, search, maxPrice, minGuests]);

  return (
    <div className="min-h-screen bg-background">
      {/* Hero banner */}
      <PageHeroBanner
        docId="rooms_hero"
        fallbackTitle="Rooms & Suites"
        fallbackSubtitle="Accommodation"
        fallbackDescription="Every space a private sanctuary"
        heightClass="h-64 md:h-80"
      />

      <div className="container mx-auto px-4 py-12">
        {/* Filters */}
        <div className="bg-card rounded-2xl shadow-sm border border-border p-4 mb-8 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search rooms…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>{ROOM_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
          <Input type="number" placeholder="Max price/night" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} className="w-40" />
          <Input type="number" placeholder="Min guests" value={minGuests} onChange={e => setMinGuests(e.target.value)} className="w-32" />
        </div>

        {/* Tabs */}
        <div className="flex gap-2 flex-wrap mb-6">
          {ROOM_TYPES.map(type => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${typeFilter === type ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
            >
              {type}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <DataError message="We couldn't load rooms. Please check your connection and try again." />
        ) : publicRooms.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <BedDouble className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No rooms match your search</p>
          </div>
        ) : (
          <div className="space-y-6">
            {publicRooms.map((room: any) => (
              <Card key={room.id} className="overflow-hidden group hover:shadow-lg transition-all duration-300">
                <div className="grid grid-cols-1 md:grid-cols-3">
                  <div className="md:col-span-1 h-48 md:h-auto overflow-hidden">
                    <img
                      src={room.images?.[0] || "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800"}
                      alt={room.type}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  </div>
                  <CardContent className="md:col-span-2 p-6 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-serif text-xl font-bold">{room.type}</h3>
                          <p className="text-muted-foreground text-sm mt-1">Floor {room.floor} · Room {room.number}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-2xl text-primary">{formatCurrency(room.price)}</p>
                          <p className="text-xs text-muted-foreground">per night</p>
                        </div>
                      </div>
                      <p className="text-muted-foreground text-sm mb-4">{room.description}</p>
                      <div className="flex items-center gap-4 mb-4">
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Users className="w-4 h-4" />
                          <span>Up to {room.capacity} guests</span>
                        </div>
                      </div>
                      {room.amenities?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-4">
                          {room.amenities.map((a: string) => (
                            <Badge key={a} variant="secondary" className="text-xs">{a}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-3">
                      <Link href={`/rooms/${room.id}`}>
                        <Button variant="outline" className="gap-2">View Details</Button>
                      </Link>
                      <Link href={`/booking?type=${encodeURIComponent(room.type)}`}>
                        <Button className="gap-2">Book Now <ArrowRight className="w-4 h-4" /></Button>
                      </Link>
                    </div>
                  </CardContent>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
