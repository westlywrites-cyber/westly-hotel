import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Star, Quote, Send, CheckCircle2, MessageSquareText, UserCircle2 } from "lucide-react";
import { useDocument, useCollection } from "@/hooks/useFirebase";
import { addDoc, collection, serverTimestamp, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { notifyNewReview } from "@/lib/notifications";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

interface Testimonial {
  id: string;
  author: string;
  role?: string;
  text: string;
  rating: number;
}

interface GuestReview {
  id: string;
  name: string;
  text: string;
  rating: number | null;
  status: "pending" | "approved";
  createdAt?: { toDate?: () => Date } | null;
}

const MAX_REVIEW_LENGTH = 1000;
const MAX_NAME_LENGTH = 80;

// Fallback testimonials shown when Firestore is unavailable or empty
const FALLBACK_TESTIMONIALS: Testimonial[] = [
  {
    id: "1",
    author: "Sarah & James Mitchell",
    role: "Anniversary Celebration",
    text: "An absolutely extraordinary stay. The staff anticipated our every need before we even asked — from the rose petals on the bed to the champagne chilling upon arrival. Westly has ruined every other hotel for us.",
    rating: 5,
  },
  {
    id: "2",
    author: "Dr. Emmanuel Okafor",
    role: "Business Traveller",
    text: "I've stayed in luxury hotels across five continents. Westly stands out for its seamless blend of warmth and professionalism. The executive suite was immaculate, the Wi-Fi flawless, and the restaurant extraordinary.",
    rating: 5,
  },
  {
    id: "3",
    author: "The Larsson Family",
    role: "Family Holiday",
    text: "Travelling with young children can be stressful — Westly made it effortless. The kids' menu was brilliant, the pool was safe and beautifully maintained, and the concierge organised a private tour of the city for us. Five-star in every sense.",
    rating: 5,
  },
  {
    id: "4",
    author: "Marina Volkov",
    role: "Solo Traveller",
    text: "As a solo female traveller, safety and comfort are paramount. Westly delivered both with grace. The spa is a sanctuary, the rooms are private and secure, and the staff made me feel genuinely welcome throughout my week-long stay.",
    rating: 5,
  },
  {
    id: "5",
    author: "Mr & Mrs Chen Wei",
    role: "Honeymoon",
    text: "We chose Westly for our honeymoon after seeing it recommended online. The reality exceeded every expectation. The bridal suite views were breathtaking, the dinner on the terrace was the most romantic evening of our lives.",
    rating: 5,
  },
  {
    id: "6",
    author: "Prof. Adaeze Nwosu",
    role: "Conference Guest",
    text: "Attended a three-day academic conference here. The meeting facilities were world-class, the catering exceptional, and the rooms gave me genuine rest after long sessions. A rare hotel that balances work and comfort perfectly.",
    rating: 4,
  },
];

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`w-4 h-4 ${
            star <= rating
              ? "fill-secondary text-secondary"
              : "fill-muted text-muted"
          }`}
        />
      ))}
    </div>
  );
}

// Interactive star picker for the review form. Rating is optional — the
// person can submit without picking a star at all.
function StarRatingInput({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(value === star ? null : star)}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(null)}
          className="p-0.5 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Rate ${star} star${star > 1 ? "s" : ""}`}
        >
          <Star
            className={`w-6 h-6 transition-colors ${
              star <= shown ? "fill-secondary text-secondary" : "fill-muted text-muted"
            }`}
          />
        </button>
      ))}
      {value && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="ml-1 text-xs text-muted-foreground hover:text-foreground underline"
        >
          Clear
        </button>
      )}
    </div>
  );
}

