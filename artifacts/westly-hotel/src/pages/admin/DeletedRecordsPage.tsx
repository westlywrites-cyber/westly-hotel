import { useState } from "react";
import { motion } from "framer-motion";
import {
  collection,
  query,
  orderBy,
  doc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useCollection } from "@/hooks/useFirebase";
import { logAction } from "@/lib/audit";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Archive,
  RotateCcw,
  Trash2,
  Filter,
  AlertTriangle,
  CheckCircle2,
  Clock,
  User,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataError } from "@/components/ui/data-error";
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
import { format } from "date-fns";

interface DeletedRecord {
  id: string;
  originalCollection: string;
  originalDocumentId: string;
  deletedBy: string;
  deletedByName: string;
  deletedByRole?: string;
  deletedAt: any;
  reason?: string;
}

const COLLECTION_LABELS: Record<string, string> = {
  rooms: "Room",
  venues: "Venue",
  bookings: "Booking",
  guests: "Guest",
  users: "Staff Account",
  sales: "Sale",
  expenses: "Expense",
  inventory: "Inventory Item",
  attendance: "Attendance Record",
  maintenance: "Maintenance Request",
  housekeeping_tasks: "Housekeeping Task",
};

const COLLECTION_COLORS: Record<string, string> = {
  rooms: "bg-blue-100 text-blue-800",
  bookings: "bg-purple-100 text-purple-800",
  guests: "bg-green-100 text-green-800",
  users: "bg-red-100 text-red-800",
  sales: "bg-yellow-100 text-yellow-800",
  expenses: "bg-orange-100 text-orange-800",
  inventory: "bg-teal-100 text-teal-800",
};

function getCollectionLabel(col: string) {
  return COLLECTION_LABELS[col] || col.replace(/_/g, " ");
}

function getCollectionColor(col: string) {
  return COLLECTION_COLORS[col] || "bg-gray-100 text-gray-700";
}

