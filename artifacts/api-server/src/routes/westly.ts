// Express routes that replace the Cloudflare Pages Functions.
// Called by the frontend at /api/verify-pin, /api/create-user, etc.
import { Router, type Request, type Response } from "express";
import { getEnv } from "../lib/firebase/env.js";
import { requireSuperAdmin, requireActiveUser, HttpError } from "../lib/firebase/admin.js";
import { logServerAction } from "../lib/firebase/serverAudit.js";
import { getDoc, addDoc, setDoc, updateDoc, queryCollection, FieldValue } from "../lib/firebase/firestoreRest.js";
import { createUser, updateUser, createCustomToken } from "../lib/firebase/firebaseAuthRest.js";
import { sendEachForMulticast } from "../lib/firebase/fcm.js";

const router = Router();

// ── Shared helper ──────────────────────────────────────────────────────────

function authHeader(req: Request): string | undefined {
  return req.headers.authorization ?? undefined;
}

async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(pin);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function handleError(res: Response, err: unknown) {
  if (err instanceof HttpError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  const msg = err instanceof Error ? err.message : "Something went wrong.";
  res.status(500).json({ error: msg });
}

// ── POST /api/verify-pin ────────────────────────────────────────────────────
// Shared-device PIN login: looks up the PIN server-side (Firestore rules deny
// unauthenticated reads) and returns a Firebase custom token on success.
router.post("/verify-pin", async (req: Request, res: Response) => {
  try {
    const env = getEnv();
    const { pin } = req.body ?? {};

    if (!pin || typeof pin !== "string" || !/^\d{4,6}$/.test(pin)) {
      throw new HttpError(400, "Enter a valid 4-6 digit PIN.");
    }

    const hashedPin = await hashPin(pin);

    let matches = await queryCollection(env, "users", [{ field: "pinHash", op: "EQUAL", value: hashedPin }], 1);
    if (matches.length === 0) {
      matches = await queryCollection(env, "users", [{ field: "pin", op: "EQUAL", value: hashedPin }], 1);
    }
    const docSnap = matches[0];

    if (!docSnap || docSnap.data()?.isDeleted) throw new HttpError(401, "Invalid PIN.");

    const data = docSnap.data()!;
    if (data.status !== "active") {
      throw new HttpError(403, "This account is not active. Contact your administrator.");
    }

    // Only non-management roles use PIN login.
    const PIN_ROLES = new Set(["housekeeping", "waiter", "bar_attendant", "laundry_valet", "staff"]);
    if (!PIN_ROLES.has(String(data.role))) {
      throw new HttpError(403, "This role must sign in with email and password.");
    }

    const customToken = await createCustomToken(env, docSnap.id, {
      role: data.role,
      pinSession: true,
    });

    setDoc(env, "users", docSnap.id, { lastLogin: new Date() }, { merge: true }).catch(() => {});
    logServerAction(env, docSnap.id, String(data.name), "pin_login", "users", docSnap.id, null, null, String(data.role)).catch(() => {});

    res.json({
      customToken,
      user: {
        id: docSnap.id,
        name: data.name,
        email: data.email,
        phone: data.phone ?? null,
        role: data.role,
        status: data.status,
        profileImage: data.profileImage ?? null,
      },
    });
  } catch (err) {
    handleError(res, err);
  }
});

// ── POST /api/verify-guest-order ───────────────────────────────────────────
// Secure online food ordering: verifies guest identity, re-prices the cart
// from the live menu, and creates the order.
router.post("/verify-guest-order", async (req: Request, res: Response) => {
  try {
    const env = getEnv();
    const body = req.body ?? {};

    const guestName = typeof body.guestName === "string" ? body.guestName.trim() : "";
    const roomNumber = typeof body.roomNumber === "string" ? body.roomNumber.trim() : "";
    const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 500) : "";
    const paymentMethod = body.paymentMethod === "pay_on_delivery" ? "pay_on_delivery" : "room_charge";
    const items: Array<{ id: string; quantity: number }> = Array.isArray(body.items) ? body.items : [];

    if (!guestName || guestName.length > 100) throw new HttpError(400, "Enter your name as it appears on your reservation.");
    if (!roomNumber || roomNumber.length > 20) throw new HttpError(400, "Enter your room number.");
    if (items.length === 0 || items.length > 40) throw new HttpError(400, "Your cart is empty.");

    // Re-price against live menu — never trust client prices.
    const menuSnap = await getDoc(env, "cms_content", "restaurant_menu");
    const menuItems: unknown[] = menuSnap.exists ? (menuSnap.data()?.data as unknown[] ?? []) : [];
    const menuById = new Map((menuItems as Array<{ id: string }>).map((m) => [m.id, m]));

    const validatedItems = items.map((line) => {
      const id = typeof line.id === "string" ? line.id : "";
      const menuItem = menuById.get(id) as { id: string; name: string; price: number; available?: boolean } | undefined;
      if (!menuItem || menuItem.available === false) {
        throw new HttpError(400, "One of the items in your cart is no longer available. Please refresh the menu and try again.");
      }
      const quantity = Math.max(1, Math.min(20, Math.floor(Number(line.quantity) || 1)));
      return { id: menuItem.id, name: menuItem.name, price: menuItem.price, quantity, subtotal: menuItem.price * quantity, isManual: false };
    });
    const total = validatedItems.reduce((sum, i) => sum + i.subtotal, 0);

    // Verify guest against active (checked-in) bookings.
    const bookingsSnap = await queryCollection(env, "bookings", [
      { field: "status", op: "EQUAL", value: "checked_in" },
      { field: "roomNumber", op: "EQUAL", value: roomNumber },
    ]);

    const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");
    const match = bookingsSnap.find((d) => normalize(String(d.data()?.guestName ?? "")) === normalize(guestName));

    if (!match) throw new HttpError(403, "Invalid guest name or room number.");

    const orderRef = await addDoc(env, "orders", {
      waiterId: "unassigned",
      waiterName: "Guest (QR Order — Verified)",
      customerName: guestName,
      roomNumber,
      tableNumber: null,
      guestBookingId: match.id,
      items: validatedItems,
      total,
      paymentMethod,
      notes: notes || null,
      hasManualItems: false,
      status: "pending",
      approvalStatus: "pending",
      approvedBy: null,
      approvedByName: null,
      approvedAt: null,
      rejectedReason: null,
      createdAt: FieldValue.serverTimestamp(),
      isDeleted: false,
      source: "qr_menu",
      guestVerified: true,
    });

    logServerAction(env, match.id, guestName, "guest_order_placed", "orders", orderRef.id, null, { total, roomNumber }).catch(() => {});

    res.json({ orderId: orderRef.id });
  } catch (err) {
    handleError(res, err);
  }
});

