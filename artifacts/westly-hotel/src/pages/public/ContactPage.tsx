import { useState } from "react";
import { useDocument } from "@/hooks/useFirebase";
import { submitPublicMessage } from "@/lib/messages";
import { notifyContactMessage } from "@/lib/notifications";
import PageHeroBanner from "@/components/public/PageHeroBanner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Phone, Mail, MapPin, Clock, Loader2, CheckCircle } from "lucide-react";

export default function ContactPage() {
  const { toast } = useToast();
  const { data: contactDoc } = useDocument("cms_content", "contact");
  const contact = (contactDoc as any)?.data;

  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "", message: "" });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Stored in Supabase (see src/lib/messages.ts + supabase/schema.sql), not
      // Firebase. If Supabase hasn't been connected yet, this queues the
      // message locally and still resolves successfully — the guest always
      // sees a confirmation, and nothing is lost.
      await submitPublicMessage(form);
      // Still uses the app's existing Firebase-based notification/bell system
      // to alert front-desk staff — that's a shared, app-wide feature, not
      // where the message content itself is stored.
      notifyContactMessage(form.name, form.email, form.subject, form.message).catch(() => {});
      setSuccess(true);
      toast({ title: "Message Sent!", description: "We'll get back to you within 24 hours." });
    } catch (err) {
      toast({ title: "Failed to send", description: "Please try again or call us directly.", variant: "destructive" });
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <PageHeroBanner docId="contact_hero" fallbackTitle="Contact Us" fallbackSubtitle="Get in Touch" heightClass="h-64" />

      <div className="container mx-auto px-4 py-16 max-w-5xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Info */}
          <div className="space-y-8">
            <div>
              <h2 className="font-serif text-2xl font-bold mb-6">Get in Touch</h2>
              <p className="text-muted-foreground">Our dedicated team is available to assist you 24/7. Whether you have a question, need assistance with a booking, or want to learn more about our services.</p>
            </div>
            <div className="space-y-5">
              {[
                { icon: Phone, label: "Phone", value: contact?.phone || "+1 (555) 123-4567" },
                { icon: Mail, label: "Email", value: contact?.email || "info@westlydemo.com" },
                { icon: MapPin, label: "Address", value: contact?.address || "123 Luxury Avenue, Downtown District" },
              ].map(item => (
                <div key={item.label} className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
                    <item.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">{item.label}</p>
                    <p className="font-medium mt-0.5">{item.value}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-muted/50 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3"><Clock className="w-4 h-4 text-primary" /><p className="font-semibold text-sm">Check-In & Check-Out</p></div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-muted-foreground">Check-In</p><p className="font-medium">{contact?.checkInTime || "2:00 PM"}</p></div>
                <div><p className="text-muted-foreground">Check-Out</p><p className="font-medium">{contact?.checkOutTime || "11:00 AM"}</p></div>
              </div>
            </div>
          </div>

          {/* Form */}
          <div>
            {success ? (
              <div className="text-center py-16 space-y-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="font-serif text-2xl font-bold">Message Sent!</h3>
                <p className="text-muted-foreground">Thank you for reaching out. We'll respond within 24 hours.</p>
                <Button variant="outline" onClick={() => { setSuccess(false); setForm({ name: "", email: "", phone: "", subject: "", message: "" }); }}>
                  Send Another Message
                </Button>
              </div>
            ) : (
              <Card>
                <CardContent className="p-6">
                  <h3 className="font-semibold mb-4">Send us a Message</h3>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Full Name *</Label>
                        <Input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="John Doe" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Phone</Label>
                        <Input type="tel" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="+1 555…" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Email *</Label>
                      <Input required type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="your@email.com" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Subject *</Label>
                      <Input required value={form.subject} onChange={e => setForm({...form, subject: e.target.value})} placeholder="Room inquiry, special request…" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Message *</Label>
                      <textarea
                        required
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[120px] resize-none"
                        value={form.message}
                        onChange={e => setForm({...form, message: e.target.value})}
                        placeholder="How can we help you?"
                      />
                    </div>
                    <Button type="submit" disabled={loading} className="w-full gap-2">
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      {loading ? "Sending…" : "Send Message"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
