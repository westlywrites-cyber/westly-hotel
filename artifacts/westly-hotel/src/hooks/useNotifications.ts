import { useEffect, useMemo, useState, useCallback } from "react";
import { collection, query, where, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { markNotificationRead, deleteNotificationForUser } from "@/lib/notifications";
import type { NotificationSeverity, NotificationType } from "@/lib/notifications";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  severity: NotificationSeverity;
  link: string | null;
  forRoles: string[];
  forUserIds?: string[];
  excludeUserId?: string | null;
  actorId?: string | null;
  readBy: string[];
  deletedBy: string[];
  createdAt: { toDate: () => Date } | null;
}

const PAGE_SIZE = 60;

/**
 * Realtime notification feed for the signed-in user, scoped to their role.
 * Super Admins implicitly see everything (their role is always included in
 * every notify() call's target list check below), everyone else only sees
 * notifications addressed to their role or directly to their user id.
 */
export function useNotifications() {
  const { adminUser, role } = useAuth();
  const [all, setAll] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!adminUser || !role) {
      setAll([]);
      setLoading(false);
      return;
    }
    // super_admin always sees everything; everyone else is filtered by role membership.
    const q =
      role === "super_admin"
        ? query(collection(db, "notifications"), orderBy("createdAt", "desc"), limit(PAGE_SIZE))
        : query(
            collection(db, "notifications"),
            where("forRoles", "array-contains", role),
            orderBy("createdAt", "desc"),
            limit(PAGE_SIZE)
          );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AppNotification);
        setAll(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [adminUser?.id, role]);

  const notifications = useMemo(() => {
    if (!adminUser) return [];
    return all
      .filter((n) => !(n.deletedBy ?? []).includes(adminUser.id))
      .filter((n) => n.excludeUserId !== adminUser.id)
      .filter((n) => {
        // If a notification names specific recipients, only they (plus super_admin) see it.
        if (n.forUserIds && n.forUserIds.length > 0) {
          return n.forUserIds.includes(adminUser.id) || adminUser.role === "super_admin";
        }
        return true;
      });
  }, [all, adminUser]);

  const unreadCount = useMemo(() => {
    if (!adminUser) return 0;
    return notifications.filter((n) => !(n.readBy ?? []).includes(adminUser.id)).length;
  }, [notifications, adminUser]);

  const markAsRead = useCallback(
    (id: string) => (adminUser ? markNotificationRead(id, adminUser.id) : Promise.resolve()),
    [adminUser?.id]
  );

  const markAllAsRead = useCallback(async () => {
    if (!adminUser) return;
    const unread = notifications.filter((n) => !(n.readBy ?? []).includes(adminUser.id));
    await Promise.all(unread.map((n) => markNotificationRead(n.id, adminUser.id)));
  }, [adminUser?.id, notifications]);

  const remove = useCallback(
    (id: string) => (adminUser ? deleteNotificationForUser(id, adminUser.id) : Promise.resolve()),
    [adminUser?.id]
  );

  return { notifications, unreadCount, loading, markAsRead, markAllAsRead, remove };
}