// ── POST /api/send-push ────────────────────────────────────────────────────
router.post("/send-push", async (req: Request, res: Response) => {
  try {
    const env = getEnv();
    await requireActiveUser(env, authHeader(req));

    const payload = req.body ?? {};
    if (!payload.title || !payload.body) throw new HttpError(400, "title and body are required.");

    const roles = ((payload.forRoles ?? []) as string[]).slice(0, 10);
    const userIds = (payload.forUserIds ?? []) as string[];

    if (roles.length === 0 && userIds.length === 0) {
      res.json({ sent: 0, reason: "no target roles or users" });
      return;
    }

    const userDocs = new Map<string, Record<string, unknown>>();

    if (roles.length > 0) {
      const snap = await queryCollection(env, "users", [{ field: "role", op: "IN", value: roles }]);
      snap.forEach((d) => userDocs.set(d.id, d.data()!));
    }
    if (userIds.length > 0) {
      const results = await Promise.all(userIds.map((id) => getDoc(env, "users", id)));
      results.forEach((d) => { if (d.exists) userDocs.set(d.id, d.data()!); });
    }
    if (payload.excludeUserId) userDocs.delete(payload.excludeUserId as string);

    const tokens: string[] = [];
    userDocs.forEach((data) => {
      if (data.status !== "active" || data.isDeleted) return;
      const userTokens: string[] = Array.isArray(data.fcmTokens) ? data.fcmTokens as string[] : [];
      tokens.push(...userTokens);
    });

    if (tokens.length === 0) {
      res.json({ sent: 0, reason: "no registered devices for target users" });
      return;
    }

    const result = await sendEachForMulticast(env, tokens, {
      notification: { title: String(payload.title), body: String(payload.body) },
      data: {
        link: String(payload.link ?? "/admin/dashboard"),
        notificationId: String(payload.notificationId ?? ""),
      },
      webpush: {
        fcmOptions: { link: String(payload.link ?? "/admin/dashboard") },
        notification: { icon: "/admin-icons/admin-icon-192.png" },
      },
    });

    // Prune dead FCM tokens.
    const invalidTokens: string[] = [];
    result.responses.forEach((r, i) => { if (!r.success && r.shouldPruneToken) invalidTokens.push(tokens[i]); });
    if (invalidTokens.length > 0) {
      const invalidSet = new Set(invalidTokens);
      const cleanupWrites: Promise<unknown>[] = [];
      userDocs.forEach((data, uid) => {
        const userTokens: string[] = Array.isArray(data.fcmTokens) ? data.fcmTokens as string[] : [];
        const kept = userTokens.filter((t) => !invalidSet.has(t));
        if (kept.length !== userTokens.length) cleanupWrites.push(updateDoc(env, "users", uid, { fcmTokens: kept }));
      });
      await Promise.all(cleanupWrites);
    }

    res.json({ sent: result.successCount, failed: result.failureCount });
  } catch (err) {
    handleError(res, err);
  }
});

