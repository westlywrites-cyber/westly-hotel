import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCollection } from "@/hooks/useFirebase";
import { doc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logAction } from "@/lib/audit";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { DataError } from "@/components/ui/data-error";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  MessageSquareText,
  Star,
  CheckCircle2,
  Trash2,
  Loader2,
  UserCircle2,
} from "lucide-react";

interface Review {
  id: string;
  name: string;
  text: string;
  rating: number | null;
  status: "pending" | "approved";
  createdAt?: { toDate?: () => Date } | null;
}

function StarRow({ rating }: { rating: number | null }) {
  if (!rating) return null;
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`w-3.5 h-3.5 ${
            star <= rating ? "fill-secondary text-secondary" : "fill-muted text-muted"
          }`}
        />
      ))}
    </div>
  );
}

function formatDate(ts: Review["createdAt"]) {
  const d = ts?.toDate?.();
  if (!d) return "";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function ReviewsManagementPage() {
  const { adminUser, role } = useAuth();
  const { toast } = useToast();
  const { data: reviews, loading, error } = useCollection<Review>("reviews");

  const [tab, setTab] = useState<"pending" | "approved">("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);

  const sorted = useMemo(
    () =>
      [...reviews].sort((a, b) => {
        const da = a.createdAt?.toDate?.()?.getTime() ?? 0;
        const db_ = b.createdAt?.toDate?.()?.getTime() ?? 0;
        return db_ - da;
      }),
    [reviews]
  );

  const pending = sorted.filter((r) => r.status !== "approved");
  const approved = sorted.filter((r) => r.status === "approved");
  const visible = tab === "pending" ? pending : approved;

  async function approve(review: Review) {
    if (!adminUser) return;
    setBusyId(review.id);
    try {
      await updateDoc(doc(db, "reviews", review.id), {
        status: "approved",
        approvedAt: serverTimestamp(),
        approvedBy: adminUser.id,
      });
      await logAction(
        adminUser.id,
        adminUser.name,
        "review_approved",
        "reviews",
        review.id,
        { status: "pending" },
        { status: "approved" },
        role ?? undefined
      );
      toast({ title: "Review Approved", description: "It's now live on the public website." });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Couldn't approve this review.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  async function remove(target: { id: string }) {
    if (!adminUser) return;
    setBusyId(target.id);
    try {
      await deleteDoc(doc(db, "reviews", target.id));
      await logAction(
        adminUser.id,
        adminUser.name,
        "review_deleted",
        "reviews",
        target.id,
        null,
        null,
        role ?? undefined
      );
      toast({ title: "Review Deleted" });
      setDeleteTarget(null);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Couldn't delete this review.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="font-serif text-2xl font-bold flex items-center gap-2">
          <MessageSquareText className="w-6 h-6" /> Guest Reviews
        </h1>
        <p className="text-muted-foreground text-sm">
          Reviews guests submit publicly stay hidden until approved here. Deleting a
          review removes it from the website immediately.
        </p>
      </div>

      {error && <DataError message="Reviews failed to load. Reload and try again." />}

      <Tabs value={tab} onValueChange={(v) => setTab(v as "pending" | "approved")}>
        <TabsList>
          <TabsTrigger value="pending" className="gap-1.5">
            Pending
            {pending.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                {pending.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved" className="gap-1.5">
            Approved
            <Badge variant="outline" className="ml-1 h-5 px-1.5 text-[10px]">
              {approved.length}
            </Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading reviews…
          </CardContent>
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            {tab === "pending" ? "No reviews waiting for approval." : "No approved reviews yet."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((review) => (
            <Card key={review.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <UserCircle2 className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm text-foreground">{review.name}</p>
                      {review.status === "pending" && (
                        <Badge variant="secondary" className="text-[10px]">
                          Pending
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">{formatDate(review.createdAt)}</span>
                    </div>
                    <StarRow rating={review.rating} />
                    <p className="text-sm text-muted-foreground mt-1.5 whitespace-pre-wrap">{review.text}</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {review.status !== "approved" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={busyId === review.id}
                        onClick={() => approve(review)}
                      >
                        {busyId === review.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        )}
                        Approve
                      </Button>
                    )}
                    <button
                      onClick={() => setDeleteTarget({ id: review.id, label: review.name })}
                      className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Review?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the review from "
              <strong>{deleteTarget?.label}</strong>"? This will remove it from the public
              website immediately and can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteTarget && remove(deleteTarget)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
