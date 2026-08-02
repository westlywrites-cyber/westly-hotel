import { supabase, isSupabaseConfigured } from "./supabase";

// ══════════════════════════════════════════════════════════════════════════
// MESSAGE INBOX — public-website enquiries, stored in Supabase (see
// supabase/schema.sql). Deliberately independent of the Firebase-based
// notification system used everywhere else in the app.
//
// Until a Supabase project is connected (VITE_SUPABASE_URL /
// VITE_SUPABASE_ANON_KEY unset), every function here fails soft:
//   • submitPublicMessage() queues the message in localStorage instead of
//     throwing, so the guest still sees a success confirmation and nothing
//     is lost — flushQueuedMessages() sends the backlog the first time the
//     app runs with Supabase configured.
//   • fetchMessages() / subscribeToMessages() simply return nothing to
//     show, and MessagesPage.tsx renders a "not connected yet" state.
// ══════════════════════════════════════════════════════════════════════════

export interface InboxMessage {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string | null;
  message: string;
  status: "new" | "read";
  reply_status: "none" | "pending" | "replied";
  source: string;
  is_deleted: boolean;
  created_at: string;
  read_at: string | null;
  replied_at: string | null;
}

export interface SubmitMessageInput {
  name: string;
  email: string;
  phone?: string;
  subject?: string;
  message: string;
}

const LOCAL_QUEUE_KEY = "westly_pending_messages";

function readQueue(): SubmitMessageInput[] {
  try {
    const raw = localStorage.getItem(LOCAL_QUEUE_KEY);
    return raw ? (JSON.parse(raw) as SubmitMessageInput[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(items: SubmitMessageInput[]) {
  try {
    localStorage.setItem(LOCAL_QUEUE_KEY, JSON.stringify(items));
  } catch {
    /* localStorage unavailable (private browsing, etc.) — best effort only */
  }
}

/** Number of messages waiting to sync once Supabase is connected. */
export function getQueuedMessageCount(): number {
  return readQueue().length;
}

/**
 * Submit a message from the public Contact page. Always resolves — never
 * throws — so the guest-facing form can show a confirmation either way.
 * `delivered: false` means it was queued locally, pending Supabase setup.
 */
export async function submitPublicMessage(
  input: SubmitMessageInput
): Promise<{ delivered: boolean }> {
  if (!isSupabaseConfigured || !supabase) {
    writeQueue([...readQueue(), input]);
    return { delivered: false };
  }
  const { error } = await supabase.from("messages").insert({
    name: input.name,
    email: input.email,
    phone: input.phone || null,
    subject: input.subject || null,
    message: input.message,
  });
  if (error) {
    // Still don't lose the message — queue it and let the next successful
    // load retry, rather than surfacing a hard failure to the guest.
    writeQueue([...readQueue(), input]);
    return { delivered: false };
  }
  return { delivered: true };
}

/** Sends any locally-queued messages once Supabase becomes reachable. Call on app/admin load. */
export async function flushQueuedMessages(): Promise<number> {
  if (!isSupabaseConfigured || !supabase) return 0;
  const queue = readQueue();
  if (!queue.length) return 0;
  const { error } = await supabase.from("messages").insert(
    queue.map((q) => ({
      name: q.name,
      email: q.email,
      phone: q.phone || null,
      subject: q.subject || null,
      message: q.message,
    }))
  );
  if (error) return 0;
  writeQueue([]);
  return queue.length;
}

export async function fetchMessages(): Promise<InboxMessage[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as InboxMessage[];
}

/**
 * Subscribes to realtime inserts/updates. Returns an unsubscribe function.
 *
 * IMPORTANT: `.subscribe()` opens a WebSocket. If that connection is
 * refused at the browser level (blocked by CSP, an extension, or a
 * network policy), WebSocket construction throws SYNCHRONOUSLY — unlike
 * fetch(), which just rejects. This call happens inside a useEffect
 * (see useMessages.ts), and React error boundaries do not catch errors
 * thrown from effects, so an unguarded throw here takes down the entire
 * app to a blank screen. This try/catch is not optional.
 */
export function subscribeToMessages(onChange: () => void): () => void {
  if (!isSupabaseConfigured || !supabase) return () => {};
  try {
    const channel = supabase
      .channel("messages-inbox")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => onChange()
      )
      .subscribe();
    return () => {
      try {
        supabase!.removeChannel(channel);
      } catch {
        /* already torn down — nothing to do */
      }
    };
  } catch (err) {
    console.warn("[messages] realtime subscription failed — falling back to manual refresh:", err);
    return () => {};
  }
}

export async function markMessageRead(id: string): Promise<void> {
  if (!supabase) return;
  await supabase
    .from("messages")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("id", id);
}

export async function setReplyStatus(
  id: string,
  replyStatus: InboxMessage["reply_status"]
): Promise<void> {
  if (!supabase) return;
  await supabase
    .from("messages")
    .update({
      reply_status: replyStatus,
      replied_at: replyStatus === "replied" ? new Date().toISOString() : null,
    })
    .eq("id", id);
}

export async function softDeleteMessage(id: string): Promise<void> {
  if (!supabase) return;
  await supabase.from("messages").update({ is_deleted: true }).eq("id", id);
}
