import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User as FirebaseUser, onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { Role } from "@/lib/rbac";
import { useLocation } from "wouter";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  status: "active" | "suspended" | "disabled" | "pending";
  profileImage?: string;
  isDeleted?: boolean;
}

interface AuthContextType {
  user: FirebaseUser | null;
  adminUser: AdminUser | null;
  role: Role | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
  sessionType: "full" | "pin" | null;
  endPinSessionAfterTask: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  adminUser: null,
  role: null,
  isLoading: true,
  signOut: async () => {},
  sessionType: null,
  endPinSessionAfterTask: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionType, setSessionType] = useState<"full" | "pin" | null>(null);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // Every auth transition — not just the very first one on page load —
      // re-enters a "resolving" state until the Firestore profile (and, for
      // PIN sessions, the custom-token claim) has actually been fetched.
      // Previously this only ever flipped false once at startup, so any
      // *subsequent* sign-in (e.g. right after submitting the login form)
      // left isLoading permanently false while adminUser was still null —
      // that's what made callers relying on isLoading race ahead and bounce
      // the user straight back to the login page on their first attempt.
      setIsLoading(true);
      setUser(firebaseUser);

      if (firebaseUser) {
        try {
          const [tokenResult, docSnap] = await Promise.all([
            firebaseUser.getIdTokenResult(),
            getDoc(doc(db, "users", firebaseUser.uid)),
          ]);

          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.isDeleted || data.status === "suspended" || data.status === "disabled") {
              // Account suspended or deleted — force sign out
              await firebaseSignOut(auth);
              setAdminUser(null);
              setRole(null);
              setSessionType(null);
            } else {
              const admin = { id: docSnap.id, ...data } as AdminUser;
              setAdminUser(admin);
              setRole(admin.role);
              // PIN logins sign in via a Firebase custom token minted by the
              // verify-pin server function, which stamps a `pinSession: true`
              // custom claim onto the token. That claim — not local React
              // state — is the single source of truth for session type, so
              // it survives page refreshes and is visible to security rules.
              setSessionType(tokenResult.claims.pinSession ? "pin" : "full");
            }
          } else {
            // Firebase auth user exists but no admin record
            setAdminUser(null);
            setRole(null);
            setSessionType(null);
          }
        } catch (error) {
          console.error("Error fetching admin data:", error);
          setAdminUser(null);
          setRole(null);
          setSessionType(null);
        }
      } else {
        setAdminUser(null);
        setRole(null);
        setSessionType(null);
      }

      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signOut = async () => {
    const wasPin = sessionType === "pin";
    await firebaseSignOut(auth);
    setAdminUser(null);
    setRole(null);
    setSessionType(null);
    // A PIN terminal should return to the PIN keypad, not the staff email
    // login screen — it's a shared device, not any one person's session.
    setLocation(wasPin ? "/admin/pin" : "/admin/login");
  };

  // Call this right after a PIN-session user successfully completes the
  // single task they logged in for (recording a sale, updating a room's
  // cleaning status, logging an order, etc.). On a shared device, leaving
  // that session open would let the next person at the terminal keep acting
  // under the previous person's identity — so we end it immediately rather
  // than waiting for the 15-minute inactivity timer below. This is a no-op
  // for standard admin/staff (email+password) sessions.
  const endPinSessionAfterTask = async () => {
    if (sessionType !== "pin") return;
    await firebaseSignOut(auth);
    setLocation("/admin/pin");
  };

  // Auto-logout for PIN sessions after 15 minutes of inactivity.
  useEffect(() => {
    if (sessionType !== "pin") return;

    let timeoutId: ReturnType<typeof setTimeout>;

    const resetTimeout = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(async () => {
        // PIN sessions are now real Firebase Auth sessions (via custom
        // token), so ending one on inactivity must actually sign out of
        // Firebase, not just clear local state, or the session (and its
        // Firestore write access) would silently remain valid.
        await firebaseSignOut(auth);
        setLocation("/admin/pin");
      }, 15 * 60 * 1000);
    };

    const events = ["mousedown", "mousemove", "keypress", "scroll", "touchstart"];
    events.forEach(name => document.addEventListener(name, resetTimeout, true));
    resetTimeout();

    return () => {
      clearTimeout(timeoutId);
      events.forEach(name => document.removeEventListener(name, resetTimeout, true));
    };
  }, [sessionType]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthContext.Provider value={{ user, adminUser, role, isLoading, signOut, sessionType, endPinSessionAfterTask }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
