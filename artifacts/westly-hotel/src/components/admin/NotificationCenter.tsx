import { useState } from "react";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import {
  Bell, CalendarCheck, CalendarX, CalendarClock, LogIn, LogOut,
  Banknote, Receipt, RotateCcw, ReceiptText, PackageSearch, PackageCheck,
  Sparkles, CheckCircle2, DoorOpen, Wrench, ShieldCheck, AlertTriangle,
  Star, Mail, ShieldAlert, Siren, Trash2, CheckCheck, Shirt, ClipboardList,
  ClipboardCheck, ClipboardX,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useNotifications, type AppNotification } from "@/hooks/useNotifications";
import type { NotificationType } from "@/lib/notifications";
import { useAuth } from "@/contexts/AuthContext";

const TYPE_ICON: Record<NotificationType, React.ComponentType<any>> = {
  new_booking: CalendarCheck,
  booking_cancelled: CalendarX,
  booking_modified: CalendarClock,
  booking_approved: CalendarCheck,
  booking_rejected: CalendarX,
  check_in: LogIn,
  check_out: LogOut,
  walk_in: DoorOpen,
  new_sale: Banknote,
  payment_received: Receipt,
  payment_approved: ReceiptText,
  refund_issued: RotateCcw,
  expense_recorded: Receipt,
  lost_found_item: PackageSearch,
  lost_found_claimed: PackageCheck,
  housekeeping_task: Sparkles,
  housekeeping_task_done: CheckCircle2,
  room_status_change: DoorOpen,
  maintenance_request: Wrench,
  maintenance_resolved: ShieldCheck,
  laundry_request: Shirt,
  laundry_ready: Shirt,
  low_inventory: AlertTriangle,
  staff_alert: ShieldAlert,
  new_review: Star,
  contact_message: Mail,
  system_alert: Siren,
  task_assigned: ClipboardList,
  task_reassigned: ClipboardList,
  task_completed: ClipboardCheck,
  task_overdue: ClipboardX,
  shift_assigned: CalendarCheck,
  shift_updated: CalendarClock,
  shift_cancelled: CalendarX,
};

const SEVERITY_DOT: Record<string, string> = {
  info: "bg-blue-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  critical: "bg-red-500",
};

function timeAgo(n: AppNotification) {
  const date = n.createdAt?.toDate?.();
  if (!date) return "just now";
  try {
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return "just now";
  }
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead, remove } = useNotifications();

  const handleClick = (n: AppNotification, uid: string) => {
    if (!n.readBy?.includes(uid)) markAsRead(n.id).catch(() => {});
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span
              className={cn(
                "absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full",
                "bg-red-500 text-white text-[10px] font-semibold leading-4 text-center",
                "ring-2 ring-card"
              )}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-0 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
          <span className="text-sm font-semibold">Notifications</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => markAllAsRead()}
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark all read
            </Button>
          )}
        </div>

        <ScrollArea className="max-h-[420px]">
          {loading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
          ) : notifications.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              You're all caught up.
            </div>
          ) : (
            <ul>
              {notifications.map((n) => (
                <NotificationRow key={n.id} n={n} icon={TYPE_ICON[n.type] ?? Bell} onOpen={handleClick} onDelete={remove} />
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function NotificationRow({
  n,
  icon: Icon,
  onOpen,
  onDelete,
}: {
  n: AppNotification;
  icon: React.ComponentType<any>;
  onOpen: (n: AppNotification, uid: string) => void;
  onDelete: (id: string) => void;
}) {
  const { adminUser } = useAuth();
  const uid = adminUser?.id ?? "";
  const isUnread = !n.readBy?.includes(uid);

  return (
    <li
      className={cn(
        "group relative flex gap-3 px-3 py-2.5 border-b border-border/60 cursor-pointer transition-colors",
        isUnread ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-accent/50"
      )}
      onClick={() => onOpen(n, uid)}
    >
      <div className="relative shrink-0 mt-0.5">
        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
          <Icon className="w-4 h-4 text-muted-foreground" />
        </div>
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-card",
            SEVERITY_DOT[n.severity] ?? SEVERITY_DOT.info
          )}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={cn("text-sm leading-snug", isUnread ? "font-semibold" : "font-medium text-muted-foreground")}>
            {n.title}
          </p>
          {isUnread && <span className="mt-1 w-2 h-2 rounded-full bg-primary shrink-0" />}
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5 whitespace-pre-line">{n.message}</p>
        <p className="text-[11px] text-muted-foreground/70 mt-1">{timeAgo(n)}</p>
      </div>
      <button
        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 self-start p-1 rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(n.id);
        }}
        aria-label="Delete notification"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </li>
  );
}
