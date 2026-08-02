import { useAuth } from "@/contexts/AuthContext";
import { Link, useLocation } from "wouter";
import { useState, useEffect, useMemo } from "react";
import { registerPushToken } from "@/lib/push";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAdminPwa } from "@/hooks/useAdminPwa";
import { useMessages } from "@/hooks/useMessages";
import { NotificationCenter } from "@/components/admin/NotificationCenter";
import {
  LayoutDashboard, BedDouble, CalendarCheck, Users, UserCog, Shield,
  FileBarChart, History, Settings, Package, Sparkles, ClipboardCheck,
  LogOut, Menu, X, ChevronDown, ChevronRight,
  Banknote, TrendingUp, Receipt, Coffee, Wrench, Bell,
  UserCheck, ShoppingCart, BookOpen, BarChart2, Archive,
  Building2, Utensils, Globe, PackageSearch, Images, MessageSquareText,
  Download, Mail, ShieldOff, Wine, Shirt, CalendarClock, Landmark,
} from "lucide-react";
import type { Role } from "@/lib/rbac";

interface NavItem {
  label: string;
  href?: string;
  icon: React.ComponentType<any>;
  roles?: Role[];
  children?: NavItem[];
  badgeCount?: number;
}

const NAV: NavItem[] = [
  { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { label: "My Tasks", href: "/admin/my-tasks", icon: ClipboardCheck },
  { label: "Messages", href: "/admin/messages", icon: Mail, roles: ["super_admin", "manager", "receptionist"] },
  { label: "Rooms", href: "/admin/rooms", icon: BedDouble },
  { label: "Venues", href: "/admin/venues", icon: Landmark, roles: ["super_admin"] },
  {
    label: "Operations",
    icon: ClipboardCheck,
    roles: ["super_admin", "manager", "operations_manager"],
    children: [
      { label: "Task Assignment", href: "/admin/tasks", icon: ClipboardCheck },
      { label: "Shift Scheduling", href: "/admin/shifts", icon: CalendarClock },
    ],
  },
  {
    label: "Bookings",
    icon: CalendarCheck,
    children: [
      { label: "All Bookings", href: "/admin/bookings", icon: BookOpen },
      { label: "Room Reservations", href: "/admin/room-reservations", icon: Globe, roles: ["super_admin", "receptionist"] },
      { label: "Check-In", href: "/admin/checkin", icon: UserCheck, roles: ["super_admin", "receptionist"] },
      { label: "Check Out", href: "/admin/checkout", icon: LogOut, roles: ["super_admin", "receptionist"] },
    ],
  },
  { label: "Guests", href: "/admin/guests", icon: Users, roles: ["super_admin", "manager", "receptionist"] },
  { label: "Housekeeping", href: "/admin/housekeeping", icon: Sparkles, roles: ["super_admin", "manager", "housekeeping", "operations_manager"] },
  { label: "Lost & Found", href: "/admin/lost-found", icon: PackageSearch, roles: ["super_admin", "manager", "housekeeping"] },
  { label: "Maintenance", href: "/admin/maintenance", icon: Wrench, roles: ["super_admin", "manager", "housekeeping", "operations_manager"] },
  {
    label: "Sales & POS",
    icon: ShoppingCart,
    roles: ["super_admin", "staff"],
    children: [
      { label: "New Sale", href: "/admin/sales/new", icon: ShoppingCart },
      { label: "Sales History", href: "/admin/sales/history", icon: History },
    ],
  },
  {
    label: "Restaurant",
    icon: Coffee,
    roles: ["super_admin", "waiter", "manager", "operations_manager"],
    children: [
      { label: "New Order", href: "/admin/orders/new", icon: Coffee, roles: ["super_admin", "waiter"] },
      { label: "Order History", href: "/admin/orders/history", icon: History, roles: ["super_admin", "waiter", "manager", "operations_manager"] },
      { label: "Menu Management", href: "/admin/restaurant-menu", icon: Utensils, roles: ["super_admin", "manager"] },
    ],
  },
  {
    label: "Bar",
    icon: Wine,
    roles: ["super_admin", "bar_attendant", "manager", "accountant", "operations_manager"],
    children: [
      { label: "New Sale", href: "/admin/bar/new-sale", icon: Wine, roles: ["super_admin", "bar_attendant"] },
      { label: "Sales History", href: "/admin/bar/sales-history", icon: History, roles: ["super_admin", "bar_attendant", "manager", "accountant", "operations_manager"] },
      { label: "Drinks Menu", href: "/admin/bar-menu", icon: Utensils, roles: ["super_admin", "manager"] },
      { label: "Bar Inventory", href: "/admin/bar-inventory", icon: Package, roles: ["super_admin", "manager", "accountant", "bar_attendant"] },
    ],
  },
  {
    label: "Laundry",
    icon: Shirt,
    roles: ["super_admin", "laundry_valet", "manager", "accountant", "operations_manager"],
    children: [
      { label: "Manage Laundry", href: "/admin/laundry", icon: Shirt, roles: ["super_admin", "laundry_valet", "manager"] },
      { label: "Laundry History", href: "/admin/laundry/history", icon: History, roles: ["super_admin", "laundry_valet", "manager", "accountant", "operations_manager"] },
    ],
  },
  {
    label: "Finance",
    icon: Banknote,
    roles: ["super_admin", "accountant", "manager"],
    children: [
      { label: "Approvals", href: "/admin/approvals", icon: Shield, roles: ["super_admin", "accountant", "manager"] },
      { label: "Expenses", href: "/admin/expenses", icon: Receipt },
      { label: "Revenue", href: "/admin/revenue", icon: TrendingUp },
      { label: "Payments", href: "/admin/payments", icon: Banknote },
      { label: "Financial Reports", href: "/admin/financial-reports", icon: BarChart2 },
    ],
  },
  { label: "Inventory", href: "/admin/inventory", icon: Package, roles: ["super_admin", "manager", "accountant"] },
  { label: "Attendance", href: "/admin/attendance", icon: ClipboardCheck, roles: ["super_admin", "manager", "receptionist", "operations_manager"] },
  { label: "Reports", href: "/admin/reports", icon: FileBarChart, roles: ["super_admin", "manager", "accountant"] },
  { label: "Staff Performance", href: "/admin/staff-performance", icon: BarChart2, roles: ["super_admin", "manager"] },
  { label: "Users & Roles", href: "/admin/users", icon: UserCog, roles: ["super_admin"] },
  { label: "Audit Log", href: "/admin/audit-log", icon: History, roles: ["super_admin"] },
  { label: "Deleted Records", href: "/admin/deleted-records", icon: Archive, roles: ["super_admin"] },
  { label: "Website CMS", href: "/admin/cms", icon: BookOpen, roles: ["super_admin"] },
  { label: "Facilities", href: "/admin/facilities", icon: Building2, roles: ["super_admin", "manager"] },
  { label: "Gallery", href: "/admin/gallery", icon: Images, roles: ["super_admin", "manager"] },
  { label: "Guest Reviews", href: "/admin/reviews", icon: MessageSquareText, roles: ["super_admin", "manager"] },
  { label: "Settings", href: "/admin/settings", icon: Settings, roles: ["super_admin"] },
];

function NavLink({ item, role, location, depth = 0 }: { item: NavItem; role: Role; location: string; depth?: number }) {
  const [open, setOpen] = useState(() => item.children?.some(c => c.href === location) ?? false);

  if (item.roles && !item.roles.includes(role)) return null;

  if (item.children) {
    const visibleChildren = item.children.filter(c => !c.roles || c.roles.includes(role));
    if (!visibleChildren.length) return null;

    return (
      <div>
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors text-sm"
        >
          <item.icon className="w-4 h-4 shrink-0" />
          <span className="flex-1 text-left">{item.label}</span>
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
        {open && (
          <div className="ml-4 mt-1 space-y-0.5 border-l border-sidebar-border pl-3">
            {visibleChildren.map(child => (
              <NavLink key={child.href} item={child} role={role} location={location} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isActive = location === item.href;

  return (
    <Link
      href={item.href!}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
        isActive
          ? "bg-sidebar-primary text-sidebar-primary-foreground"
          : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
      )}
    >
      <item.icon className="w-4 h-4 shrink-0" />
      <span className="flex-1">{item.label}</span>
      {!!item.badgeCount && (
        <span
          className={cn(
            "min-w-[1.25rem] h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center",
            isActive ? "bg-sidebar-primary-foreground/20 text-sidebar-primary-foreground" : "bg-primary text-primary-foreground"
          )}
        >
          {item.badgeCount > 99 ? "99+" : item.badgeCount}
        </span>
      )}
    </Link>
  );
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const { adminUser, role, signOut, sessionType } = useAuth();
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Only mounts/registers while an authenticated admin page is showing —
  // see useAdminPwa.ts for why this can't live in main.tsx/index.html.
  const { canInstall, isInstalled, promptInstall } = useAdminPwa();
  // Powers the "Messages" sidebar badge — same realtime Supabase feed the
  // Message Inbox page uses, so the count updates live without polling.
  const { unreadCount: unreadMessages } = useMessages();

  const navWithBadges = useMemo(
    () => NAV.map((item) => (item.href === "/admin/messages" ? { ...item, badgeCount: unreadMessages } : item)),
    [unreadMessages]
  );

  // Register this device for push notifications once signed in. Waits a
  // beat so it runs after the admin-sw.js registration in useAdminPwa above
  // has had a chance to start; registerPushToken awaits navigator.serviceWorker.ready
  // itself, so this is just about not competing for the initial paint.
  useEffect(() => {
    if (!adminUser) return;
    const timer = setTimeout(() => {
      registerPushToken(adminUser.id);
    }, 1500);
    return () => clearTimeout(timer);
  }, [adminUser?.id]);

  if (!role) {
    // A Firebase Auth session exists but no usable admin role was resolved
    // for it — e.g. the /users/{uid} profile is missing, disabled, or
    // still being provisioned. This used to `return null`, which renders
    // a completely blank page with zero explanation. Show something
    // actionable instead of failing silently.
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-sm text-center space-y-4">
          <div className="w-14 h-14 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
            <ShieldOff className="w-7 h-7 text-destructive" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">No admin access on this account</h2>
            <p className="text-muted-foreground text-sm mt-1">
              You're signed in, but this account isn't set up with an admin role yet. Contact a
              super admin to have your account added, or sign out and try a different account.
            </p>
          </div>
          <Button variant="outline" className="gap-2" onClick={signOut}>
            <LogOut className="w-4 h-4" /> Sign out
          </Button>
        </div>
      </div>
    );
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <img
            src="/brand/logo-mark.png"
            srcSet="/brand/logo-mark.png 1x, /brand/logo-mark@2x.png 2x"
            alt="Westly Hotel"
            className="w-9 h-9 object-contain shrink-0"
          />
          <div>
            <div className="font-serif text-sm font-bold text-sidebar-foreground">Westly Hotel</div>
            <div className="text-[10px] text-sidebar-foreground/50 uppercase tracking-wider">Management</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {navWithBadges.map((item) => (
          <NavLink key={item.href ?? item.label} item={item} role={role} location={location} />
        ))}
      </nav>

      {/* User info */}
      <div className="p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-3 p-2 rounded-lg bg-sidebar-accent mb-2">
          <div className="w-8 h-8 rounded-full bg-sidebar-primary flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-sidebar-primary-foreground">
              {adminUser?.name?.charAt(0)?.toUpperCase() ?? "?"}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-sidebar-foreground truncate">{adminUser?.name}</div>
            <div className="text-[10px] text-sidebar-foreground/50 truncate capitalize">
              {role?.replace("_", " ")}
              {sessionType === "pin" && (
                <span className="ml-1 text-sidebar-primary">(PIN)</span>
              )}
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={signOut}
        >
          <LogOut className="w-4 h-4" />
          {sessionType === "pin" ? "End Session" : "Sign Out"}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-muted/30 overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 bg-sidebar flex-col border-r border-sidebar-border">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <aside className="relative w-60 bg-sidebar flex flex-col shadow-2xl">
            <button
              className="absolute top-3 right-3 text-sidebar-foreground/50 hover:text-sidebar-foreground"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="w-5 h-5" />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-14 bg-card border-b border-border flex items-center gap-4 px-4 shrink-0">
          <button
            className="md:hidden p-2 rounded-md text-muted-foreground hover:text-foreground"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <NotificationCenter />
            {canInstall && !isInstalled && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={promptInstall}
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Install App</span>
              </Button>
            )}
            <Badge variant="outline" className="text-xs capitalize hidden sm:flex">
              {role?.replace("_", " ")}
            </Badge>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="max-w-[1600px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
