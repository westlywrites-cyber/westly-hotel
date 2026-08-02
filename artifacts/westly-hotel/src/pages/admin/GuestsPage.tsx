import { useState, useMemo } from "react";
import { useCollection } from "@/hooks/useFirebase";
import { where } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Users, Search, Mail, Phone, Globe, Calendar } from "lucide-react";
import { formatDate, formatDateTime, toFirestoreDate } from "@/lib/utils";
import { DataError } from "@/components/ui/data-error";

export default function GuestsPage() {
  const { data: guests, loading, error } = useCollection("guests", [where("isDeleted", "!=", true)]);
  const { data: bookings } = useCollection("bookings");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any>(null);

  const filtered = useMemo(() => {
    if (!search) return guests;
    const q = search.toLowerCase();
    return guests.filter((g: any) =>
      g.name?.toLowerCase().includes(q) ||
      g.email?.toLowerCase().includes(q) ||
      g.phone?.includes(q)
    );
  }, [guests, search]);

  const guestBookings = useMemo(() => {
    if (!selected) return [];
    return bookings.filter((b: any) => b.guestId === selected.id || b.guestName === selected.name);
  }, [selected, bookings]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold">Guests</h1>
          <p className="text-muted-foreground text-sm">{guests.length} registered guests</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, email, or phone…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <DataError message="We couldn't load guests." />
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p>No guests found</p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Guest</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Contact</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Nationality</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Total Stays</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">First Visit</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((guest: any) => (
                    <tr key={guest.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-xs font-bold text-primary">{guest.name?.[0]?.toUpperCase()}</span>
                          </div>
                          <p className="font-medium">{guest.name}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-xs">{guest.email || "—"}</p>
                        <p className="text-xs text-muted-foreground">{guest.phone || "—"}</p>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">{guest.nationality || "—"}</td>
                      <td className="py-3 px-4">
                        <Badge variant="outline">{guest.totalStays || 1}</Badge>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">{formatDate(toFirestoreDate(guest.firstVisit))}</td>
                      <td className="py-3 px-4">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelected(guest)}>
                          View History
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Guest detail dialog */}
      {selected && (
        <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Guest Profile</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
                  {selected.name?.[0]?.toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-lg">{selected.name}</h3>
                  <Badge variant="outline" className="text-xs">{guestBookings.length} stay{guestBookings.length !== 1 ? "s" : ""}</Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                {selected.email && (
                  <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground" /><span>{selected.email}</span></div>
                )}
                {selected.phone && (
                  <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-muted-foreground" /><span>{selected.phone}</span></div>
                )}
                {selected.nationality && (
                  <div className="flex items-center gap-2"><Globe className="w-4 h-4 text-muted-foreground" /><span>{selected.nationality}</span></div>
                )}
                {selected.idDocumentRef && (
                  <div className="col-span-2 text-xs text-muted-foreground">ID: {selected.idDocumentRef}</div>
                )}
              </div>

              {guestBookings.length > 0 && (
                <div>
                  <h4 className="font-semibold text-sm mb-2">Stay History</h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {guestBookings.map((b: any) => (
                      <div key={b.id} className="flex items-center justify-between py-2 border-b border-border last:border-0 text-sm">
                        <div>
                          <p className="font-medium">Room {b.roomNumber}</p>
                          <p className="text-xs text-muted-foreground">{formatDateTime(toFirestoreDate(b.checkInAt || b.checkIn))} → {formatDateTime(toFirestoreDate(b.checkOutAt || b.checkOut))}</p>
                        </div>
                        <Badge variant="outline" className="text-[10px] capitalize">{b.status?.replace("_"," ")}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
