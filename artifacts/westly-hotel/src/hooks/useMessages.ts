import { useCallback, useEffect, useRef, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  fetchMessages,
  flushQueuedMessages,
  subscribeToMessages,
  type InboxMessage,
} from "@/lib/messages";

/**
 * Realtime feed for the staff Message Inbox. Before Supabase is connected,
 * `configured` is false and `messages` stays empty so MessagesPage.tsx can
 * show a clear "not connected yet" state instead of an empty-looking inbox.
 */
export function useMessages() {
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const flushedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchMessages();
      setMessages(data);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    // One-time attempt to sync any messages a guest submitted while this
    // project hadn't been connected to Supabase yet.
    if (!flushedRef.current) {
      flushedRef.current = true;
      flushQueuedMessages()
        .catch((err) => console.warn("[messages] queued-message flush failed:", err))
        .finally(load);
    } else {
      load();
    }

    const unsubscribe = subscribeToMessages(load);
    return unsubscribe;
  }, [load]);

  const unreadCount = messages.filter((m) => m.status === "new").length;

  return {
    messages,
    loading,
    error,
    unreadCount,
    configured: isSupabaseConfigured,
    refresh: load,
  };
}
