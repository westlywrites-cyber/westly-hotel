import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { signInWithEmailAndPassword, signOut as firebaseSignOut, setPersistence, browserLocalPersistence } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Lock, Mail, Loader2, KeyRound } from "lucide-react";
import { Link } from "wouter";
import { logAction } from "@/lib/audit";
import { useDocument } from "@/hooks/useFirebase";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // True from the moment Firebase Auth confirms the credentials until
  // AuthContext has finished loading the matching Firestore profile. We
  // deliberately do NOT navigate to /admin/dashboard the instant
  // signInWithEmailAndPassword resolves — ProtectedRoute needs adminUser to
  // already be populated, and that fetch is asynchronous. Navigating early
  // was exactly why the first login attempt always appeared to fail: it
  // arrived at ProtectedRoute before adminUser existed, got redirected back
  // to /admin/login, and only the *second* submit — by which point the first
  // attempt's background fetch had quietly finished — looked like it worked.
  const [awaitingProfile, setAwaitingProfile] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: loginBgDoc } = useDocument("cms_content", "login_background");
  const loginBg = (loginBgDoc as any)?.data;
  const { user, adminUser, isLoading } = useAuth();

  useEffect(() => {
    if (!awaitingProfile || isLoading) return;

    if (adminUser && adminUser.status === "active") {
      setLocation("/admin/dashboard");
      return;
    }

    // Firebase Auth accepted the credentials, but there's no matching active
    // admin profile (deleted, suspended, disabled, or never provisioned).
    // Sign back out and tell the person why, instead of leaving them
    // half-authenticated with nowhere valid to go.
    firebaseSignOut(auth).catch(() => {});
    toast({
      title: "Access denied",
      description: adminUser
        ? "Your account is not active. Contact your administrator."
        : "No admin profile is linked to this account.",
      variant: "destructive",
    });
    setAwaitingProfile(false);
    setSubmitting(false);
  }, [awaitingProfile, isLoading, adminUser]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      // Pin persistence explicitly on every submit — the PIN login flow
      // (lib/auth.ts verifyPin) sets session-only persistence on the same
      // shared Auth instance, and without resetting it here a later
      // email/password login in the same browser tab would silently
      // inherit that session-only behavior instead of the normal
      // "stay signed in" experience.
      await setPersistence(auth, browserLocalPersistence);
      const cred = await signInWithEmailAndPassword(auth, email, password);
      logAction(cred.user.uid, email, "admin_login", "auth", cred.user.uid).catch(() => {});
      setAwaitingProfile(true);
      // Intentionally no navigation here — see awaitingProfile effect above.
    } catch (error: any) {
      toast({
        title: "Login failed",
        description: "Invalid email or password. Please try again.",
        variant: "destructive",
      });
      setSubmitting(false);
    }
  };

  const busy = submitting || (awaitingProfile && (isLoading || !!user));

  return (
    <div className="min-h-screen bg-sidebar flex items-center justify-center p-4 relative overflow-hidden">
      {loginBg?.image && (
        <img
          src={loginBg.image}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-10"
        />
      )}

      <div className="w-full max-w-md relative z-10 space-y-6">
        <div className="text-center">
          <img
            src="/brand/logo-mark.png"
            srcSet="/brand/logo-mark.png 1x, /brand/logo-mark@2x.png 2x"
            alt="Westly Hotel"
            className="w-16 h-16 object-contain mx-auto mb-4 drop-shadow-lg"
          />
          <h1 className="font-serif text-3xl font-bold text-sidebar-foreground">Westly Demo Hotel</h1>
          <p className="text-sidebar-foreground/60 mt-1 text-sm">Management Portal</p>
        </div>

        <Card className="border-sidebar-border bg-card/95 backdrop-blur-sm shadow-2xl">
          <CardHeader>
            <CardTitle className="text-foreground">Staff Sign In</CardTitle>
            <CardDescription>Enter your credentials to access the portal</CardDescription>
          </CardHeader>
          <form onSubmit={handleLogin}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@westlydemo.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="pl-10"
                    required
                    autoComplete="email"
                    disabled={busy}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="pl-10"
                    required
                    autoComplete="current-password"
                    disabled={busy}
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {busy ? "Signing in…" : "Sign In"}
              </Button>
              <div className="text-sm text-center text-muted-foreground">
                Shared device?{" "}
                <Link href="/admin/pin" className="text-primary hover:underline inline-flex items-center gap-1">
                  <KeyRound className="w-3 h-3" /> Use PIN Login
                </Link>
              </div>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
