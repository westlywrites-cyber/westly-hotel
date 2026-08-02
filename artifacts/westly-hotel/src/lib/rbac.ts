export type Role =
  | "super_admin" | "manager" | "receptionist" | "staff" | "waiter" | "accountant"
  | "housekeeping" | "bar_attendant" | "laundry_valet" | "operations_manager"
  // Added for Operations Manager shift scheduling + task assignment coverage —
  // multi-staff front-line roles that previously had no formal account type.
  | "maintenance_technician" | "security_guard" | "driver" | "restaurant_attendant" | "kitchen_staff";

// PIN-eligible roles: lower-privilege roles that share devices
// operations_manager is a supervisory role, like manager/accountant — full
// email/password account only, not a shared-device PIN role.
export const PIN_ELIGIBLE_ROLES: Role[] = [
  "receptionist", "staff", "waiter", "housekeeping", "bar_attendant", "laundry_valet",
  "maintenance_technician", "security_guard", "driver", "restaurant_attendant", "kitchen_staff",
];

// Roles a shift schedule can be built for — every role that normally has
// more than one employee on the roster and works rostered shifts. Used by
// the Shift Scheduling module (ShiftSchedulingPage) as the role picker.
export const SHIFT_ROLES: Role[] = [
  "receptionist", "housekeeping", "waiter", "bar_attendant", "laundry_valet",
  "maintenance_technician", "security_guard", "driver", "restaurant_attendant", "kitchen_staff",
];

// Roles that MUST use email/password login, never PIN
export const FULL_AUTH_ONLY_ROLES: Role[] = ["super_admin", "manager", "accountant", "operations_manager"];

export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  super_admin: ["*"],
  manager: [
    "view:all",
    "approve:bookings",
    "reject:bookings",
    "view:reports",
    "view:attendance",
    "view:inventory",
    "request:delete",
    "view:staff_performance",
    "view:financial_summary",
    "view:lost_found",
    "update:lost_found_status",
    "view:messages",
    "reply:messages",
  ],
  receptionist: [
    "checkin",
    "checkout",
    "register:walkin",
    "manage:bookings",
    "create:bookings",
    "view:rooms",
    "record:payment",
    "record:attendance",
    "view:attendance",
    "print:receipts",
    "view:guests",
    "create:guests",
    "view:messages",
    "reply:messages",
  ],
  staff: [
    "record:sales",
    "view:own_sales",
  ],
  waiter: [
    "record:orders",
    "view:own_orders",
  ],
  accountant: [
    "record:expenses",
    "view:revenue",
    "generate:reports",
    "export:reports",
    "view:financial_reports",
    "view:payments",
  ],
  housekeeping: [
    "view:rooms_cleaning",
    "mark:room_clean",
    "report:damage",
    "request:maintenance",
    "create:lost_found",
    "view:lost_found",
  ],
  bar_attendant: [
    "record:bar_sales",
    "view:own_bar_sales",
    "view:bar_menu",
    "view:bar_inventory",
  ],
  laundry_valet: [
    "record:laundry_requests",
    "view:own_laundry_requests",
    "update:laundry_status",
  ],
  operations_manager: [
    "view:rooms",
    "view:housekeeping",
    "view:maintenance",
    "view:restaurant_orders",
    "view:bar_orders",
    "view:laundry_requests",
    "view:attendance",
    "view:operational_reports",
    "view:checkins_checkouts",
    "create:tasks",
    "assign:tasks",
    "reassign:tasks",
    "view:all_tasks",
    "create:shifts",
    "manage:shifts",
    "view:all_shifts",
  ],
  maintenance_technician: [
    "view:maintenance",
    "update:maintenance_status",
    "view:own_tasks",
    "view:own_shifts",
  ],
  security_guard: [
    "view:own_tasks",
    "view:own_shifts",
  ],
  driver: [
    "view:own_tasks",
    "view:own_shifts",
  ],
  restaurant_attendant: [
    "view:own_tasks",
    "view:own_shifts",
  ],
  kitchen_staff: [
    "view:own_tasks",
    "view:own_shifts",
  ],
};

export function hasPermission(role: Role, permission: string): boolean {
  if (role === "super_admin") return true;
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes("*") || permissions.includes(permission);
}

export function canUsePinLogin(role: Role): boolean {
  return PIN_ELIGIBLE_ROLES.includes(role);
}

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  manager: "Manager",
  receptionist: "Receptionist",
  accountant: "Accountant",
  staff: "Staff",
  waiter: "Waiter",
  housekeeping: "Housekeeping",
  bar_attendant: "Bar Attendant",
  laundry_valet: "Laundry Valet",
  operations_manager: "Operations Manager",
  maintenance_technician: "Maintenance Technician",
  security_guard: "Security Guard",
  driver: "Driver",
  restaurant_attendant: "Restaurant Attendant",
  kitchen_staff: "Kitchen Staff",
};

export const ROLE_COLORS: Record<Role, string> = {
  super_admin: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  manager: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  receptionist: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  accountant: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  staff: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  waiter: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400",
  housekeeping: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400",
  bar_attendant: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/30 dark:text-fuchsia-400",
  laundry_valet: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400",
  operations_manager: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
  maintenance_technician: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  security_guard: "bg-stone-100 text-stone-800 dark:bg-stone-900/30 dark:text-stone-400",
  driver: "bg-lime-100 text-lime-800 dark:bg-lime-900/30 dark:text-lime-400",
  restaurant_attendant: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400",
  kitchen_staff: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};
