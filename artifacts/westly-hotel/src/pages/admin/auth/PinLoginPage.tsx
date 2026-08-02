import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { verifyPin } from "@/lib/auth";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { KeyRound, Delete, Loader2, ArrowLeft, Hotel } from "lucide-react";
import { Link } from "wouter";
import { useDocument } from "@/hooks/useFirebase";

export default function PinLoginPage() {
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [shake, setShake] = useState(false);
  // Mirrors AdminLoginPage's pattern: once verifyPin has signed the browser
  // into a real Firebase session, wait for AuthContext to finish loading the
  // matching profile before navigating, instead of racing ahead of it.
  const [awaitingProfile, setAwaitingProfile] = useState(false);
  const [, setLocation] = useLocation();
  const { adminUser, isLoading } = useAuth();
  const { toast } = useToast();
  const { data: loginBgDoc } = useDocument("cms_content", "login_background");
  const loginBg = (loginBgDoc as any)?.data;

  useEffect(() => {
    if (!awaitingProfile || isLoading) return;

    if (adminUser) {
      setLocation("/admin/dashboard");
      return;
    }

    // Signed in via custom token but no usable profile came back — shouldn't
    // normally happen since verify-pin already validated the account, but
    // fail safely rather than leaving the screen stuck on a spinner.
    setAwaitingProfile(false);
    setSubmitting(false);
    triggerError("Something went wrong finishing sign-in. Please try again.");
  }, [awaitingProfile, isLoading, adminUser]);

  const handleKey = (digit: number | string) => {
    if (submitting) return;
    const d = digit.toString();
    if (pin.length < 6) setPin(p => p + d);
  };

  const handleDelete = () => {
    if (!submitting) setPin(p => p.slice(0, -1));
  };

  // Auto-submit when 6 digits entered
  useEffect(() => {
    if (pin.length === 6) submitPin(pin);
  }, [pin]);

  const submitPin = async (currentPin: string) => {
    if (currentPin.length < 4 || submitting) return;
    setSubmitting(true);
    try {
      const user = await verifyPin(currentPin);
      toast({ title: `Welcome, ${user.name}`, description: `Logged in as ${user.role.replace("_", " ")}` });
      setAwaitingProfile(true);
      // Keep submitting=true — the effect above finishes the flow once
      // AuthContext has loaded, and clears it on failure.
    } catch (err: any) {
      setSubmitting(false);
      triggerError(err?.message || "Invalid PIN. Please try again.");
    }
  };

  const triggerError = (msg: string) => {
    setShake(true);
    setPin("");
    toast({ title: "Access Denied", description: msg, variant: "destructive" });
    setTimeout(() => setShake(false), 600);
  };

  const keypadNums = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  return (
    <div className="min-h-screen bg-sidebar flex items-center justify-center p-4 relative overflow-hidden">
      {loginBg?.image && (
        <img
          src={loginBg.image}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-10"
        />
      )}

      <div className="absolute top-6 left-6 z-10">
        <Link href="/admin/login" className="text-sidebar-foreground/50 hover:text-sidebar-foreground flex items-center gap-2 transition-colors text-sm">
          <ArrowLeft className="w-4 h-4" /> Staff Login
        </Link>
      </div>

      <div className="w-full max-w-sm flex flex-col items-center relative z-10">
        <div className="text-center mb-8">
          <img
            src="/brand/logo-mark.png"
            srcSet="/brand/logo-mark.png 1x, /brand/logo-mark@2x.png 2x"
            alt="Westly Hotel"
            className="w-10 h-10 object-contain mx-auto mb-3 opacity-90"
          />
          <div className="w-16 h-16 bg-sidebar-primary rounded-full flex items-center justify-center mx-auto mb-5 shadow-lg">
            <KeyRound className="w-8 h-8 text-sidebar-primary-foreground" />
          </div>
          <h1 className="font-serif text-3xl font-bold text-sidebar-foreground">Enter PIN</h1>
          <p className="text-sidebar-foreground/50 mt-1 text-sm">Shared Device Access</p>
        </div>

        <div
          className={cn("w-full", shake && "animate-[shake_0.5s_ease-in-out]")}
          style={shake ? { animation: "shake 0.5s ease-in-out" } : {}}
        >
          {/* PIN dots */}
          <div className="flex justify-center gap-4 mb-10 h-6">
            {[0, 1, 2, 3, 4, 5].map(i => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full transition-all duration-200 ${
                  i < pin.length
                    ? "bg-sidebar-primary scale-125"
                    : i < 4
                    ? "bg-sidebar-border"
                    : "bg-sidebar-border/30"
                }`}
              />
            ))}
          </div>

          {/* Keypad */}
          <div className="grid grid-cols-3 gap-3 max-w-[240px] mx-auto">
            {keypadNums.map(num => (
              <button
                key={num}
                onClick={() => handleKey(num)}
                disabled={submitting}
                className="w-[72px] h-[72px] rounded-full flex items-center justify-center text-2xl font-medium text-sidebar-foreground hover:bg-sidebar-accent active:scale-95 transition-all disabled:opacity-50"
              >
                {num}
              </button>
            ))}
            {/* Delete */}
            <button
              onClick={handleDelete}
              disabled={submitting || pin.length === 0}
              className="w-[72px] h-[72px] rounded-full flex items-center justify-center text-sidebar-foreground/70 hover:bg-sidebar-accent active:scale-95 transition-all disabled:opacity-30"
            >
              <Delete className="w-6 h-6" />
            </button>
            {/* 0 */}
            <button
              onClick={() => handleKey(0)}
              disabled={submitting}
              className="w-[72px] h-[72px] rounded-full flex items-center justify-center text-2xl font-medium text-sidebar-foreground hover:bg-sidebar-accent active:scale-95 transition-all disabled:opacity-50"
            >
              0
            </button>
            {/* OK */}
            <button
              onClick={() => submitPin(pin)}
              disabled={submitting || pin.length < 4}
              className={`w-[72px] h-[72px] rounded-full flex items-center justify-center text-base font-semibold transition-all active:scale-95 ${
                pin.length >= 4
                  ? "bg-sidebar-primary text-sidebar-primary-foreground hover:opacity-90"
                  : "text-sidebar-foreground/30 cursor-not-allowed"
              }`}
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "OK"}
            </button>
          </div>
        </div>

        <p className="mt-10 text-xs text-sidebar-foreground/40 text-center">
          Managers and Super Admins must use email login.
        </p>
      </div>
    </div>
  );
}

// Need cn utility for className composition
function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