// ── POST /api/create-user ──────────────────────────────────────────────────
router.post("/create-user", async (req: Request, res: Response) => {
  try {
    const env = getEnv();
    const caller = await requireSuperAdmin(env, authHeader(req));
    const { name, email, password, phone, role, pin } = req.body ?? {};

    if (!name || !email || !password || !role) throw new HttpError(400, "name, email, password, and role are required.");
    if (String(password).length < 8) throw new HttpError(400, "Password must be at least 8 characters.");
    if (pin && String(pin).length < 4) throw new HttpError(400, "PIN must be at least 4 digits.");

    const userRecord = await createUser(env, { email: String(email), password: String(password), displayName: String(name) });

    const pinHash = pin ? await hashPin(String(pin)) : null;
    await setDoc(env, "users", userRecord.uid, {
      name: String(name),
      email: String(email),
      phone: phone ? String(phone) : null,
      role: String(role),
      status: "active",
      pinHash,
      isDeleted: false,
      createdAt: new Date(),
      createdBy: caller.uid,
    });

    await logServerAction(env, caller.uid, caller.name, "user_created", "users", userRecord.uid, null, { name, email, role });

    res.json({ uid: userRecord.uid });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create user.";
    if (err instanceof HttpError) res.status(err.statusCode).json({ error: msg });
    else res.status(400).json({ error: msg });
  }
});

// ── POST /api/reset-password ───────────────────────────────────────────────
router.post("/reset-password", async (req: Request, res: Response) => {
  try {
    const env = getEnv();
    const caller = await requireSuperAdmin(env, authHeader(req));
    const { uid, newPassword } = req.body ?? {};

    if (!uid || !newPassword) throw new HttpError(400, "uid and newPassword are required.");
    if (String(newPassword).length < 8) throw new HttpError(400, "Password must be at least 8 characters.");

    await updateUser(env, String(uid), { password: String(newPassword) });
    await logServerAction(env, caller.uid, caller.name, "password_reset", "users", String(uid));

    res.json({ success: true });
  } catch (err) {
    handleError(res, err);
  }
});

// ── POST /api/reset-pin ────────────────────────────────────────────────────
router.post("/reset-pin", async (req: Request, res: Response) => {
  try {
    const env = getEnv();
    const caller = await requireSuperAdmin(env, authHeader(req));
    const { uid, newPin } = req.body ?? {};

    if (!uid || !newPin) throw new HttpError(400, "uid and newPin are required.");
    if (String(newPin).length < 4) throw new HttpError(400, "PIN must be at least 4 digits.");

    const snap = await getDoc(env, "users", String(uid));
    if (!snap.exists) throw new HttpError(404, "User not found.");

    await updateDoc(env, "users", String(uid), {
      pinHash: await hashPin(String(newPin)),
      pin: null,
    });
    await logServerAction(env, caller.uid, caller.name, "pin_reset", "users", String(uid));

    res.json({ success: true });
  } catch (err) {
    handleError(res, err);
  }
});

// ── POST /api/set-user-status ──────────────────────────────────────────────
router.post("/set-user-status", async (req: Request, res: Response) => {
  try {
    const env = getEnv();
    const caller = await requireSuperAdmin(env, authHeader(req));
    const { uid, status } = req.body ?? {};

    if (!uid || (status !== "active" && status !== "suspended")) {
      throw new HttpError(400, "uid and status ('active' | 'suspended') are required.");
    }

    await updateUser(env, String(uid), { disabled: status === "suspended" });

    const prevSnap = await getDoc(env, "users", String(uid));
    await updateDoc(env, "users", String(uid), { status: String(status), updatedAt: new Date() });

    await logServerAction(
      env, caller.uid, caller.name, `user_${status}`, "users", String(uid),
      { status: prevSnap.data()?.status }, { status }
    );

    res.json({ success: true });
  } catch (err) {
    handleError(res, err);
  }
});

export default router;
