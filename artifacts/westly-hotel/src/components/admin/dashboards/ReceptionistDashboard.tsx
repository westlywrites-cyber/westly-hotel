import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCollection } from "@/hooks/useFirebase";
import { where } from "firebase/firestore";
import { useMessages } from "@/hooks/useMessages";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { CalendarCheck, UserCheck, LogOut, UserPlus, Clock, Globe, MessageSquareText } from "lucide-react";
import { toFirestoreDate, formatDate, timeAgo } from "@/lib/utils";
import { DataError } from "@/components/ui/data-error";
import { format, startOfDay, endOfDay } from "date-fns";

export default function ReceptionistDashboard() {
  const { adminUser } = useAuth();
  const { data: bookings, loading: dashLoading, error: dashError } = useCollection("bookings", [where("isDeleted", "!=", true)]);
  const { messages, unreadCount: unreadMessages, configured: messagesConfigured } = useMessages();

  const stats = useMemo(() => {
    const now = new Date();
    const today = startOfDay(now);
    const todayEnd = endOfDay(now);

    const todayCheckIns = bookings.filter(b => {
      const ci = toFirestoreDate((b as any).checkIn);
      return ci && ci >= today && ci <= todayEnd && (b as any).status === "confirmed";
    });
    const todayCheckOuts = bookings.filter(b => {
      const co = toFirestoreDate((b as any).checkOut);
      return co && co >= today && co <= todayEnd && (b as any).status === "checked_in";
    });
    const currentGuests = bookings.filter(b => (b as any).status === "checked_in");

    return { todayCheckIns, todayCheckOuts, currentGuests };
  }, [bookings]);

  const quickActions = [
    { label: "Check-In", href: "/admin/checkin", icon: UserPlus, color: "bg-green-600 hover:bg-green-700 text-white" },
    { label: "Check Out", href: "/admin/checkout", icon: LogOut, color: "bg-orange-600 hover:bg-orange-700 text-white" },
    { label: "Room Reservations", href: "/admin/room-reservations", icon: Globe, color: "bg-blue-600 hover:bg-blue-700 text-white" },
    { label: "Messages", href: "/admin/messages", icon: MessageSquareText, color: "bg-purple-600 hover:bg-purple-700 text-white" },
    { label: "All Bookings", href: "/admin/bookings", icon: CalendarCheck, color: "bg-muted hover:bg-muted/80 text-foreground" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold">Welcome, {adminUser?.name?.split(" ")[0]}</h1>
        <p className="text-muted-foreground text-sm">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {quickActions.map(action => (
          <Link key={action.href} href={action.href}>
            <button className={`w-full flex flex-col items-center justify-center gap-2 p-5 rounded-xl font-medium transition-colors ${action.color}`}>
              <action.icon className="w-6 h-6" />
              <span className="text-sm">{action.label}</span>
            </button>
          </Link>
        ))}
      </div>

      {dashLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : dashError ? (
        <DataError message="We couldn't load today's bookings." />
      ) : (
      <>
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Expected In", value: stats.todayCheckIns.length, color: "text-green-600" },
          { label: "Expected Out", value: stats.todayCheckOuts.length, color: "text-orange-600" },
          { label: "In-House", value: stats.currentGuests.length, color: "text-blue-600" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-4 text-center">
              <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Today's check-in list */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-green-600" /> Today's Arrivals
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.todayCheckIns.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No arrivals today</p>
            ) : (
              <div className="space-y-2">
                {stats.todayCheckIns.slice(0, 6).map((b: any) => (
                  <div key={b.id} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                    <div>
                      <p className="text-sm font-medium">{b.guestName}</p>
                      <p className="text-xs text-muted-foreground">Room {b.roomNumber}</p>
                    </div>
                    <Link href="/admin/room-reservations">
                      <Button variant="outline" size="sm" className="h-7 text-xs">Check In</Button>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <LogOut className="w-4 h-4 text-orange-600" /> Today's Departures
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.todayCheckOuts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No departures today</p>
            ) : (
              <div className="space-y-2">
                {stats.todayCheckOuts.slice(0, 6).map((b: any) => (
                  <div key={b.id} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                    <div>
                      <p className="text-sm font-medium">{b.guestName}</p>
                      <p className="text-xs text-muted-foreground">Room {b.roomNumber}</p>
                    </div>
                    <Link href="/admin/checkout">
                      <Button variant="outline" size="sm" className="h-7 text-xs">Check Out</Button>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      </>
      )}

      {/* Recent website messages */}
      {messagesConfigured && (
        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm flex items-center gap-2">
              <MessageSquareText className="w-4 h-4 text-purple-600" /> Recent Messages
              {unreadMessages > 0 && <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">{unreadMessages} new</Badge>}
            </CardTitle>
            <Link href="/admin/messages">
              <Button variant="ghost" size="sm" className="h-7 text-xs">View all</Button>
            </Link>
          </CardHeader>
          <CardContent>
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No messages yet</p>
            ) : (
              <div className="space-y-2">
                {messages.slice(0, 4).map((m) => (
                  <Link key={m.id} href="/admin/messages">
                    <div className="flex items-center justify-between py-1.5 border-b border-border last:border-0 cursor-pointer">
                      <div className="min-w-0">
                        <p className={`text-sm truncate ${m.status === "new" ? "font-semibold" : "font-medium"}`}>{m.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{m.subject || m.message}</p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 ml-2">{timeAgo(m.created_at)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
