import { Route, Switch, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

// Public pages
import HomePage from "@/pages/public/HomePage";
import RoomsPage from "@/pages/public/RoomsPage";
import RoomDetailPage from "@/pages/public/RoomDetailPage";
import GalleryPage from "@/pages/public/GalleryPage";
import FacilitiesPage from "@/pages/public/FacilitiesPage";
import VenuePage from "@/pages/public/VenuePage";
import RestaurantPage from "@/pages/public/RestaurantPage";
import AboutPage from "@/pages/public/AboutPage";
import ContactPage from "@/pages/public/ContactPage";
import BookingPage from "@/pages/public/BookingPage";
import BookingConfirmationPage from "@/pages/public/BookingConfirmationPage";
import FAQPage from "@/pages/public/FAQPage";
import TestimonialsPage from "@/pages/public/TestimonialsPage";
import DigitalMenuPage from "@/pages/public/DigitalMenuPage";
import GuestOrderPage from "@/pages/public/GuestOrderPage";
import PublicLayout from "@/components/public/PublicLayout";
import AdminShell from "@/components/admin/AdminShell";

// Admin auth
import AdminLoginPage from "@/pages/admin/auth/AdminLoginPage";
import PinLoginPage from "@/pages/admin/auth/PinLoginPage";
import AdminSetupPage from "@/pages/admin/auth/AdminSetupPage";

// Admin pages
import DashboardPage from "@/pages/admin/DashboardPage";
import RoomsAdminPage from "@/pages/admin/RoomsAdminPage";
import VenuesAdminPage from "@/pages/admin/VenuesAdminPage";
import BookingsPage from "@/pages/admin/BookingsPage";
import RoomReservationsPage from "@/pages/admin/RoomReservationsPage";
import CheckOutPage from "@/pages/admin/CheckOutPage";
import WalkInPage from "@/pages/admin/WalkInPage";
import GuestsPage from "@/pages/admin/GuestsPage";
import UsersPage from "@/pages/admin/UsersPage";
import RolesPage from "@/pages/admin/RolesPage";
import ReportsPage from "@/pages/admin/ReportsPage";
import AuditLogPage from "@/pages/admin/AuditLogPage";
import DeletedRecordsPage from "@/pages/admin/DeletedRecordsPage";
import CMSPage from "@/pages/admin/CMSPage";
import FacilitiesManagementPage from "@/pages/admin/FacilitiesManagementPage";
import GalleryManagementPage from "@/pages/admin/GalleryManagementPage";
import ReviewsManagementPage from "@/pages/admin/ReviewsManagementPage";
import RestaurantManagementPage from "@/pages/admin/RestaurantManagementPage";
import SettingsPage from "@/pages/admin/SettingsPage";
import InventoryPage from "@/pages/admin/InventoryPage";
import HousekeepingPage from "@/pages/admin/HousekeepingPage";
import LostFoundPage from "@/pages/admin/LostFoundPage";
import MaintenancePage from "@/pages/admin/MaintenancePage";
import AttendancePage from "@/pages/admin/AttendancePage";
import AttendanceRecordPage from "@/pages/admin/AttendanceRecordPage";
import NewSalePage from "@/pages/admin/NewSalePage";
import SalesHistoryPage from "@/pages/admin/SalesHistoryPage";
import NewOrderPage from "@/pages/admin/NewOrderPage";
import OrdersHistoryPage from "@/pages/admin/OrdersHistoryPage";
import ExpensesPage from "@/pages/admin/ExpensesPage";
import RevenuePage from "@/pages/admin/RevenuePage";
import FinancialReportsPage from "@/pages/admin/FinancialReportsPage";
import StaffPerformancePage from "@/pages/admin/StaffPerformancePage";
import PaymentsPage from "@/pages/admin/PaymentsPage";
import ApprovalsPage from "@/pages/admin/ApprovalsPage";
import MessagesPage from "@/pages/admin/MessagesPage";
import BarMenuPage from "@/pages/admin/BarMenuPage";
import BarNewSalePage from "@/pages/admin/BarNewSalePage";
import BarSalesHistoryPage from "@/pages/admin/BarSalesHistoryPage";
import BarInventoryPage from "@/pages/admin/BarInventoryPage";
import LaundryPage from "@/pages/admin/LaundryPage";
import LaundryHistoryPage from "@/pages/admin/LaundryHistoryPage";
import TasksPage from "@/pages/admin/TasksPage";
import MyTasksPage from "@/pages/admin/MyTasksPage";
import ShiftSchedulingPage from "@/pages/admin/ShiftSchedulingPage";

import NotFound from "@/pages/not-found";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

// ── Protected admin route HOC ─────────────────────────────────────────────────
function ProtectedRoute({
  component: Component,
  allowedRoles,
}: {
  component: React.ComponentType<any>;
  allowedRoles?: string[];
}) {
  return function ProtectedRouteWrapper(props: any) {
    const { user, adminUser, role, isLoading: loading } = useAuth();

    if (loading) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      );
    }

    if (!user || !adminUser) {
      return <Redirect to="/admin/login" />;
    }

    if (adminUser.status !== "active") {
      return <Redirect to="/admin/login" />;
    }

    if (allowedRoles && role && !allowedRoles.includes(role)) {
      return <Redirect to="/admin/dashboard" />;
    }

    return (
      <ErrorBoundary label="Admin panel">
        <AdminShell>
          <ErrorBoundary label={Component.displayName || Component.name}>
            <Component {...props} />
          </ErrorBoundary>
        </AdminShell>
      </ErrorBoundary>
    );
  };
}

