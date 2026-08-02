import { useEffect, useState } from "react";
import { ref, onValue, query as rtdbQuery, limitToLast, orderByChild } from "firebase/database";
import { rtdb } from "@/lib/firebase";

export interface RoomStatusCounts {
  available: number;
  occupied: number;
  cleaning: number;
  maintenance: number;
  reserved: number;
  out_of_service: number;
}

/**
 * Subscribe to live room status counts from Realtime Database.
 * Falls back gracefully if RTDB is unavailable — Firestore remains authoritative.
 */
export function useRoomStatus(): RoomStatusCounts {
  const [counts, setCounts] = useState<RoomStatusCounts>({
    available: 0,
    occupied: 0,
    cleaning: 0,
    maintenance: 0,
    reserved: 0,
    out_of_service: 0,
  });

  useEffect(() => {
    const statusRef = ref(rtdb, "roomStatus");
    const unsubscribe = onValue(
      statusRef,
      (snapshot) => {
        if (!snapshot.exists()) return;
        const roomData = snapshot.val() as Record<string, { status: string }>;
        const newCounts: RoomStatusCounts = {
          available: 0,
          occupied: 0,
          cleaning: 0,
          maintenance: 0,
          reserved: 0,
          out_of_service: 0,
        };
        Object.values(roomData).forEach(({ status }) => {
          if (status in newCounts) {
            (newCounts as any)[status]++;
          }
        });
        setCounts(newCounts);
      },
      (error) => {
        console.warn("[useRoomStatus] RTDB unavailable:", error.message);
        // Non-fatal — Firestore is still authoritative
      }
    );
    return () => unsubscribe();
  }, []);

  return counts;
}

export interface ActivityItem {
  message: string;
  type: string;
  timestamp: number;
  userId?: string;
  userName?: string;
}

/**
 * Subscribe to the live activity feed from Realtime Database.
 */
export function useActivityFeed(limit = 10): ActivityItem[] {
  const [activities, setActivities] = useState<ActivityItem[]>([]);

  useEffect(() => {
    const feedRef = rtdbQuery(
      ref(rtdb, "activity_feed"),
      orderByChild("timestamp"),
      limitToLast(limit)
    );
    const unsubscribe = onValue(
      feedRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setActivities([]);
          return;
        }
        const items: ActivityItem[] = [];
        snapshot.forEach((child) => {
          items.push(child.val() as ActivityItem);
        });
        // Newest first
        setActivities(items.reverse());
      },
      (error) => {
        console.warn("[useActivityFeed] RTDB unavailable:", error.message);
      }
    );
    return () => unsubscribe();
  }, [limit]);

  return activities;
}

/**
 * Push an activity item to the live feed in Realtime Database.
 */
export async function pushActivity(item: Omit<ActivityItem, "timestamp">): Promise<void> {
  try {
    const { ref: dbRef, push, serverTimestamp: rtdbServerTimestamp } = await import("firebase/database");
    const feedRef = dbRef(rtdb, "activity_feed");
    await push(feedRef, {
      ...item,
      timestamp: Date.now(),
    });
  } catch {
    // Non-fatal — RTDB activity feed is supplementary
  }
}

/**
 * Subscribe to live dashboard counters.
 */
export function useDashboardCounters() {
  const [counters, setCounters] = useState<Record<string, number>>({});

  useEffect(() => {
    const countersRef = ref(rtdb, "dashboard_counters");
    const unsubscribe = onValue(
      countersRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setCounters(snapshot.val() as Record<string, number>);
        }
      },
      () => { /* non-fatal */ }
    );
    return () => unsubscribe();
  }, []);

  return counters;
}
