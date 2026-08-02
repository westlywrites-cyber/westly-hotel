import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, HelpCircle } from "lucide-react";
import { useDocument } from "@/hooks/useFirebase";

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  order?: number;
}

// Fallback FAQ data shown when Firestore is unavailable or empty
const FALLBACK_FAQS: FAQItem[] = [
  {
    id: "1",
    question: "What are your check-in and check-out times?",
    answer:
      "Standard check-in is from 2:00 PM and check-out is by 12:00 PM (noon). Early check-in and late check-out may be available upon request, subject to availability. Please contact our front desk in advance to arrange.",
  },
  {
    id: "2",
    question: "Do you offer airport transfer services?",
    answer:
      "Yes, we offer complimentary airport transfer for guests booking a minimum 3-night stay. For shorter stays, transfers can be arranged at a nominal fee. Please contact our concierge at least 24 hours before your arrival to schedule.",
  },
  {
    id: "3",
    question: "Is breakfast included in the room rate?",
    answer:
      "Breakfast inclusion depends on the room package you select. Our Deluxe and Suite packages include daily buffet breakfast for two at The Grand Restaurant. Please check your booking confirmation or contact us to add breakfast to your reservation.",
  },
  {
    id: "4",
    question: "What is your cancellation policy?",
    answer:
      "Cancellations made more than 72 hours before arrival are fully refunded. Cancellations within 72 hours forfeit one night's deposit. No-shows are charged the full reservation amount. Group bookings of 5 rooms or more have a separate policy — please ask at the time of booking.",
  },
  {
    id: "5",
    question: "Do you have facilities for guests with disabilities?",
    answer:
      "We are committed to accessibility. We have wheelchair-accessible rooms on the ground floor, ramp access to all public areas, accessible bathrooms with grab rails, and hearing loop systems in our conference rooms. Please inform us of any specific requirements when booking.",
  },
  {
    id: "6",
    question: "Is parking available at the hotel?",
    answer:
      "Yes, we offer secure on-site parking for hotel guests. Covered valet parking is available at a daily rate, and uncovered self-parking is complimentary for the first vehicle per room. Oversized vehicles require advance notice.",
  },
  {
    id: "7",
    question: "Can I arrange special decorations for a celebration?",
    answer:
      "Absolutely! We love helping guests celebrate special occasions. Please contact our concierge team at least 48 hours in advance to arrange room decorations, cakes, flower arrangements, or any other special touches. Additional charges may apply.",
  },
  {
    id: "8",
    question: "Do you allow pets?",
    answer:
      "We welcome well-behaved pets in our pet-friendly designated rooms. A refundable pet deposit is required at check-in. Pets must be kept on a leash in public areas and are not permitted in the restaurant or pool area. Please inform us when booking to ensure a pet-friendly room is available.",
  },
];

function FAQAccordion({ items }: { items: FAQItem[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {items.map((faq) => {
        const isOpen = openId === faq.id;
        return (
          <div
            key={faq.id}
            className="border border-border rounded-xl overflow-hidden bg-card shadow-sm"
          >
            <button
              className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left hover:bg-muted/50 transition-colors"
              onClick={() => setOpenId(isOpen ? null : faq.id)}
              aria-expanded={isOpen}
            >
              <span className="font-semibold text-foreground text-base leading-snug">
                {faq.question}
              </span>
              <motion.div
                animate={{ rotate: isOpen ? 180 : 0 }}
                transition={{ duration: 0.2 }}
                className="shrink-0 text-primary"
              >
                <ChevronDown className="w-5 h-5" />
              </motion.div>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <div className="px-6 pb-5 pt-1 text-muted-foreground leading-relaxed border-t border-border">
                    {faq.answer}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

export default function FAQPage() {
  const { data: faqDoc, loading } = useDocument("cms_content", "faqs");
  const { data: faqHeroDoc } = useDocument("cms_content", "faq_hero");
  const faqHero = (faqHeroDoc as any)?.data;
  const items: FAQItem[] =
    (faqDoc as any)?.data?.length > 0
      ? (faqDoc as any).data
      : FALLBACK_FAQS;

  return (
    <>
      {/* Hero */}
      <section className="relative bg-foreground text-background py-20 overflow-hidden">
        {faqHero?.image && (
          <img
            src={faqHero.image}
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
              <HelpCircle className="w-4 h-4" />
              {faqHero?.subtitle || "Help Centre"}
            </div>
            <h1 className="font-serif text-4xl md:text-5xl font-bold text-background mb-4">
              {faqHero?.title || "Frequently Asked Questions"}
            </h1>
            <p className="text-background/70 text-lg max-w-xl mx-auto">
              {faqHero?.description || "Everything you need to know about your stay at Westly Demo Hotel."}
            </p>
          </motion.div>
        </div>
      </section>

      {/* FAQ Body */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4 max-w-3xl">
          {loading ? (
            <div className="space-y-3">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="h-16 rounded-xl bg-muted animate-pulse"
                />
              ))}
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <FAQAccordion items={items} />
            </motion.div>
          )}

          {/* Still have questions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-16 rounded-2xl bg-primary/5 border border-primary/10 p-8 text-center"
          >
            <h3 className="font-serif text-2xl font-bold text-foreground mb-2">
              Still have questions?
            </h3>
            <p className="text-muted-foreground mb-6">
              Our team is available 24/7 to assist you with any enquiries.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href="/contact"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-full font-medium hover:opacity-90 transition-opacity"
              >
                Contact Us
              </a>
              <a
                href="tel:+15551234567"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-border rounded-full text-foreground font-medium hover:bg-muted transition-colors"
              >
                Call Front Desk
              </a>
            </div>
          </motion.div>
        </div>
      </section>
    </>
  );
}
