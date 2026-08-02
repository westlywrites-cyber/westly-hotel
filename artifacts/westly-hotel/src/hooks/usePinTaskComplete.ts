import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Ends a shared-device PIN session shortly after the task it was opened for
 * finishes successfully (recording a sale, updating a room's cleaning
 * status, logging an order, etc.). Standard admin/staff (email+password)
 * sessions are completely unaffected — `endPinSessionAfterTask` is a no-op
 * for them.
 *
 * A short delay is used (rather than logging out instantly) so the person
 * can see the success confirmation/receipt on screen before being returned
 * to the PIN pad. Call `notifyTaskComplete()` once your success state is set.
 *
 * Returns `isPinSession` so callers can adjust their success UI — e.g.
 * hiding a "do another one" button for PIN users, since a new PIN entry is
 * required to start a fresh session.
 */
export function usePinTaskComplete(delayMs: number = 2500) {
  const { sessionType, endPinSessionAfterTask } = useAuth();
  const [endingSession, setEndingSession] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const isPinSession = sessionType === "pin";

  const notifyTaskComplete = () => {
    if (!isPinSession) return;
    setEndingSession(true);
    timeoutRef.current = setTimeout(() => {
      endPinSessionAfterTask();
    }, delayMs);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return { isPinSession, endingSession, notifyTaskComplete };
}
