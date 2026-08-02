import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, Check } from "lucide-react";
import { ROLE_LABELS, ROLE_COLORS, ROLE_PERMISSIONS, type Role } from "@/lib/rbac";

const ROLES = Object.keys(ROLE_LABELS) as Role[];

export default function RolesPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-2xl font-bold flex items-center gap-2">
          <Shield className="w-6 h-6 text-primary" /> Roles & Permissions
        </h1>
        <p className="text-muted-foreground text-sm">Read-only reference of role permissions. Update roles by editing the codebase.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {ROLES.map(role => (
          <Card key={role}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{ROLE_LABELS[role]}</CardTitle>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[role]}`}>
                  {role}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              {role === "super_admin" ? (
                <div className="flex items-center gap-2 text-sm text-primary">
                  <Check className="w-4 h-4" />
                  <span className="font-medium">Full access to all features</span>
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {ROLE_PERMISSIONS[role].map(perm => (
                    <span key={perm} className="px-2 py-0.5 bg-muted text-muted-foreground rounded text-[11px] font-mono">
                      {perm}
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10">
        <CardContent className="p-4">
          <h3 className="font-semibold text-sm mb-2">Authentication Rules</h3>
          <ul className="text-sm text-muted-foreground space-y-1.5">
            <li>• <strong>Email/Password Login:</strong> Super Admin, Manager, Accountant, Operations Manager</li>
            <li>• <strong>PIN Login (shared devices):</strong> Receptionist, Staff, Waiter, Housekeeping, Bar Attendant, Laundry Valet</li>
            <li>• PIN sessions auto-expire after <strong>15 minutes</strong> of inactivity</li>
            <li>• Suspended users are blocked from all login methods immediately</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
