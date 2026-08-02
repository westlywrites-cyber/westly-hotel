import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useDocument } from "@/hooks/useFirebase";
import { doc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logAction } from "@/lib/audit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import ImageUpload from "@/components/admin/ImageUpload";
import PageHeroEditor from "@/components/admin/PageHeroEditor";
import { PAGE_HERO_SECTIONS } from "@/lib/pageHero";
import { asArray } from "@/lib/utils";
import { DataError } from "@/components/ui/data-error";
import {
  BookOpen,
  Loader2,
  CheckCircle,
  Monitor,
  Info,
  Mail,
  Users,
  HelpCircle,
  Images,
  Plus,
  Pencil,
  Trash2,
  Star,
  GripVertical,
  X,
} from "lucide-react";
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

type Tab = "hero" | "about" | "pageBanners" | "contact" | "testimonials" | "faqs";

// ── Types ─────────────────────────────────────────────────────────────────────
interface TestimonialItem {
  id: string;
  author: string;
  role?: string;
  text: string;
  rating: number;
}

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  order?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ── StarPicker ────────────────────────────────────────────────────────────────
function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className="focus:outline-none"
          title={`${n} star${n > 1 ? "s" : ""}`}
        >
          <Star
            className={`w-5 h-5 transition-colors ${
              n <= value
                ? "fill-secondary text-secondary"
                : "fill-muted text-muted-foreground"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function CMSPage() {
  const { adminUser, role } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>("hero");
  const [saving, setSaving] = useState(false);
  const [openBannerSection, setOpenBannerSection] = useState<string | null>(null);

  // ── Firestore docs ──────────────────────────────────────────────────────────
  const { data: heroDoc, error: heroError } = useDocument("cms_content", "hero");
  const { data: aboutDoc, error: aboutError } = useDocument("cms_content", "about");
  const { data: contactDoc, error: contactError } = useDocument("cms_content", "contact");
  const { data: testimonialsDoc, error: testimonialsError } = useDocument("cms_content", "testimonials");
  const { data: faqsDoc, error: faqsError } = useDocument("cms_content", "faqs");
  // If a section's content failed to load, its form state is empty — saving
  // in that state would silently overwrite the real content in Firestore
  // with blanks. Block saves until the page is reloaded and the read
  // succeeds, rather than letting an admin destroy content they never saw.
  const hasLoadError = !!(heroError || aboutError || contactError || testimonialsError || faqsError);

  // ── Form state ──────────────────────────────────────────────────────────────
  const [heroForm, setHeroForm] = useState<any>({});
  const [aboutForm, setAboutForm] = useState<any>({});
  const [contactForm, setContactForm] = useState<any>({});
  const [testimonials, setTestimonials] = useState<TestimonialItem[]>([]);
  const [faqs, setFaqs] = useState<FAQItem[]>([]);

  // Editing/creating state
  const [editingTestimonial, setEditingTestimonial] =
    useState<TestimonialItem | null>(null);
  const [newTestimonial, setNewTestimonial] = useState<Omit<
    TestimonialItem,
    "id"
  > | null>(null);
  const [editingFaq, setEditingFaq] = useState<FAQItem | null>(null);
  const [newFaq, setNewFaq] = useState<Omit<FAQItem, "id"> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "testimonial" | "faq";
    id: string;
    label: string;
  } | null>(null);

  // ── Sync from Firestore ─────────────────────────────────────────────────────
  useEffect(() => {
    if (heroDoc) setHeroForm((heroDoc as any).data || {});
  }, [heroDoc]);
  useEffect(() => {
    if (aboutDoc) setAboutForm((aboutDoc as any).data || {});
  }, [aboutDoc]);
  useEffect(() => {
    if (contactDoc) setContactForm((contactDoc as any).data || {});
  }, [contactDoc]);
  useEffect(() => {
    if (testimonialsDoc)
      setTestimonials(asArray<TestimonialItem>((testimonialsDoc as any).data));
  }, [testimonialsDoc]);
  useEffect(() => {
    if (faqsDoc) setFaqs(asArray<FAQItem>((faqsDoc as any).data));
  }, [faqsDoc]);

  // ── Shared save helper ──────────────────────────────────────────────────────
  async function saveDoc(docId: string, data: any) {
    if (!adminUser) return;
    if (hasLoadError) {
      toast({ title: "Can't save yet", description: "Some content failed to load. Reload the page before saving to avoid overwriting existing content.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const ref = doc(db, "cms_content", docId);
      await setDoc(ref, { data, updatedAt: serverTimestamp() }, { merge: true });
      await logAction(
        adminUser.id,
        adminUser.name,
        `cms_updated:${docId}`,
        "cms_content",
        docId,
        null,
        null,
        role ?? undefined
      );
      toast({ title: "Content Saved" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  }

  // ── Testimonial actions ─────────────────────────────────────────────────────
  function addTestimonial() {
    setNewTestimonial({ author: "", role: "", text: "", rating: 5 });
  }

  async function saveNewTestimonial() {
    if (!newTestimonial?.author || !newTestimonial.text) return;
    const updated = [
      ...testimonials,
      { id: uid(), ...newTestimonial },
    ];
    await saveDoc("testimonials", updated);
    setTestimonials(updated);
    setNewTestimonial(null);
  }

  function editTestimonial(item: TestimonialItem) {
    setEditingTestimonial({ ...item });
  }

  async function saveEditedTestimonial() {
    if (!editingTestimonial) return;
    const updated = testimonials.map((t) =>
      t.id === editingTestimonial.id ? editingTestimonial : t
    );
    await saveDoc("testimonials", updated);
    setTestimonials(updated);
    setEditingTestimonial(null);
  }

  async function deleteTestimonial(id: string) {
    const updated = testimonials.filter((t) => t.id !== id);
    await saveDoc("testimonials", updated);
    setTestimonials(updated);
    setDeleteTarget(null);
  }

  // ── FAQ actions ─────────────────────────────────────────────────────────────
  function addFaq() {
    setNewFaq({ question: "", answer: "", order: faqs.length + 1 });
  }

  async function saveNewFaq() {
    if (!newFaq?.question || !newFaq.answer) return;
    const updated = [...faqs, { id: uid(), ...newFaq }];
    await saveDoc("faqs", updated);
    setFaqs(updated);
    setNewFaq(null);
  }

  function editFaq(item: FAQItem) {
    setEditingFaq({ ...item });
  }

  async function saveEditedFaq() {
    if (!editingFaq) return;
    const updated = faqs.map((f) =>
      f.id === editingFaq.id ? editingFaq : f
    );
    await saveDoc("faqs", updated);
    setFaqs(updated);
    setEditingFaq(null);
  }

  async function deleteFaq(id: string) {
    const updated = faqs.filter((f) => f.id !== id);
    await saveDoc("faqs", updated);
    setFaqs(updated);
    setDeleteTarget(null);
  }

  // ── Tabs ────────────────────────────────────────────────────────────────────
  const TABS: { key: Tab; label: string; icon: React.ComponentType<any> }[] = [
    { key: "hero", label: "Hero", icon: Monitor },
    { key: "about", label: "About", icon: Info },
    { key: "pageBanners", label: "Page Banners", icon: Images },
    { key: "contact", label: "Contact", icon: Mail },
    { key: "testimonials", label: "Testimonials", icon: Users },
    { key: "faqs", label: "FAQs", icon: HelpCircle },
  ];

  return (
    <div className={`space-y-5 ${activeTab === "pageBanners" ? "max-w-5xl" : "max-w-3xl"}`}>
      <div>
        <h1 className="font-serif text-2xl font-bold flex items-center gap-2">
          <BookOpen className="w-6 h-6" /> Website CMS
        </h1>
        <p className="text-muted-foreground text-sm">
          Edit public website content without touching code
        </p>
      </div>

      {hasLoadError && (
        <DataError message="Some website content failed to load. Reload the page before making changes — saving now could overwrite existing content with blanks." />
      )}

      {/* Tab bar */}
      <div className="flex gap-1.5 flex-wrap border-b border-border pb-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── HERO ──────────────────────────────────────────────────────────────── */}
      {activeTab === "hero" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hero Section</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { key: "headline", label: "Headline" },
              { key: "subheadline", label: "Sub-headline" },
              { key: "ctaText", label: "CTA Button Text" },
              { key: "ctaLink", label: "CTA Button Link" },
            ].map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label>{f.label}</Label>
                <Input
                  value={heroForm[f.key] || ""}
                  onChange={(e) =>
                    setHeroForm({ ...heroForm, [f.key]: e.target.value })
                  }
                />
              </div>
            ))}
            <div className="space-y-1.5">
              <Label>Background Image</Label>
              <ImageUpload
                value={heroForm.backgroundImage || ""}
                onChange={(url) => setHeroForm({ ...heroForm, backgroundImage: url })}
                folder="cms-hero"
                label="background image"
                previewClassName="h-40"
              />
            </div>
            <Button
              onClick={() => saveDoc("hero", heroForm)}
              disabled={saving}
              className="gap-2"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4" />
              )}
              Save Hero
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── ABOUT ─────────────────────────────────────────────────────────────── */}
      {activeTab === "about" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">About Section</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { key: "title", label: "Title" },
              { key: "description", label: "Description" },
              { key: "mission", label: "Mission Statement" },
              { key: "founded", label: "Year Founded" },
            ].map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label>{f.label}</Label>
                <Input
                  value={aboutForm[f.key] || ""}
                  onChange={(e) =>
                    setAboutForm({ ...aboutForm, [f.key]: e.target.value })
                  }
                />
              </div>
            ))}
            <div className="space-y-1.5">
              <Label>Image</Label>
              <ImageUpload
                value={aboutForm.image || ""}
                onChange={(url) => setAboutForm({ ...aboutForm, image: url })}
                folder="cms-about"
                label="about image"
                previewClassName="h-40"
              />
            </div>
            <Button
              onClick={() => saveDoc("about", aboutForm)}
              disabled={saving}
              className="gap-2"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4" />
              )}
              Save About
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── PAGE BANNERS ──────────────────────────────────────────────────────── */}
      {activeTab === "pageBanners" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground -mt-1">
            Hero banners and backgrounds for every other page on the site. Each one uploads
            straight to Supabase Storage and goes live as soon as you save.
          </p>
          {PAGE_HERO_SECTIONS.map((section) => (
            <Card key={section.docId}>
              <CardHeader
                className="cursor-pointer"
                onClick={() =>
                  setOpenBannerSection(openBannerSection === section.docId ? null : section.docId)
                }
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{section.label}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">{section.usedOn}</p>
                  </div>
                  <Button variant="outline" size="sm">
                    {openBannerSection === section.docId ? "Close" : "Edit"}
                  </Button>
                </div>
              </CardHeader>
              {openBannerSection === section.docId && (
                <CardContent className="pt-0 border-t border-border">
                  <div className="pt-4">
                    <PageHeroEditor section={section} />
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* ── CONTACT ───────────────────────────────────────────────────────────── */}
      {activeTab === "contact" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { key: "address", label: "Address" },
              { key: "phone", label: "Phone" },
              { key: "email", label: "Email" },
              { key: "checkInTime", label: "Check-In Time" },
              { key: "checkOutTime", label: "Check-Out Time" },
              { key: "mapEmbedUrl", label: "Google Maps Embed URL" },
            ].map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label>{f.label}</Label>
                <Input
                  value={contactForm[f.key] || ""}
                  onChange={(e) =>
                    setContactForm({ ...contactForm, [f.key]: e.target.value })
                  }
                />
              </div>
            ))}
            <Button
              onClick={() => saveDoc("contact", contactForm)}
              disabled={saving}
              className="gap-2"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4" />
              )}
              Save Contact
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── TESTIMONIALS ──────────────────────────────────────────────────────── */}
      {activeTab === "testimonials" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-base">
              Testimonials{" "}
              <span className="text-muted-foreground font-normal text-sm">
                ({testimonials.length})
              </span>
            </h2>
            {!newTestimonial && !editingTestimonial && (
              <Button size="sm" onClick={addTestimonial} className="gap-1.5">
                <Plus className="w-4 h-4" /> Add Testimonial
              </Button>
            )}
          </div>

          {/* Add new testimonial form */}
          {newTestimonial && (
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader>
                <CardTitle className="text-sm">New Testimonial</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Guest Name *</Label>
                    <Input
                      value={newTestimonial.author}
                      onChange={(e) =>
                        setNewTestimonial({
                          ...newTestimonial,
                          author: e.target.value,
                        })
                      }
                      placeholder="Jane Doe"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Stay Type / Label</Label>
                    <Input
                      value={newTestimonial.role || ""}
                      onChange={(e) =>
                        setNewTestimonial({
                          ...newTestimonial,
                          role: e.target.value,
                        })
                      }
                      placeholder="Honeymoon, Business Trip…"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Review Text *</Label>
                  <textarea
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-y"
                    value={newTestimonial.text}
                    onChange={(e) =>
                      setNewTestimonial({
                        ...newTestimonial,
                        text: e.target.value,
                      })
                    }
                    placeholder="Share the guest's experience…"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Rating</Label>
                  <StarPicker
                    value={newTestimonial.rating}
                    onChange={(n) =>
                      setNewTestimonial({ ...newTestimonial, rating: n })
                    }
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={saveNewTestimonial}
                    disabled={saving || !newTestimonial.author || !newTestimonial.text}
                    className="gap-1.5"
                  >
                    {saving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle className="w-3.5 h-3.5" />
                    )}
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setNewTestimonial(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Testimonial list */}
          {testimonials.length === 0 && !newTestimonial ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground text-sm">
                No testimonials yet. Add your first one above.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {testimonials.map((item) => (
                <Card key={item.id}>
                  <CardContent className="p-4">
                    {editingTestimonial?.id === item.id ? (
                      // Edit form
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label>Guest Name *</Label>
                            <Input
                              value={editingTestimonial.author}
                              onChange={(e) =>
                                setEditingTestimonial({
                                  ...editingTestimonial,
                                  author: e.target.value,
                                })
                              }
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Stay Type</Label>
                            <Input
                              value={editingTestimonial.role || ""}
                              onChange={(e) =>
                                setEditingTestimonial({
                                  ...editingTestimonial,
                                  role: e.target.value,
                                })
                              }
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Review Text</Label>
                          <textarea
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-y"
                            value={editingTestimonial.text}
                            onChange={(e) =>
                              setEditingTestimonial({
                                ...editingTestimonial,
                                text: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Rating</Label>
                          <StarPicker
                            value={editingTestimonial.rating}
                            onChange={(n) =>
                              setEditingTestimonial({
                                ...editingTestimonial,
                                rating: n,
                              })
                            }
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={saveEditedTestimonial}
                            disabled={saving}
                            className="gap-1.5"
                          >
                            {saving ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <CheckCircle className="w-3.5 h-3.5" />
                            )}
                            Save Changes
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingTestimonial(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      // Display row
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-semibold text-sm">
                              {item.author}
                            </span>
                            {item.role && (
                              <span className="text-xs text-muted-foreground">
                                · {item.role}
                              </span>
                            )}
                            <div className="flex gap-0.5">
                              {[1, 2, 3, 4, 5].map((n) => (
                                <Star
                                  key={n}
                                  className={`w-3 h-3 ${
                                    n <= item.rating
                                      ? "fill-secondary text-secondary"
                                      : "fill-muted text-muted"
                                  }`}
                                />
                              ))}
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground italic line-clamp-2">
                            "{item.text}"
                          </p>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <button
                            onClick={() => editTestimonial(item)}
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() =>
                              setDeleteTarget({
                                type: "testimonial",
                                id: item.id,
                                label: item.author,
                              })
                            }
                            className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── FAQS ──────────────────────────────────────────────────────────────── */}
      {activeTab === "faqs" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-base">
              FAQ Items{" "}
              <span className="text-muted-foreground font-normal text-sm">
                ({faqs.length})
              </span>
            </h2>
            {!newFaq && !editingFaq && (
              <Button size="sm" onClick={addFaq} className="gap-1.5">
                <Plus className="w-4 h-4" /> Add FAQ
              </Button>
            )}
          </div>

          {/* Add new FAQ form */}
          {newFaq && (
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader>
                <CardTitle className="text-sm">New FAQ</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Question *</Label>
                  <Input
                    value={newFaq.question}
                    onChange={(e) =>
                      setNewFaq({ ...newFaq, question: e.target.value })
                    }
                    placeholder="What are your check-in times?"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Answer *</Label>
                  <textarea
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[100px] resize-y"
                    value={newFaq.answer}
                    onChange={(e) =>
                      setNewFaq({ ...newFaq, answer: e.target.value })
                    }
                    placeholder="Provide a clear, helpful answer…"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={saveNewFaq}
                    disabled={saving || !newFaq.question || !newFaq.answer}
                    className="gap-1.5"
                  >
                    {saving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle className="w-3.5 h-3.5" />
                    )}
                    Save FAQ
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setNewFaq(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* FAQ list */}
          {faqs.length === 0 && !newFaq ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground text-sm">
                No FAQs yet. Add your first one above.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {faqs.map((item, idx) => (
                <Card key={item.id}>
                  <CardContent className="p-4">
                    {editingFaq?.id === item.id ? (
                      // Edit form
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <Label>Question *</Label>
                          <Input
                            value={editingFaq.question}
                            onChange={(e) =>
                              setEditingFaq({
                                ...editingFaq,
                                question: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Answer *</Label>
                          <textarea
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[100px] resize-y"
                            value={editingFaq.answer}
                            onChange={(e) =>
                              setEditingFaq({
                                ...editingFaq,
                                answer: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={saveEditedFaq}
                            disabled={saving}
                            className="gap-1.5"
                          >
                            {saving ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <CheckCircle className="w-3.5 h-3.5" />
                            )}
                            Save Changes
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingFaq(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      // Display row
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded shrink-0">
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-foreground">
                            {item.question}
                          </p>
                          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                            {item.answer}
                          </p>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <button
                            onClick={() => editFaq(item)}
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() =>
                              setDeleteTarget({
                                type: "faq",
                                id: item.id,
                                label: item.question,
                              })
                            }
                            className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Delete confirmation dialog ─────────────────────────────────────── */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.type === "testimonial" ? "Testimonial" : "FAQ"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "
              <strong>{deleteTarget?.label}</strong>"? This will remove it from
              the public website immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (!deleteTarget) return;
                if (deleteTarget.type === "testimonial") {
                  deleteTestimonial(deleteTarget.id);
                } else {
                  deleteFaq(deleteTarget.id);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