// ── Public route wrapper (no auth required) ───────────────────────────────────
function PublicRoute({ component: Component }: { component: React.ComponentType<any> }) {
  return function PublicRouteWrapper(props: any) {
    return (
      <PublicLayout>
        <ErrorBoundary label={Component.displayName || Component.name}>
          <Component {...props} />
        </ErrorBoundary>
      </PublicLayout>
    );
  };
}

// ── Standalone route wrapper (no site nav/footer — for QR-code landing pages) ─
function StandaloneRoute({ component: Component }: { component: React.ComponentType<any> }) {
  return function StandaloneRouteWrapper(props: any) {
    return (
      <ErrorBoundary label={Component.displayName || Component.name}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}

// ── Router ────────────────────────────────────────────────────────────────────
function Router() {
  return (
    <Switch>
      {/* ── Public routes ── */}
      <Route path="/" component={PublicRoute({ component: HomePage })} />
      <Route path="/rooms" component={PublicRoute({ component: RoomsPage })} />
      <Route path="/rooms/:id" component={PublicRoute({ component: RoomDetailPage })} />
      <Route path="/gallery" component={PublicRoute({ component: GalleryPage })} />
      <Route path="/facilities" component={PublicRoute({ component: FacilitiesPage })} />
      <Route path="/venues" component={PublicRoute({ component: VenuePage })} />
      <Route path="/restaurant" component={PublicRoute({ component: RestaurantPage })} />
      <Route path="/about" component={PublicRoute({ component: AboutPage })} />
      <Route path="/contact" component={PublicRoute({ component: ContactPage })} />
      <Route path="/booking" component={PublicRoute({ component: BookingPage })} />
      <Route path="/booking/confirmation" component={PublicRoute({ component: BookingConfirmationPage })} />
      <Route path="/faq" component={PublicRoute({ component: FAQPage })} />
      <Route path="/testimonials" component={PublicRoute({ component: TestimonialsPage })} />

      {/* ── QR code landing pages (no site nav — mobile-first, guest-facing) ── */}
      <Route path="/menu" component={StandaloneRoute({ component: DigitalMenuPage })} />
      <Route path="/order" component={StandaloneRoute({ component: GuestOrderPage })} />

      {/* ── Admin auth routes (unauthenticated) ── */}
      <Route path="/admin/login" component={AdminLoginPage} />
      <Route path="/admin/pin" component={PinLoginPage} />
      <Route path="/admin/setup" component={AdminSetupPage} />

      {/* ── Protected admin routes ── */}
      <Route path="/admin" component={() => <Redirect to="/admin/dashboard" />} />
      <Route path="/admin/dashboard" component={ProtectedRoute({ component: DashboardPage })} />
      <Route path="/admin/rooms" component={ProtectedRoute({ component: RoomsAdminPage })} />
      <Route path="/admin/venues" component={ProtectedRoute({ component: VenuesAdminPage, allowedRoles: ["super_admin"] })} />
      <Route path="/admin/bookings" component={ProtectedRoute({ component: BookingsPage })} />
      <Route path="/admin/checkin" component={ProtectedRoute({ component: WalkInPage, allowedRoles: ["super_admin", "receptionist"] })} />
      <Route path="/admin/checkout" component={ProtectedRoute({ component: CheckOutPage, allowedRoles: ["super_admin", "receptionist"] })} />
      <Route path="/admin/room-reservations" component={ProtectedRoute({ component: RoomReservationsPage, allowedRoles: ["super_admin", "receptionist"] })} />
      <Route path="/admin/guests" component={ProtectedRoute({ component: GuestsPage })} />
      <Route path="/admin/users" component={ProtectedRoute({ component: UsersPage, allowedRoles: ["super_admin"] })} />
      <Route path="/admin/roles" component={ProtectedRoute({ component: RolesPage, allowedRoles: ["super_admin"] })} />
      <Route path="/admin/reports" component={ProtectedRoute({ component: ReportsPage, allowedRoles: ["super_admin", "manager", "accountant"] })} />
      <Route path="/admin/audit-log" component={ProtectedRoute({ component: AuditLogPage, allowedRoles: ["super_admin"] })} />
      <Route path="/admin/deleted-records" component={ProtectedRoute({ component: DeletedRecordsPage, allowedRoles: ["super_admin"] })} />
      <Route path="/admin/cms" component={ProtectedRoute({ component: CMSPage, allowedRoles: ["super_admin"] })} />
      <Route path="/admin/facilities" component={ProtectedRoute({ component: FacilitiesManagementPage, allowedRoles: ["super_admin", "manager"] })} />
      <Route path="/admin/gallery" component={ProtectedRoute({ component: GalleryManagementPage, allowedRoles: ["super_admin", "manager"] })} />
      <Route path="/admin/reviews" component={ProtectedRoute({ component: ReviewsManagementPage, allowedRoles: ["super_admin", "manager"] })} />
      <Route path="/admin/restaurant-menu" component={ProtectedRoute({ component: RestaurantManagementPage, allowedRoles: ["super_admin", "manager"] })} />
      <Route path="/admin/settings" component={ProtectedRoute({ component: SettingsPage, allowedRoles: ["super_admin"] })} />
      <Route path="/admin/inventory" component={ProtectedRoute({ component: InventoryPage, allowedRoles: ["super_admin", "manager", "accountant"] })} />
      <Route path="/admin/housekeeping" component={ProtectedRoute({ component: HousekeepingPage, allowedRoles: ["super_admin", "manager", "housekeeping", "operations_manager"] })} />
      <Route path="/admin/lost-found" component={ProtectedRoute({ component: LostFoundPage, allowedRoles: ["super_admin", "manager", "housekeeping"] })} />
      <Route path="/admin/maintenance" component={ProtectedRoute({ component: MaintenancePage, allowedRoles: ["super_admin", "manager", "housekeeping", "operations_manager"] })} />
      <Route path="/admin/attendance" component={ProtectedRoute({ component: AttendancePage, allowedRoles: ["super_admin", "manager", "receptionist", "operations_manager"] })} />
      <Route path="/admin/attendance/record" component={ProtectedRoute({ component: AttendanceRecordPage, allowedRoles: ["super_admin", "receptionist"] })} />
      <Route path="/admin/sales/new" component={ProtectedRoute({ component: NewSalePage, allowedRoles: ["super_admin", "staff"] })} />
      <Route path="/admin/sales/history" component={ProtectedRoute({ component: SalesHistoryPage, allowedRoles: ["super_admin", "staff", "manager", "accountant"] })} />
      <Route path="/admin/orders/new" component={ProtectedRoute({ component: NewOrderPage, allowedRoles: ["super_admin", "waiter"] })} />
      <Route path="/admin/orders/history" component={ProtectedRoute({ component: OrdersHistoryPage, allowedRoles: ["super_admin", "waiter", "manager", "accountant", "operations_manager"] })} />
      <Route path="/admin/expenses" component={ProtectedRoute({ component: ExpensesPage, allowedRoles: ["super_admin", "accountant", "manager"] })} />
      <Route path="/admin/revenue" component={ProtectedRoute({ component: RevenuePage, allowedRoles: ["super_admin", "accountant", "manager"] })} />
      <Route path="/admin/financial-reports" component={ProtectedRoute({ component: FinancialReportsPage, allowedRoles: ["super_admin", "accountant", "manager"] })} />
      <Route path="/admin/staff-performance" component={ProtectedRoute({ component: StaffPerformancePage, allowedRoles: ["super_admin", "manager"] })} />
      <Route path="/admin/payments" component={ProtectedRoute({ component: PaymentsPage, allowedRoles: ["super_admin", "receptionist", "accountant", "manager"] })} />
      <Route path="/admin/approvals" component={ProtectedRoute({ component: ApprovalsPage, allowedRoles: ["super_admin", "accountant", "manager"] })} />
      <Route path="/admin/messages" component={ProtectedRoute({ component: MessagesPage, allowedRoles: ["super_admin", "manager", "receptionist"] })} />

      {/* ── Bar module ── */}
      <Route path="/admin/bar-menu" component={ProtectedRoute({ component: BarMenuPage, allowedRoles: ["super_admin", "manager"] })} />
      <Route path="/admin/bar/new-sale" component={ProtectedRoute({ component: BarNewSalePage, allowedRoles: ["super_admin", "bar_attendant"] })} />
      <Route path="/admin/bar/sales-history" component={ProtectedRoute({ component: BarSalesHistoryPage, allowedRoles: ["super_admin", "bar_attendant", "manager", "accountant", "operations_manager"] })} />
      <Route path="/admin/bar-inventory" component={ProtectedRoute({ component: BarInventoryPage, allowedRoles: ["super_admin", "manager", "accountant", "bar_attendant"] })} />

      {/* ── Laundry module ── */}
      <Route path="/admin/laundry" component={ProtectedRoute({ component: LaundryPage, allowedRoles: ["super_admin", "manager", "laundry_valet"] })} />
      <Route path="/admin/laundry/history" component={ProtectedRoute({ component: LaundryHistoryPage, allowedRoles: ["super_admin", "manager", "laundry_valet", "accountant", "operations_manager"] })} />

      {/* ── Operations Manager: task assignment ── */}
      <Route path="/admin/tasks" component={ProtectedRoute({ component: TasksPage, allowedRoles: ["super_admin", "manager", "operations_manager"] })} />
      <Route path="/admin/shifts" component={ProtectedRoute({ component: ShiftSchedulingPage, allowedRoles: ["super_admin", "manager", "operations_manager"] })} />
      {/* My Tasks is open to any signed-in staff role — whoever a task is assigned to. */}
      <Route path="/admin/my-tasks" component={ProtectedRoute({ component: MyTasksPage })} />

      <Route component={NotFound} />
    </Switch>
  );
}

// ── App root ──────────────────────────────────────────────────────────────────
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