export default function DeletedRecordsPage() {
  const { adminUser, role } = useAuth();
  const { toast } = useToast();
  const [filterCollection, setFilterCollection] = useState<string>("all");
  const [actionRecord, setActionRecord] = useState<DeletedRecord | null>(null);
  const [actionType, setActionType] = useState<"restore" | "purge" | null>(null);
  const [processing, setProcessing] = useState(false);

  const { data: records, loading, error } = useCollection<DeletedRecord>(
    "deleted_records",
    [orderBy("deletedAt", "desc")]
  );

  const uniqueCollections = Array.from(
    new Set(records.map((r) => r.originalCollection))
  ).sort();

  const filtered =
    filterCollection === "all"
      ? records
      : records.filter((r) => r.originalCollection === filterCollection);

  function promptAction(record: DeletedRecord, type: "restore" | "purge") {
    setActionRecord(record);
    setActionType(type);
  }

  async function handleRestore() {
    if (!actionRecord || !adminUser) return;
    setProcessing(true);
    try {
      const batch = writeBatch(db);

      // Unmark deleted on the original document
      const originalRef = doc(
        db,
        actionRecord.originalCollection,
        actionRecord.originalDocumentId
      );
      batch.update(originalRef, {
        isDeleted: false,
        restoredAt: serverTimestamp(),
        restoredBy: adminUser.id,
        restoredByName: adminUser.name,
      });

      // Remove from deleted_records archive
      const archiveRef = doc(db, "deleted_records", actionRecord.id);
      batch.delete(archiveRef);

      await batch.commit();

      await logAction(
        adminUser.id,
        adminUser.name,
        "restore",
        actionRecord.originalCollection,
        actionRecord.originalDocumentId,
        { isDeleted: true },
        { isDeleted: false },
        role ?? undefined
      );

      toast({
        title: "Record Restored",
        description: `${getCollectionLabel(actionRecord.originalCollection)} has been restored successfully.`,
      });
    } catch (err: any) {
      toast({
        title: "Restore Failed",
        description: err.message,
        variant: "destructive",
      });
    }
    setProcessing(false);
    setActionRecord(null);
    setActionType(null);
  }

  async function handlePurge() {
    if (!actionRecord || !adminUser) return;
    setProcessing(true);
    try {
      const batch = writeBatch(db);

      // Permanently delete the original document
      const originalRef = doc(
        db,
        actionRecord.originalCollection,
        actionRecord.originalDocumentId
      );
      batch.delete(originalRef);

      // Remove from deleted_records archive
      const archiveRef = doc(db, "deleted_records", actionRecord.id);
      batch.delete(archiveRef);

      await batch.commit();

      await logAction(
        adminUser.id,
        adminUser.name,
        "permanent_purge",
        actionRecord.originalCollection,
        actionRecord.originalDocumentId,
        { isDeleted: true },
        { purgedBy: adminUser.name },
        role ?? undefined
      );

      toast({
        title: "Record Permanently Deleted",
        description: `${getCollectionLabel(actionRecord.originalCollection)} has been permanently purged.`,
      });
    } catch (err: any) {
      toast({
        title: "Purge Failed",
        description: err.message,
        variant: "destructive",
      });
    }
    setProcessing(false);
    setActionRecord(null);
    setActionType(null);
  }

  function formatDate(ts: any): string {
    if (!ts) return "—";
    try {
      const date = ts.toDate ? ts.toDate() : new Date(ts);
      return format(date, "dd MMM yyyy, HH:mm");
    } catch {
      return "—";
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold flex items-center gap-2">
            <Archive className="w-6 h-6 text-destructive" />
            Deleted Records
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Review soft-deleted records. Restore to return them, or purge to
            permanently remove them. All actions are audited.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="text-muted-foreground">Total:</span>
          <Badge variant="secondary">{records.length} records</Badge>
        </div>
      </div>

      {/* Warning banner */}
      <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
        <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold text-destructive">Super Admin Only</p>
          <p className="text-muted-foreground mt-0.5">
            Purging is irreversible. Restore a record to make it active again,
            or purge only if the record is confirmed as obsolete. Every action
            generates an audit log entry.
          </p>
        </div>
      </div>

      {/* Collection filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <button
          onClick={() => setFilterCollection("all")}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            filterCollection === "all"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          }`}
        >
          All Collections
        </button>
        {uniqueCollections.map((col) => (
          <button
            key={col}
            onClick={() => setFilterCollection(col)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filterCollection === col
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {getCollectionLabel(col)}
          </button>
        ))}
      </div>

      {/* Records */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <DataError message="We couldn't load deleted records." />
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h3 className="font-semibold text-lg text-foreground">
              No Deleted Records
            </h3>
            <p className="text-muted-foreground text-sm mt-1">
              {filterCollection === "all"
                ? "There are no soft-deleted records in the system."
                : `No deleted ${getCollectionLabel(filterCollection)} records found.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((record, i) => (
            <motion.div
              key={record.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    {/* Info */}
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${getCollectionColor(record.originalCollection)}`}
                        >
                          {getCollectionLabel(record.originalCollection)}
                        </span>
                        <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded">
                          ID: {record.originalDocumentId}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5" />
                          {record.deletedByName || "Unknown"}
                          {record.deletedByRole && (
                            <span className="text-xs">
                              ({record.deletedByRole})
                            </span>
                          )}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {formatDate(record.deletedAt)}
                        </span>
                      </div>

                      {record.reason && (
                        <p className="text-sm text-muted-foreground italic">
                          Reason: "{record.reason}"
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-green-700 border-green-200 hover:bg-green-50"
                        onClick={() => promptAction(record, "restore")}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Restore
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/5"
                        onClick={() => promptAction(record, "purge")}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Purge
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Restore Confirmation Dialog */}
      <AlertDialog
        open={actionType === "restore" && !!actionRecord}
        onOpenChange={(open) => {
          if (!open) {
            setActionRecord(null);
            setActionType(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-green-600" />
              Restore Record
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will restore the{" "}
              <strong>
                {actionRecord
                  ? getCollectionLabel(actionRecord.originalCollection)
                  : ""}
              </strong>{" "}
              record and make it active again. The record will reappear in its
              original collection and all related views.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestore}
              disabled={processing}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {processing ? "Restoring…" : "Yes, Restore"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Purge Confirmation Dialog */}
      <AlertDialog
        open={actionType === "purge" && !!actionRecord}
        onOpenChange={(open) => {
          if (!open) {
            setActionRecord(null);
            setActionType(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Permanently Purge Record
            </AlertDialogTitle>
            <AlertDialogDescription>
              <strong>This action cannot be undone.</strong> The{" "}
              <strong>
                {actionRecord
                  ? getCollectionLabel(actionRecord.originalCollection)
                  : ""}
              </strong>{" "}
              record will be permanently deleted from the database. This purge
              will be recorded in the audit log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handlePurge}
              disabled={processing}
              className="bg-destructive hover:bg-destructive/90"
            >
              {processing ? "Purging…" : "Yes, Permanently Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
