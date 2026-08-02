import { Link, useLocation } from "wouter";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X, Phone, Mail, Facebook, Instagram, Twitter } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/rooms", label: "Rooms" },
  { href: "/facilities", label: "Facilities" },
  { href: "/venues", label: "Venues" },
  { href: "/restaurant", label: "Restaurant" },
  { href: "/gallery", label: "Gallery" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

const FOOTER_INFO_LINKS = [
  { href: "/faq", label: "FAQ" },
  { href: "/testimonials", label: "Testimonials" },
  { href: "/about", label: "About Us" },
  { href: "/contact", label: "Contact" },
];

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [location] = useLocation();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full bg-background/95 backdrop-blur-sm border-b border-border shadow-sm">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5 group shrink-0">
              <img
                src="/brand/logo-mark.png"
                srcSet="/brand/logo-mark.png 1x, /brand/logo-mark@2x.png 2x"
                alt="Westly Hotel"
                className="w-10 h-10 object-contain shrink-0"
              />
              <div className="leading-tight">
                <div className="font-serif text-base font-bold text-foreground">Westly</div>
                <div className="text-[10px] text-muted-foreground tracking-widest uppercase -mt-0.5">Demo Hotel</div>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-6" role="navigation" aria-label="Main navigation">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "text-sm font-medium transition-colors hover:text-primary",
                    location === link.href ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            {/* Book Now CTA */}
            <div className="hidden md:flex items-center gap-3">
              <Link href="/booking">
                <Button size="sm" className="rounded-full px-6">Book Now</Button>
              </Link>
            </div>

            {/* Mobile menu button */}
            <button
              className="md:hidden p-2 rounded-md text-muted-foreground hover:text-foreground"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {menuOpen && (
          <div className="md:hidden bg-card border-t border-border p-4 space-y-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className={cn(
                  "block px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                  location === link.href
                    ? "bg-primary/10 text-primary"
                    : "text-foreground hover:bg-muted"
                )}
              >
                {link.label}
              </Link>
            ))}
            {/* Extra links in mobile menu */}
            <div className="border-t border-border pt-2 mt-2 space-y-1">
              <Link
                href="/faq"
                onClick={() => setMenuOpen(false)}
                className="block px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                FAQ
              </Link>
              <Link
                href="/testimonials"
                onClick={() => setMenuOpen(false)}
                className="block px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                Guest Reviews
              </Link>
            </div>
            <div className="pt-2 border-t border-border">
              <Link href="/booking" onClick={() => setMenuOpen(false)}>
                <Button className="w-full rounded-full">Book Now</Button>
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* Main content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="bg-foreground text-background/80 pt-16 pb-6">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
            {/* Brand */}
            <div className="md:col-span-1 space-y-4">
              <div className="flex items-center gap-2.5">
                <img
                  src="/brand/logo-mark.png"
                  srcSet="/brand/logo-mark.png 1x, /brand/logo-mark@2x.png 2x"
                  alt="Westly Hotel"
                  className="w-10 h-10 object-contain shrink-0"
                />
                <span className="font-serif text-xl font-bold text-background">Westly Demo Hotel</span>
              </div>
              <p className="text-sm text-background/60 leading-relaxed">
                A sanctuary of elegance and comfort, crafting unforgettable experiences since 1985.
              </p>
              <div className="flex gap-3">
                {[Facebook, Instagram, Twitter].map((Icon, i) => (
                  <a
                    key={i}
                    href="#"
                    aria-label="Social media"
                    className="w-8 h-8 rounded-full bg-background/10 flex items-center justify-center hover:bg-secondary/20 transition-colors"
                  >
                    <Icon className="w-4 h-4" />
                  </a>
                ))}
              </div>
            </div>

            {/* Explore */}
            <div>
              <h4 className="font-semibold text-background mb-4 text-sm uppercase tracking-wider">Explore</h4>
              <ul className="space-y-2">
                {NAV_LINKS.slice(0, 6).map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-background/60 hover:text-background transition-colors">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Information */}
            <div>
              <h4 className="font-semibold text-background mb-4 text-sm uppercase tracking-wider">Information</h4>
              <ul className="space-y-2">
                {FOOTER_INFO_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-background/60 hover:text-background transition-colors">
                      {link.label}
                    </Link>
                  </li>
                ))}
                <li>
                  <span className="text-sm text-background/60">Privacy Policy</span>
                </li>
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="font-semibold text-background mb-4 text-sm uppercase tracking-wider">Contact</h4>
              <ul className="space-y-3">
                <li className="flex items-start gap-2 text-sm text-background/60">
                  <Phone className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>+1 (555) 123-4567</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-background/60">
                  <Mail className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>info@westlydemo.com</span>
                </li>
              </ul>
              <div className="mt-4">
                <Link href="/booking">
                  <Button size="sm" variant="secondary" className="rounded-full text-foreground">
                    Reserve Now
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          <div className="border-t border-background/10 pt-6 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-xs text-background/40">
              © {new Date().getFullYear()} Westly Demo Hotel. All rights reserved.
            </p>
            <div className="flex gap-4 text-xs text-background/40">
              <Link href="/faq" className="hover:text-background/70">FAQ</Link>
              <Link href="/testimonials" className="hover:text-background/70">Guest Reviews</Link>
              <Link href="/contact" className="hover:text-background/70">Contact</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
