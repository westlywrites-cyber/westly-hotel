import { useEffect, useState } from "react";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useDocument } from "@/hooks/useFirebase";
import { logAction } from "@/lib/audit";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import ImageUpload from "@/components/admin/ImageUpload";
import { DataError } from "@/components/ui/data-error";
import { Loader2, Eye } from "lucide-react";
import type { PageHeroSectionDef, PageHeroContent } from "@/lib/pageHero";
import { EMPTY_PAGE_HERO } from "@/lib/pageHero";

interface Props {
  section: PageHeroSectionDef;
}

/**
 * Full editor for one CMS page-hero/background section: image upload
 * (Supabase Storage), title/subtitle/description, optional button, and a
 * live preview that mirrors how the section actually renders on the public
 * page — so changes can be reviewed before the Save button publishes them.
 *
 * Self-contained: reads and writes cms_content/{section.docId} directly,
 * independent of CMSPage's other tabs, so it can be dropped in anywhere
 * without threading state through the parent.
 */
export default function PageHeroEditor({ section }: Props) {
  const { adminUser, role } = useAuth();
  const { toast } = useToast();
  const { data: docData, loading, error } = useDocument("cms_content", section.docId);

  const [form, setForm] = useState<PageHeroContent>(EMPTY_PAGE_HERO);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (docData) setForm({ ...EMPTY_PAGE_HERO, ...((docData as any).data || {}) });
  }, [docData]);

  const set = <K extends keyof PageHeroContent>(key: K, value: PageHeroContent[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function handleSave() {
    if (!adminUser) return;
    if (error) {
      toast({
        title: "Can't save yet",
        description: "This section's current content failed to load. Reload the page before saving to avoid overwriting it with blanks.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const ref = doc(db, "cms_content", section.docId);
      await setDoc(ref, { data: form, updatedAt: serverTimestamp() }, { merge: true });
      await logAction(
        adminUser.id,
        adminUser.name,
        `cms_updated:${section.docId}`,
        "cms_content",
        section.docId,
        null,
        null,
        role ?? undefined
      );
      toast({ title: "Published", description: `${section.label} is now live on the website.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return <DataError message="This section's content failed to load." />;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* ── Form ────────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Background Image</Label>
          <ImageUpload
            value={form.image}
            onChange={(url) => set("image", url)}
            folder={section.folder}
            label="background image"
            previewClassName="h-40"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Title</Label>
          <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Get in Touch" />
        </div>
        <div className="space-y-1.5">
          <Label>Subtitle</Label>
          <Input value={form.subtitle} onChange={(e) => set("subtitle", e.target.value)} placeholder="A short supporting line" />
        </div>
        <div className="space-y-1.5">
          <Label>Description / Body Text</Label>
          <Textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Optional longer text shown under the subtitle"
            rows={3}
          />
        </div>
        {section.supportsButton && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Button Text</Label>
              <Input value={form.buttonText} onChange={(e) => set("buttonText", e.target.value)} placeholder="e.g. Book Now" />
            </div>
            <div className="space-y-1.5">
              <Label>Button Link</Label>
              <Input value={form.buttonLink} onChange={(e) => set("buttonLink", e.target.value)} placeholder="/booking" />
            </div>
          </div>
        )}
        <Button onClick={handleSave} disabled={saving} className="gap-2 w-full sm:w-auto">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {saving ? "Publishing…" : "Save & Publish"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Changes go live on <span className="font-medium">{section.usedOn}</span> as soon as you save.
        </p>
      </div>

      {/* ── Live preview ────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5 text-muted-foreground">
          <Eye className="w-3.5 h-3.5" /> Preview
        </Label>
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="relative h-64 flex flex-col items-center justify-center text-center px-6">
              {form.image ? (
                <img src={form.image} alt="" className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <div
                  className="absolute inset-0"
                  style={{ background: "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--secondary)) 100%)" }}
                />
              )}
              <div className="absolute inset-0 bg-black/50" />
              <div className="relative z-10 text-white space-y-2 max-w-xs">
                {form.subtitle && (
                  <p className="text-xs uppercase tracking-widest text-white/70">{form.subtitle}</p>
                )}
                <h2 className="font-serif text-2xl font-bold leading-tight">
                  {form.title || section.label}
                </h2>
                {form.description && (
                  <p className="text-sm text-white/80 line-clamp-3">{form.description}</p>
                )}
                {section.supportsButton && form.buttonText && (
                  <span className="inline-block mt-2 px-4 py-1.5 rounded-full bg-secondary text-foreground text-xs font-semibold">
                    {form.buttonText}
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">
          This preview updates as you type. It won't affect the live site until you save.
        </p>
      </div>
    </div>
  );
}