function formatDate(ts: GuestReview["createdAt"]) {
  const d = ts?.toDate?.();
  if (!d) return "";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function TestimonialsPage() {
  const { toast } = useToast();
  const { data: testimonialsDoc, loading } = useDocument(
    "cms_content",
    "testimonials"
  );
  const { data: testimonialsHeroDoc } = useDocument("cms_content", "testimonials_hero");
  const testimonialsHero = (testimonialsHeroDoc as any)?.data;
  const items: Testimonial[] =
    (testimonialsDoc as any)?.data?.length > 0
      ? (testimonialsDoc as any).data
      : FALLBACK_TESTIMONIALS;

  // Guest-submitted reviews — only approved ones are ever fetched here.
  // (Firestore's rules only allow this query to succeed because it's
  // constrained to status == 'approved'; an unfiltered query would be denied.)
  const approvedConstraint = useMemo(() => [where("status", "==", "approved")], []);
  const { data: guestReviews, loading: reviewsLoading } = useCollection<GuestReview>(
    "reviews",
    approvedConstraint
  );

  const sortedReviews = useMemo(
    () =>
      [...guestReviews].sort((a, b) => {
        const da = a.createdAt?.toDate?.()?.getTime() ?? 0;
        const db_ = b.createdAt?.toDate?.()?.getTime() ?? 0;
        return db_ - da;
      }),
    [guestReviews]
  );

  const [form, setForm] = useState({ name: "", text: "", rating: null as number | null });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function validate(): string | null {
    const name = form.name.trim();
    const text = form.text.trim();
    if (!name) return "Please enter your name.";
    if (name.length > MAX_NAME_LENGTH) return `Name must be ${MAX_NAME_LENGTH} characters or fewer.`;
    if (!text) return "Please write a review before submitting.";
    if (text.length > MAX_REVIEW_LENGTH) return `Review must be ${MAX_REVIEW_LENGTH} characters or fewer.`;
    if (form.rating !== null && (form.rating < 1 || form.rating > 5)) return "Rating must be between 1 and 5 stars.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      await addDoc(collection(db, "reviews"), {
        name: form.name.trim(),
        text: form.text.trim(),
        rating: form.rating,
        status: "pending",
        createdAt: serverTimestamp(),
      });
      notifyNewReview(form.name.trim(), form.rating).catch(() => {});
      setSubmitted(true);
      setForm({ name: "", text: "", rating: null });
      toast({
        title: "Review Submitted",
        description: "Thanks for sharing your experience! It'll appear here once our team reviews it.",
      });
    } catch (err) {
      toast({
        title: "Couldn't submit review",
        description: "Please check your connection and try again.",
        variant: "destructive",
      });
    }
    setSubmitting(false);
  }

  return (
    <>
      {/* Hero */}
      <section className="relative bg-foreground text-background py-20 overflow-hidden">
        {testimonialsHero?.image && (
          <img
            src={testimonialsHero.image}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-10"
          />
        )}
        <div className="relative container mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 bg-secondary/20 text-secondary border border-secondary/30 rounded-full px-4 py-1.5 text-sm font-medium mb-5">
              <Star className="w-4 h-4" />
              {testimonialsHero?.subtitle || "Guest Stories"}
            </div>
            <h1 className="font-serif text-4xl md:text-5xl font-bold text-background mb-4">
              {testimonialsHero?.title || "What Our Guests Say"}
            </h1>
            <p className="text-background/70 text-lg max-w-xl mx-auto">
              {testimonialsHero?.description || "Stories and experiences shared by guests who have called Westly home."}
            </p>
          </motion.div>
        </div>
      </section>

      {/* Curated Testimonials Grid */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="h-60 rounded-2xl bg-muted animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {items.map((item, i) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: i * 0.07 }}
                  className="bg-card border border-border rounded-2xl p-7 flex flex-col gap-4 shadow-sm hover:shadow-md transition-shadow"
                >
                  {/* Quote icon */}
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Quote className="w-5 h-5 text-primary" />
                  </div>

                  {/* Stars */}
                  <StarRating rating={item.rating} />

                  {/* Review text */}
                  <p className="text-foreground/80 leading-relaxed text-sm flex-1 italic">
                    "{item.text}"
                  </p>

                  {/* Author */}
                  <div className="border-t border-border pt-4">
                    <p className="font-semibold text-foreground text-sm">
                      {item.author}
                    </p>
                    {item.role && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {item.role}
                      </p>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Public Guest Reviews: submission + community reviews ─────────── */}
      <section className="py-20 bg-muted/30 border-y border-border">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-xl mx-auto mb-12">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-1.5 text-sm font-medium mb-4">
              <MessageSquareText className="w-4 h-4" />
              Community Reviews
            </div>
            <h2 className="font-serif text-3xl font-bold mb-3">Share Your Experience</h2>
            <p className="text-muted-foreground">
              Stayed with us? Tell future guests about it — no account needed.
              Every review is checked by our team before it appears here.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 max-w-6xl mx-auto">
            {/* Submission form */}
            <div className="lg:col-span-2">
              {submitted ? (
                <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-4 sticky top-24">
                  <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-7 h-7 text-green-600" />
                  </div>
                  <h3 className="font-serif text-xl font-bold">Thank You!</h3>
                  <p className="text-muted-foreground text-sm">
                    Your review has been submitted and is awaiting approval. It'll appear
                    on this page once our team reviews it.
                  </p>
                  <Button variant="outline" onClick={() => setSubmitted(false)}>
                    Leave Another Review
                  </Button>
                </div>
              ) : (
                <form
                  onSubmit={handleSubmit}
                  className="bg-card border border-border rounded-2xl p-6 space-y-4 sticky top-24"
                >
                  <h3 className="font-semibold text-base">Leave a Review</h3>

                  <div className="space-y-1.5">
                    <Label>Your Name *</Label>
                    <Input
                      value={form.name}
                      maxLength={MAX_NAME_LENGTH}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Jane Doe"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Rating</Label>
                    <StarRatingInput
                      value={form.rating}
                      onChange={(rating) => setForm({ ...form, rating })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Your Review *</Label>
                    <Textarea
                      value={form.text}
                      maxLength={MAX_REVIEW_LENGTH}
                      onChange={(e) => setForm({ ...form, text: e.target.value })}
                      placeholder="Tell us about your stay…"
                      className="min-h-[120px]"
                    />
                    <p className="text-xs text-muted-foreground text-right">
                      {form.text.length}/{MAX_REVIEW_LENGTH}
                    </p>
                  </div>

                  {formError && <p className="text-sm text-destructive">{formError}</p>}

                  <Button type="submit" disabled={submitting} className="w-full gap-2">
                    <Send className="w-4 h-4" />
                    {submitting ? "Submitting…" : "Submit Review"}
                  </Button>
                </form>
              )}
            </div>

            {/* Guest reviews list */}
            <div className="lg:col-span-3 space-y-4">
              {reviewsLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-36 rounded-2xl bg-muted animate-pulse" />
                  ))}
                </div>
              ) : sortedReviews.length === 0 ? (
                <div className="bg-card border border-border rounded-2xl p-10 text-center text-muted-foreground text-sm">
                  No guest reviews yet — be the first to share your experience!
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {sortedReviews.map((review, i) => (
                    <motion.div
                      key={review.id}
                      initial={{ opacity: 0, y: 16 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.4, delay: (i % 6) * 0.05 }}
                      className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-3 shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <UserCircle2 className="w-5 h-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-foreground truncate">{review.name}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(review.createdAt)}</p>
                        </div>
                      </div>
                      {review.rating ? <StarRating rating={review.rating} /> : null}
                      <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
                        {review.text}
                      </p>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center"
          >
            <p className="text-muted-foreground mb-5 text-lg">
              Ready to create your own Westly story?
            </p>
            <a
              href="/booking"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-primary text-primary-foreground rounded-full font-semibold hover:opacity-90 transition-opacity text-base"
            >
              Book Your Stay
            </a>
          </motion.div>
        </div>
      </section>
    </>
  );
}
