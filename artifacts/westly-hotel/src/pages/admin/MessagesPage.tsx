import { useMemo, useState } from "react";
import { useMessages } from "@/hooks/useMessages";
import { markMessageRead, setReplyStatus, softDeleteMessage, type InboxMessage } from "@/lib/messages";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime, timeAgo } from "@/lib/utils";
import { DataError } from "@/components/ui/data-error";
import {
  MessageSquareText, Search, Mail, Phone, Clock, CheckCircle2,
  Circle, Reply, Trash2, ExternalLink, DatabaseZap,
} from "lucide-react";

const REPLY_LABEL: Record<InboxMessage["reply_status"], string> = {
  none: "Not replied",
  pending: "Reply pending",
  replied: "Replied",
};

const REPLY_COLOR: Record<InboxMessage["reply_status"], string> = {
  none: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  replied: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

export default function MessagesPage() {
  const { messages, loading, error, unreadCount, configured, refresh } = useMessages();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "unreplied">("all");
  const [selected, setSelected] = useState<InboxMessage | null>(null);

  const filtered = useMemo(() => {
    let list = messages;
    if (filter === "unread") list = list.filter((m) => m.status === "new");
    if (filter === "unreplied") list = list.filter((m) => m.reply_status !== "replied");
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) =>
          m.name?.toLowerCase().includes(q) ||
          m.email?.toLowerCase().includes(q) ||
          m.subject?.toLowerCase().includes(q) ||
          m.message?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [messages, search, filter]);

  const openMessage = async (msg: InboxMessage) => {
    setSelected(msg);
    if (msg.status === "new") {
      try {
        await markMessageRead(msg.id);
      } catch {
        /* non-fatal — the badge will just stay a beat longer */
      }
    }
  };

  const handleReplyStatus = async (msg: InboxMessage, status: InboxMessage["reply_status"]) => {
    try {
      await setReplyStatus(msg.id, status);
      setSelected((cur) => (cur && cur.id === msg.id ? { ...cur, reply_status: status } : cur));
      toast({ title: "Updated", description: `Marked as "${REPLY_LABEL[status]}".` });
    } catch {
      toast({ title: "Couldn't update", description: "Please try again.", variant: "destructive" });
    }
  };

  const handleDelete = async (msg: InboxMessage) => {
    try {
      await softDeleteMessage(msg.id);
      setSelected(null);
      toast({ title: "Message removed" });
    } catch {
      toast({ title: "Couldn't remove message", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold flex items-center gap-2">
            <MessageSquareText className="w-6 h-6 text-primary" />
            Message Inbox
          </h1>
          <p className="text-muted-foreground text-sm">
            {configured
              ? `${messages.length} messages${unreadCount ? ` · ${unreadCount} unread` : ""}`
              : "Enquiries submitted through the public website contact form"}
          </p>
        </div>
      </div>

      {!configured && (
        <Card className="border-dashed">
          <CardContent className="p-5 flex items-start gap-3">
            <DatabaseZap className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium">Message Inbox isn't connected yet</p>
              <p className="text-muted-foreground mt-1">
                This inbox is powered by Supabase. Once <code className="text-xs bg-muted px-1 py-0.5 rounded">VITE_SUPABASE_URL</code> and{" "}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">VITE_SUPABASE_ANON_KEY</code> are set (see{" "}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">supabase/schema.sql</code>), messages submitted through the public
                Contact page will appear here in real time. Any messages submitted in the meantime are queued on the visitor's device and
                will sync automatically the first time this app loads after Supabase is connected.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {configured && (
        <>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or subject…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              {(["all", "unread", "unreplied"] as const).map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant={filter === f ? "default" : "outline"}
                  onClick={() => setFilter(f)}
                  className="capitalize"
                >
                  {f}
                </Button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <DataError message="We couldn't load messages." onRetry={refresh} />
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquareText className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No messages{search || filter !== "all" ? " match your filters" : " yet"}.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((msg) => (
                <Card
                  key={msg.id}
                  className={`cursor-pointer hover:shadow-md transition-shadow ${msg.status === "new" ? "border-primary/40 bg-primary/[0.03]" : ""}`}
                  onClick={() => openMessage(msg)}
                >
                  <CardContent className="p-4 flex items-start gap-3">
                    <div className="mt-1 shrink-0">
                      {msg.status === "new" ? (
                        <Circle className="w-2.5 h-2.5 fill-primary text-primary" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className={`text-sm truncate ${msg.status === "new" ? "font-semibold" : "font-medium"}`}>
                          {msg.name}
                        </p>
                        <span className="text-xs text-muted-foreground shrink-0">{timeAgo(msg.created_at)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{msg.email}</p>
                      {msg.subject && <p className="text-sm mt-1 truncate">{msg.subject}</p>}
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{msg.message}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge className={REPLY_COLOR[msg.reply_status]}>{REPLY_LABEL[msg.reply_status]}</Badge>
                        {msg.phone && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Phone className="w-3 h-3" /> {msg.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Message detail dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-lg">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <MessageSquareText className="w-5 h-5 text-primary" />
                  {selected.subject || "Website Enquiry"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">Name</p>
                    <p className="font-medium">{selected.name}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">Received</p>
                    <p className="font-medium flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> {formatDateTime(selected.created_at)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">Email</p>
                    <a href={`mailto:${selected.email}`} className="font-medium text-primary hover:underline flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5" /> {selected.email}
                    </a>
                  </div>
                  {selected.phone && (
                    <div>
                      <p className="text-muted-foreground text-xs uppercase tracking-wide">Phone</p>
                      <a href={`tel:${selected.phone}`} className="font-medium text-primary hover:underline flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5" /> {selected.phone}
                      </a>
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Message</p>
                  <p className="text-sm whitespace-pre-wrap bg-muted/50 rounded-lg p-3">{selected.message}</p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Reply status:</span>
                  {(["none", "pending", "replied"] as const).map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={selected.reply_status === s ? "default" : "outline"}
                      onClick={() => handleReplyStatus(selected, s)}
                      className="text-xs h-7"
                    >
                      {REPLY_LABEL[s]}
                    </Button>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <a href={`mailto:${selected.email}?subject=${encodeURIComponent(`Re: ${selected.subject || "Your enquiry to Westly Hotel"}`)}`}>
                    <Button size="sm" className="gap-1.5">
                      <Reply className="w-3.5 h-3.5" /> Reply by Email <ExternalLink className="w-3 h-3" />
                    </Button>
                  </a>
                  <Button size="sm" variant="ghost" className="text-destructive gap-1.5" onClick={() => handleDelete(selected)}>
                    <Trash2 className="w-3.5 h-3.5" /> Remove
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
