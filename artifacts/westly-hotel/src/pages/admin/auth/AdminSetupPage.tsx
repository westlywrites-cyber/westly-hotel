import { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { hashPin } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Shield, Loader2, CheckCircle, AlertTriangle } from "lucide-react";
import { Link } from "wouter";

export default function AdminSetupPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    role: "receptionist",
    pin: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) {
      toast({ title: "Missing fields", description: "Name, email and password are required.", variant: "destructive" });
      return;
    }
    if (form.password.length < 8) {
      toast({ title: "Weak password", description: "Password must be at least 8 characters.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      // Create Firebase Auth account
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);

      const pinHash = form.pin && form.pin.length >= 4 ? await hashPin(form.pin) : null;

      // Store admin profile in Firestore
      await setDoc(doc(db, "users", cred.user.uid), {
        name: form.name,
        email: form.email,
        phone: form.phone || null,
        role: form.role,
        status: "pending",
        pinHash,
        isDeleted: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setSuccess(true);
      toast({ title: "Account Created", description: `${form.name} can now log in.` });
    } catch (error: any) {
      toast({ title: "Setup Failed", description: error.message, variant: "destructive" });
    }
    setLoading(false);
  };

  if (success) {
    return (
      <div className="min-h-screen bg-sidebar flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center p-8">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="font-serif text-2xl font-bold mb-2">Account Created</h2>
          <p className="text-muted-foreground mb-6">
            {form.name}'s account was created with "pending" status. If there's already
            an active Super Admin, they can activate it from Users &amp; Roles. If this is
            your very first account, open Firebase Console → Firestore → users → this
            document, and change status to "active" manually.
          </p>
          <div className="flex gap-3 justify-center">
            <Link href="/admin/login">
              <Button>Go to Login</Button>
            </Link>
            <Button variant="outline" onClick={() => { setSuccess(false); setForm({ name: "", email: "", password: "", phone: "", role: "receptionist", pin: "" }); }}>
              Create Another
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-sidebar flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center">
          <img
            src="/brand/logo-mark.png"
            srcSet="/brand/logo-mark.png 1x, /brand/logo-mark@2x.png 2x"
            alt="Westly Hotel"
            className="w-16 h-16 object-contain mx-auto mb-4"
          />
          <h1 className="font-serif text-2xl font-bold text-sidebar-foreground">Create Admin Account</h1>
          <p className="text-sidebar-foreground/50 text-sm mt-1">Set up a new staff member account</p>
        </div>

        <Alert className="bg-yellow-900/20 border-yellow-700/50">
          <AlertTriangle className="w-4 h-4 text-yellow-400" />
          <AlertDescription className="text-yellow-300/80 text-xs">
            This page is for initial setup. In production, accounts should be created by a Super Admin through the Users panel.
          </AlertDescription>
        </Alert>

        <Card className="bg-card/95 backdrop-blur shadow-2xl">
          <form onSubmit={handleSubmit}>
            <CardHeader>
              <CardTitle>Staff Details</CardTitle>
              <CardDescription>All fields marked * are required</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Full Name *</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Jane Doe" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Email *</Label>
                  <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="jane@hotel.com" required />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+1 555..." />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Password *</Label>
                <Input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Min. 8 characters" minLength={8} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Role *</Label>
                  <Select value={form.role} onValueChange={val => setForm({ ...form, role: val })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="super_admin">Super Admin</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="receptionist">Receptionist</SelectItem>
                      <SelectItem value="accountant">Accountant</SelectItem>
                      <SelectItem value="staff">Staff</SelectItem>
                      <SelectItem value="waiter">Waiter</SelectItem>
                      <SelectItem value="housekeeping">Housekeeping</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Device PIN (4-6 digits)</Label>
                  <Input
                    type="password"
                    maxLength={6}
                    value={form.pin}
                    onChange={e => setForm({ ...form, pin: e.target.value.replace(/\D/g, "") })}
                    placeholder="Optional"
                  />
                </div>
              </div>
              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted p-3 rounded">
                <Shield className="w-4 h-4 shrink-0 mt-0.5" />
                <span>PIN is required for shared-device roles (Receptionist, Staff, Waiter, Housekeeping). Managers and Super Admins always use email login.</span>
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {loading ? "Creating account…" : "Create Account"}
              </Button>
            </CardFooter>
          </form>
        </Card>

        <div className="text-center">
          <Link href="/admin/login" className="text-sm text-sidebar-foreground/50 hover:text-sidebar-foreground">
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
