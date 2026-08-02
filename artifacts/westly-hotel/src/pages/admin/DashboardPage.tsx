import { useAuth } from "@/contexts/AuthContext";
import SuperAdminDashboard from "@/components/admin/dashboards/SuperAdminDashboard";
import ManagerDashboard from "@/components/admin/dashboards/ManagerDashboard";
import ReceptionistDashboard from "@/components/admin/dashboards/ReceptionistDashboard";
import AccountantDashboard from "@/components/admin/dashboards/AccountantDashboard";
import StaffDashboard from "@/components/admin/dashboards/StaffDashboard";
import WaiterDashboard from "@/components/admin/dashboards/WaiterDashboard";
import HousekeepingDashboard from "@/components/admin/dashboards/HousekeepingDashboard";
import BarAttendantDashboard from "@/components/admin/dashboards/BarAttendantDashboard";
import LaundryValetDashboard from "@/components/admin/dashboards/LaundryValetDashboard";
import OperationsManagerDashboard from "@/components/admin/dashboards/OperationsManagerDashboard";

export default function DashboardPage() {
  const { role } = useAuth();

  switch (role) {
    case "super_admin": return <SuperAdminDashboard />;
    case "manager":     return <ManagerDashboard />;
    case "receptionist": return <ReceptionistDashboard />;
    case "accountant":  return <AccountantDashboard />;
    case "staff":       return <StaffDashboard />;
    case "waiter":      return <WaiterDashboard />;
    case "housekeeping": return <HousekeepingDashboard />;
    case "bar_attendant": return <BarAttendantDashboard />;
    case "laundry_valet": return <LaundryValetDashboard />;
    case "operations_manager": return <OperationsManagerDashboard />;
    default:            return <SuperAdminDashboard />;
  }
}
