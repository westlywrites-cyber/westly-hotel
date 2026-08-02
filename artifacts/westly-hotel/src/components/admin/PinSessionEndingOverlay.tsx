import { Loader2, CheckCircle2 } from "lucide-react";

/**
 * Full-screen overlay shown for the brief window between a PIN-session task
 * completing and the automatic sign-out. Used on list-style admin pages
 * (housekeeping, maintenance, lost & found, etc.) that don't already have
 * their own dedicated "success" screen to communicate this in.
 */
export function PinSessionEndingOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="text-center space-y-3 max-w-xs">
        <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto" />
        <p className="font-medium">Task completed</p>
        <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Ending session for security — enter your PIN again to continue
        </p>
      </div>
    </div>
  );
}
