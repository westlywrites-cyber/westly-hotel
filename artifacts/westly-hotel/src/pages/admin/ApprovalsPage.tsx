import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  CheckCircle2, XCircle, Clock, Loader2, Search, Download,
  ReceiptText, BedDouble, Coffee, ShoppingCart, Banknote, Wine, Shirt,
} from "lucide-react";
import { formatCurrency, formatDateTime, formatDate } from "@/lib/utils";
import { DataError } from "@/components/ui/data-error";
import { format } from "date-fns";
import {
  useRevenueLedger, approveTransaction, rejectTransaction,
  pendingOnly, approvedOnly, rejectedOnly, inRange, resolveDateRange, groupByDay,
  sumAmount, type RevenueTransaction, type DateRangePreset, type ApprovalStatus,
} from "@/lib/revenue";

const STATUS_BADGE: Record<ApprovalStatus, { label: string; className: string; icon: any }> = {
  pending: { label: "Pending", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400", icon: Clock },
  approved: { label: "Approved", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", icon: CheckCircle2 },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: XCircle },
};

const CATEGORY_ICON: Record<string, any> = { room: BedDouble, restaurant: Coffee, sales: ShoppingCart, bar: Wine, laundry: Shirt, other: Banknote };

export default function ApprovalsPage() {
  const { adminUser, role } = useAuth();
  const { toast } = useToast();
  const { transactions, loading, error } = useRevenueLedger();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<RevenueTransaction | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // ── History filters ──────────────────────────────────────────────────────
  const [preset, setPreset] = useState<DateRangePreset>("month");
  const [customStart, setCustomStart] = useState(format(new Date(), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd] = useState(format(new Date(), "yyyy-MM-dd"));
  const [statusFilter, setStatusFilter] = useState<"all" | ApprovalStatus>("all");
  const [search, setSearch] = useState("");

  const pending = useMemo(() => pendingOnly(transactions), [transactions]);

  const { start, end } = useMemo(
    () => resolveDateRange(preset, new Date(), new Date(customStart), new Date(customEnd)),
    [preset, customStart, customEnd]
  );

  const rangeTxns = useMemo(() => inRange(transactions, start, end), [transactions, start, end]);

  const filteredHistory = useMemo(() => {
    return rangeTxns.filter(t => {
      const matchStatus = statusFilter === "all" || t.approvalStatus === statusFilter;
      const matchSearch = !search || t.guestName.toLowerCase().includes(search.toLowerCase()) || t.typeLabel.toLowerCase().includes(search.toLowerCase());
      return matchStatus && matchSearch;
    }).sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
  }, [rangeTxns, statusFilter, search]);

  const dailyRecords = useMemo(() => groupByDay(rangeTxns), [rangeTxns]);

  const rangeSummary = useMemo(() => {
    const approved = approvedOnly(rangeTxns);
    const rejected = rejectedOnly(rangeTxns);
    const pend = pendingOnly(rangeTxns);
    return {
      totalApproved: sumAmount(approved),
      countApproved: approved.length,
      countPending: pend.length,
      countRejected: rejected.length,
      countAll: rangeTxns.length,
    };
  }, [rangeTxns]);

  const doApprove = async (t: RevenueTransaction) => {
    if (!adminUser) return;
    setBusyId(t.id);
    try {
      await approveTransaction(t, adminUser, role);
      toast({ title: "Payment Approved", description: `${formatCurrency(t.amount)} from ${t.guestName} is now counted as revenue.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setBusyId(null);
  };

  const openReject = (t: RevenueTransaction) => {
    setRejectTarget(t);
    setRejectReason("");
  };

  const doReject = async () => {
    if (!adminUser || !rejectTarget) return;
    setBusyId(rejectTarget.id);
    try {
      await rejectTransaction(rejectTarget, adminUser, role, rejectReason);
      toast({ title: "Payment Rejected", description: `${formatCurrency(rejectTarget.amount)} from ${rejectTarget.guestName} was excluded from revenue.` });
      setRejectTarget(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setBusyId(null);
  };

  const exportHistoryCSV = () => {
    const csv = [
      ["Date & Time","Guest","Type","Category","Amount","Method","Status","Recorded By","Approved By","Approval Date","Rejection Reason"],
      ...filteredHistory.map(t => [
        formatDateTime(t.date), t.guestName, t.typeLabel, t.categoryLabel, t.amount, t.paymentMethod,
        t.approvalStatus, t.recordedByName, t.approvedByName || "", t.approvedAt ? formatDateTime(t.approvedAt) : "", t.rejectedReason || "",
      ])
    ].map(r => r.map(c => `"${String(c ?? "").replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `transactions-${format(start,"yyyy-MM-dd")}_to_${format(end,"yyyy-MM-dd")}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-2xl font-bold">Accountant · Approvals & Records</h1>
        <p className="text-muted-foreground text-sm">Review incoming payments and manage the hotel's financial record.</p>
      </div>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending" className="gap-1.5">
            Pending Approvals
            {pending.length > 0 && <Badge className="ml-1 bg-amber-500 hover:bg-amber-500 text-white h-5 px-1.5">{pending.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="history">Transaction History</TabsTrigger>
          <TabsTrigger value="daily">Daily Records</TabsTrigger>
        </TabsList>

        {/* ── PENDING APPROVALS ─────────────────────────────────────────── */}
        <TabsContent value="pending" className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : error ? (
            <DataError message="We couldn't load pending payments." />
          ) : pending.length === 0 ? (
            <Card><CardContent className="text-center py-14 text-muted-foreground">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>No payments waiting for approval. Everything's up to date.</p>
            </CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {pending.map(t => {
                const Icon = CATEGORY_ICON[t.category];
                return (
                  <Card key={`${t.sourceCollection}-${t.id}`} className="border-amber-200 dark:border-amber-900/40">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center"><Icon className="w-4 h-4 text-amber-700 dark:text-amber-400" /></div>
                          <div>
                            <p className="font-semibold">{t.guestName}</p>
                            <p className="text-xs text-muted-foreground">{t.typeLabel} · {t.categoryLabel}</p>
                          </div>
                        </div>
                        <p className="text-lg font-bold text-primary">{formatCurrency(t.amount)}</p>
                      </div>
                      <div className="text-xs text-muted-foreground grid grid-cols-2 gap-y-0.5">
                        <span>{t.date ? formatDateTime(t.date) : "—"}</span>
                        <span className="text-right capitalize">{t.paymentMethod?.replace("_"," ")}</span>
                        <span>Recorded by {t.recordedByName}</span>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" className="flex-1 gap-1.5 bg-green-600 hover:bg-green-700" disabled={busyId === t.id} onClick={() => doApprove(t)}>
                          {busyId === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}Approve
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1 gap-1.5 text-red-600 border-red-200 hover:bg-red-50" disabled={busyId === t.id} onClick={() => openReject(t)}>
                          <XCircle className="w-3.5 h-3.5" />Reject
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── TRANSACTION HISTORY ───────────────────────────────────────── */}
        <TabsContent value="history" className="space-y-4">
          <FilterBar
            preset={preset} setPreset={setPreset}
            customStart={customStart} setCustomStart={setCustomStart}
            customEnd={customEnd} setCustomEnd={setCustomEnd}
            statusFilter={statusFilter} setStatusFilter={setStatusFilter}
            search={search} setSearch={setSearch}
            onExport={exportHistoryCSV}
          />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryStat label="Approved Revenue" value={formatCurrency(rangeSummary.totalApproved)} color="text-green-600" />
            <SummaryStat label="Transactions" value={String(rangeSummary.countAll)} color="text-primary" />
            <SummaryStat label="Pending" value={String(rangeSummary.countPending)} color="text-amber-600" />
            <SummaryStat label="Rejected" value={String(rangeSummary.countRejected)} color="text-red-500" />
          </div>

          <Card>
            <CardContent className="p-0">
              {filteredHistory.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground"><ReceiptText className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>No transactions in this range.</p></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Date &amp; Time</th>
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Guest</th>
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Type</th>
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Category</th>
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Amount</th>
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Method</th>
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Recorded By</th>
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Approved By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHistory.map(t => {
                        const badge = STATUS_BADGE[t.approvalStatus];
                        return (
                          <tr key={`${t.sourceCollection}-${t.id}`} className="border-b border-border last:border-0 hover:bg-muted/20">
                            <td className="py-2.5 px-4 text-muted-foreground whitespace-nowrap">{t.date ? formatDateTime(t.date) : "—"}</td>
                            <td className="py-2.5 px-4 font-medium">{t.guestName}</td>
                            <td className="py-2.5 px-4 text-xs text-muted-foreground">{t.typeLabel}</td>
                            <td className="py-2.5 px-4 text-xs text-muted-foreground">{t.categoryLabel}</td>
                            <td className={`py-2.5 px-4 font-bold ${t.approvalStatus === "approved" ? "text-green-600" : t.approvalStatus === "rejected" ? "text-red-500 line-through" : "text-muted-foreground"}`}>{formatCurrency(t.amount)}</td>
                            <td className="py-2.5 px-4 capitalize text-muted-foreground">{t.paymentMethod?.replace("_"," ")}</td>
                            <td className="py-2.5 px-4 text-muted-foreground">{t.recordedByName}</td>
                            <td className="py-2.5 px-4"><Badge variant="outline" className={`gap-1 ${badge.className}`}><badge.icon className="w-3 h-3" />{badge.label}</Badge></td>
                            <td className="py-2.5 px-4 text-muted-foreground text-xs">{t.approvedByName ? `${t.approvedByName}${t.approvedAt ? " · " + formatDate(t.approvedAt) : ""}` : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── DAILY RECORDS ─────────────────────────────────────────────── */}
        <TabsContent value="daily" className="space-y-4">
          <FilterBar
            preset={preset} setPreset={setPreset}
            customStart={customStart} setCustomStart={setCustomStart}
            customEnd={customEnd} setCustomEnd={setCustomEnd}
            statusFilter={statusFilter} setStatusFilter={setStatusFilter}
            search={search} setSearch={setSearch}
            hideSearch
          />

          {dailyRecords.length === 0 ? (
            <Card><CardContent className="text-center py-12 text-muted-foreground"><ReceiptText className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>No activity in this range.</p></CardContent></Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Date</th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">Room</th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">Restaurant</th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">Bar</th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">Laundry</th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">Sales</th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">Other</th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">Total Revenue</th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">Txns</th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">Pending</th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">Approved</th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">Rejected</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailyRecords.map(d => (
                        <tr key={d.date} className="border-b border-border last:border-0 hover:bg-muted/20">
                          <td className="py-2.5 px-4 font-medium">{d.label}</td>
                          <td className="py-2.5 px-4 text-right">{formatCurrency(d.roomRevenue)}</td>
                          <td className="py-2.5 px-4 text-right">{formatCurrency(d.restaurantRevenue)}</td>
                          <td className="py-2.5 px-4 text-right">{formatCurrency(d.barRevenue)}</td>
                          <td className="py-2.5 px-4 text-right">{formatCurrency(d.laundryRevenue)}</td>
                          <td className="py-2.5 px-4 text-right">{formatCurrency(d.salesRevenue)}</td>
                          <td className="py-2.5 px-4 text-right">{formatCurrency(d.otherRevenue)}</td>
                          <td className="py-2.5 px-4 text-right font-bold text-green-600">{formatCurrency(d.totalRevenue)}</td>
                          <td className="py-2.5 px-4 text-right text-muted-foreground">{d.transactionCount}</td>
                          <td className="py-2.5 px-4 text-right text-amber-600">{d.pending}</td>
                          <td className="py-2.5 px-4 text-right text-green-600">{d.approved}</td>
                          <td className="py-2.5 px-4 text-right text-red-500">{d.rejected}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Reject dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject Payment</DialogTitle></DialogHeader>
          {rejectTarget && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Rejecting <span className="font-medium text-foreground">{formatCurrency(rejectTarget.amount)}</span> from{" "}
                <span className="font-medium text-foreground">{rejectTarget.guestName}</span>. It will be excluded from all revenue totals but kept in the record for audit purposes.
              </p>
              <div className="space-y-1.5">
                <Label>Reason (optional)</Label>
                <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="e.g. duplicate entry, unverified amount…" rows={3} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
                <Button type="button" variant="destructive" disabled={busyId === rejectTarget.id} className="gap-2" onClick={doReject}>
                  {busyId === rejectTarget.id && <Loader2 className="w-4 h-4 animate-spin" />}Reject Payment
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-lg font-bold mt-0.5 ${color}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function FilterBar({
  preset, setPreset, customStart, setCustomStart, customEnd, setCustomEnd,
  statusFilter, setStatusFilter, search, setSearch, onExport, hideSearch,
}: {
  preset: DateRangePreset; setPreset: (v: DateRangePreset) => void;
  customStart: string; setCustomStart: (v: string) => void;
  customEnd: string; setCustomEnd: (v: string) => void;
  statusFilter: "all" | ApprovalStatus; setStatusFilter: (v: "all" | ApprovalStatus) => void;
  search?: string; setSearch?: (v: string) => void;
  onExport?: () => void; hideSearch?: boolean;
}) {
  return (
    <div className="flex gap-3 flex-wrap items-end">
      {!hideSearch && setSearch && (
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search guest, type…" value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
      )}
      <div className="space-y-1">
        <Label className="text-xs">Range</Label>
        <Select value={preset} onValueChange={(v) => setPreset(v as DateRangePreset)}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="year">This Year</SelectItem>
            <SelectItem value="custom">Custom Range</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {preset === "custom" && (
        <>
          <div className="space-y-1"><Label className="text-xs">From</Label><Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="w-40" /></div>
          <div className="space-y-1"><Label className="text-xs">To</Label><Input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="w-40" /></div>
        </>
      )}
      <div className="space-y-1">
        <Label className="text-xs">Status</Label>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | ApprovalStatus)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {onExport && <Button variant="outline" className="gap-2" onClick={onExport}><Download className="w-4 h-4" />Export</Button>}
    </div>
  );
}
