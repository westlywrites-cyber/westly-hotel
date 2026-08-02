import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useDocument } from "@/hooks/useFirebase";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logAction } from "@/lib/audit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Settings, Loader2, CheckCircle } from "lucide-react";

export default function SettingsPage() {
  const { adminUser, role } = useAuth();
  const { toast } = useToast();
  const { data: settings } = useDocument("settings", "hotel");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    if (settings) {
      setForm({
        hotelName: (settings as any).hotelName || "",
        tagline: (settings as any).tagline || "",
        phone: (settings as any).phone || "",
        email: (settings as any).email || "",
        address: (settings as any).address || "",
        currency: (settings as any).currency || "NGN",
        checkInTime: (settings as any).checkInTime || "14:00",
        checkOutTime: (settings as any).checkOutTime || "11:00",
        instagram: (settings as any).socialLinks?.instagram || "",
        facebook: (settings as any).socialLinks?.facebook || "",
        twitter: (settings as any).socialLinks?.twitter || "",
      });
    }
  }, [settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminUser) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "settings", "hotel"), {
        hotelName: form.hotelName,
        tagline: form.tagline,
        phone: form.phone,
        email: form.email,
        address: form.address,
        currency: form.currency,
        checkInTime: form.checkInTime,
        checkOutTime: form.checkOutTime,
        socialLinks: {
          instagram: form.instagram,
          facebook: form.facebook,
          twitter: form.twitter,
        },
        updatedAt: serverTimestamp(),
        updatedBy: adminUser.id,
      });
      await logAction(adminUser.id, adminUser.name, "settings_updated", "settings", "hotel", null, null, role ?? undefined);
      toast({ title: "Settings Saved" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="font-serif text-2xl font-bold flex items-center gap-2">
          <Settings className="w-6 h-6" /> Settings
        </h1>
        <p className="text-muted-foreground text-sm">Hotel configuration & contact details</p>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        <Card>
          <CardHeader><CardTitle className="text-base">Hotel Information</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 md:col-span-2">
              <Label>Hotel Name</Label>
              <Input value={form.hotelName || ""} onChange={e => setForm({...form, hotelName: e.target.value})} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Tagline</Label>
              <Input value={form.tagline || ""} onChange={e => setForm({...form, tagline: e.target.value})} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone || ""} onChange={e => setForm({...form, phone: e.target.value})} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email || ""} onChange={e => setForm({...form, email: e.target.value})} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Address</Label>
              <Input value={form.address || ""} onChange={e => setForm({...form, address: e.target.value})} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Policies</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Check-In Time</Label>
              <Input type="time" value={form.checkInTime || "14:00"} onChange={e => setForm({...form, checkInTime: e.target.value})} />
            </div>
            <div className="space-y-1.5">
              <Label>Check-Out Time</Label>
              <Input type="time" value={form.checkOutTime || "11:00"} onChange={e => setForm({...form, checkOutTime: e.target.value})} />
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Input value={form.currency || "NGN"} onChange={e => setForm({...form, currency: e.target.value})} placeholder="NGN" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Social Media</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {[
              { key: "instagram", label: "Instagram URL" },
              { key: "facebook", label: "Facebook URL" },
              { key: "twitter", label: "Twitter / X URL" },
            ].map(s => (
              <div key={s.key} className="space-y-1.5">
                <Label>{s.label}</Label>
                <Input value={form[s.key] || ""} onChange={e => setForm({...form, [s.key]: e.target.value})} placeholder="https://…" />
              </div>
            ))}
          </CardContent>
        </Card>

        <Button type="submit" disabled={saving} className="gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
          {saving ? "Saving…" : "Save Settings"}
        </Button>
      </form>
    </div>
  );
}
