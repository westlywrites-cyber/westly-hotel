import { useState, useMemo } from "react";
import { useCollection } from "@/hooks/useFirebase";
import { orderBy, where, limit } from "firebase/firestore";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { History, Search, Download, Shield } from "lucide-react";
import { formatDateTime, toFirestoreDate } from "@/lib/utils";
import { DataError } from "@/components/ui/data-error";

const ACTION_COLORS: Record<string, string> = {
  check_in: "bg-green-100 text-green-800",
  check_out: "bg-blue-100 text-blue-800",
  walk_in_checkin: "bg-teal-100 text-teal-800",
  admin_login: "bg-gray-100 text-gray-800",
  pin_login: "bg-gray-100 text-gray-800",
  user_created: "bg-purple-100 text-purple-800",
  user_suspended: "bg-red-100 text-red-800",
  user_active: "bg-green-100 text-green-800",
  soft_delete: "bg-red-100 text-red-800",
  restore: "bg-green-100 text-green-800",
  room_created: "bg-blue-100 text-blue-800",
  room_updated: "bg-yellow-100 text-yellow-800",
  new_sale: "bg-orange-100 text-orange-800",
};

export default function AuditLogPage() {
  const { data: logs, loading, error } = useCollection("audit_logs");
  const [search, setSearch] = useState("");
  const [collFilter, setCollFilter] = useState("all");

  const sorted = useMemo(() => {
    return [...logs].sort((a: any, b: any) => {
      const ta = toFirestoreDate(a.timestamp)?.getTime() ?? 0;
      const tb = toFirestoreDate(b.timestamp)?.getTime() ?? 0;
      return tb - ta;
    });
  }, [logs]);

  const collections = useMemo(() => {
    const cols = new Set(sorted.map((l: any) => l.collection).filter(Boolean));
    return ["all", ...Array.from(cols) as string[]];
  }, [sorted]);

  const filtered = useMemo(() => {
    return sorted.filter((log: any) => {
      const matchSearch = !search ||
        log.action?.toLowerCase().includes(search.toLowerCase()) ||
        log.userName?.toLowerCase().includes(search.toLowerCase()) ||
        log.documentId?.includes(search);
      const matchColl = collFilter === "all" || log.collection === collFilter;
      return matchSearch && matchColl;
    });
  }, [sorted, search, collFilter]);

  const exportCSV = () => {
    const csv = [
      ["Timestamp", "User", "Role", "Action", "Collection", "Document ID"],
      ...filtered.map((log: any) => [
        formatDateTime(toFirestoreDate(log.timestamp)),
        log.userName,
        log.userRole || "",
        log.action,
        log.collection,
        log.documentId,
      ])
    ].map(row => row.map(cell => `"${cell}"`).join(",")).join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" /> Audit Log
          </h1>
          <p className="text-muted-foreground text-sm">{filtered.length} entries</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={exportCSV}>
          <Download className="w-4 h-4" /> Export CSV
        </Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search actions, users…" value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={collFilter} onValueChange={setCollFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Collection" /></SelectTrigger>
          <SelectContent>
            {collections.map(c => <SelectItem key={c} value={c} className="capitalize">{c === "all" ? "All Collections" : c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <DataError message="We couldn't load the audit log." />
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <History className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>No audit log entries yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Timestamp</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">User</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Action</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Collection</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Document</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 200).map((log: any) => (
                    <tr key={log.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="py-2.5 px-4 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateTime(toFirestoreDate(log.timestamp))}
                      </td>
                      <td className="py-2.5 px-4">
                        <p className="font-medium text-xs">{log.userName}</p>
                        {log.userRole && <p className="text-[10px] text-muted-foreground capitalize">{log.userRole?.replace("_"," ")}</p>}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${ACTION_COLORS[log.action?.split(":")[0]] || "bg-muted text-muted-foreground"}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground text-xs">{log.collection}</td>
                      <td className="py-2.5 px-4 text-[10px] text-muted-foreground font-mono">{log.documentId?.slice(0, 12)}…</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
