import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCollection } from "@/hooks/useFirebase";
import { where } from "firebase/firestore";
import { createUserAccount, resetUserPassword, resetUserPin, setUserStatus } from "@/lib/adminApi";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Users, Plus, UserCheck, UserX, Loader2, Shield, KeyRound, Lock } from "lucide-react";
import { ROLE_LABELS, ROLE_COLORS, type Role } from "@/lib/rbac";
import { formatDate, toFirestoreDate } from "@/lib/utils";
import { DataError } from "@/components/ui/data-error";

export default function UsersPage() {
  const { adminUser } = useAuth();
  const { toast } = useToast();
  const { data: users, loading, error } = useCollection("users", [where("isDeleted", "!=", true)]);

  const [showDialog, setShowDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", email: "", password: "", phone: "", role: "receptionist" as Role, pin: "",
  });

  // Reset password / PIN dialogs — both target this user
  const [resetTarget, setResetTarget] = useState<{ id: string; name: string; mode: "password" | "pin" } | null>(null);
  const [resetValue, setResetValue] = useState("");
  const [resetting, setResetting] = useState(false);

  // Suspend/restore is per-row; track which row so only that button spins
  const [statusChangingId, setStatusChangingId] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (form.password.length < 8) throw new Error("Password must be at least 8 characters.");

      await createUserAccount({
        name: form.name,
        email: form.email,
        password: form.password,
        phone: form.phone || undefined,
        role: form.role,
        pin: form.pin || undefined,
      });

      toast({ title: "User Created", description: `${form.name} can now log in.` });
      setForm({ name: "", email: "", password: "", phone: "", role: "receptionist", pin: "" });
      setShowDialog(false);
    } catch (err: any) {
      toast({ title: "Failed to Create User", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const toggleStatus = async (user: any) => {
    const newStatus = user.status === "active" ? "suspended" : "active";
    setStatusChangingId(user.id);
    try {
      await setUserStatus(user.id, newStatus);
      toast({ title: newStatus === "active" ? "User Restored" : "User Suspended" });
    } catch (err: any) {
      toast({ title: "Failed to Update Status", description: err.message, variant: "destructive" });
    }
    setStatusChangingId(null);
  };

  const openReset = (user: any, mode: "password" | "pin") => {
    setResetTarget({ id: user.id, name: user.name, mode });
    setResetValue("");
  };

  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setResetting(true);
    try {
      if (resetTarget.mode === "password") {
        if (resetValue.length < 8) throw new Error("Password must be at least 8 characters.");
        await resetUserPassword(resetTarget.id, resetValue);
        toast({ title: "Password Reset", description: `${resetTarget.name}'s password has been updated.` });
      } else {
        if (resetValue.length < 4) throw new Error("PIN must be at least 4 digits.");
        await resetUserPin(resetTarget.id, resetValue);
        toast({ title: "PIN Reset", description: `${resetTarget.name}'s PIN has been updated.` });
      }
      setResetTarget(null);
    } catch (err: any) {
      toast({ title: "Reset Failed", description: err.message, variant: "destructive" });
    }
    setResetting(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold">Users</h1>
          <p className="text-muted-foreground text-sm">{users.length} staff accounts</p>
        </div>
        <Button className="gap-2" onClick={() => setShowDialog(true)}>
          <Plus className="w-4 h-4" /> Add User
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <DataError message="We couldn't load staff accounts." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Name</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Role</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">PIN Login</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Last Login</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user: any) => (
                    <tr key={user.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-xs font-bold text-primary">{user.name?.[0]}</span>
                          </div>
                          <div>
                            <p className="font-medium">{user.name}</p>
                            <p className="text-xs text-muted-foreground">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${ROLE_COLORS[user.role as Role] || ""}`}>
                          {ROLE_LABELS[user.role as Role] || user.role}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={user.status === "active" ? "default" : "destructive"} className="text-[11px]">
                          {user.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        {user.pinHash ? (
                          <Badge variant="outline" className="text-[10px] gap-1"><KeyRound className="w-3 h-3" />Set</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground text-xs">
                        {formatDate(toFirestoreDate(user.lastLogin)) || "Never"}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1 flex-wrap">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => openReset(user, "password")}
                          >
                            <Lock className="w-3 h-3" />Password
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => openReset(user, "pin")}
                          >
                            <KeyRound className="w-3 h-3" />PIN
                          </Button>
                          {user.id !== adminUser?.id && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={statusChangingId === user.id}
                              className={`h-7 text-xs gap-1 ${user.status === "active" ? "text-destructive hover:text-destructive" : "text-green-600 hover:text-green-700"}`}
                              onClick={() => toggleStatus(user)}
                            >
                              {statusChangingId === user.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : user.status === "active" ? (
                                <><UserX className="w-3 h-3" />Suspend</>
                              ) : (
                                <><UserCheck className="w-3 h-3" />Restore</>
                              )}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create user dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label>Full Name *</Label>
                <Input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
              </div>
              <div className="space-y-1.5">
                <Label>Email *</Label>
                <Input required type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input type="tel" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
              </div>
              <div className="space-y-1.5">
                <Label>Password * (min 8 chars)</Label>
                <Input required type="password" minLength={8} value={form.password} onChange={e => setForm({...form, password: e.target.value})} />
              </div>
              <div className="space-y-1.5">
                <Label>Role *</Label>
                <Select value={form.role} onValueChange={v => setForm({...form, role: v as Role})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>PIN (4-6 digits, for shared devices)</Label>
                <Input type="password" maxLength={6} value={form.pin} onChange={e => setForm({...form, pin: e.target.value.replace(/\D/g,"")})} placeholder="Optional" />
              </div>
            </div>
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted p-3 rounded">
              <Shield className="w-4 h-4 shrink-0 mt-0.5" />
              PIN is only used by shared-device roles (Receptionist, Staff, Waiter, Housekeeping, Bar Attendant, Laundry Valet).
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={saving} className="gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}Create User
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reset password / PIN dialog */}
      <Dialog open={!!resetTarget} onOpenChange={(open) => !open && setResetTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Reset {resetTarget?.mode === "password" ? "Password" : "PIN"} — {resetTarget?.name}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={submitReset} className="space-y-4">
            <div className="space-y-1.5">
              <Label>
                {resetTarget?.mode === "password" ? "New Password * (min 8 chars)" : "New PIN * (4-6 digits)"}
              </Label>
              <Input
                required
                type="password"
                minLength={resetTarget?.mode === "password" ? 8 : 4}
                maxLength={resetTarget?.mode === "pin" ? 6 : undefined}
                value={resetValue}
                onChange={(e) =>
                  setResetValue(
                    resetTarget?.mode === "pin" ? e.target.value.replace(/\D/g, "") : e.target.value
                  )
                }
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setResetTarget(null)}>Cancel</Button>
              <Button type="submit" disabled={resetting} className="gap-2">
                {resetting && <Loader2 className="w-4 h-4 animate-spin" />}Reset
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
