"use client";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
const logoBlack = "/assets/logo-black.svg";

const NAV_LINKS: { href: string; label: string }[] = [
  { href: "#about", label: "Market" },
  { href: "#how-it-works", label: "How It Works" },
  { href: "#protocol-stack", label: "Protocol" },
];

const linkStyle: React.CSSProperties = {
  fontFamily: "'Playfair Display', Georgia, serif",
  fontSize: "13px",
  fontWeight: 400,
  color: "#4A4A4A",
  letterSpacing: "0.01em",
};

const Header = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300 px-4 py-3 md:px-10 md:py-5"
      style={{ backgroundColor: "transparent" }}
    >
      <div
        className="mx-auto flex items-center justify-between md:justify-center relative"
        style={{ maxWidth: "1280px" }}
      >
        {/* Left: Logo — hidden on scroll (desktop); compact on mobile */}
        <motion.a
          href="#"
          className="flex items-center md:absolute md:left-0"
          initial={{ opacity: 1 }}
          animate={{
            opacity: isScrolled ? 0 : 1,
            pointerEvents: isScrolled ? "none" : "auto",
          }}
          transition={{ duration: 0.3 }}
        >
          <img src={logoBlack} alt="NextBlock" className="h-20 md:h-[140px] w-auto" />
        </motion.a>

        {/* Center: desktop pill navigation */}
        <div
          className="hidden md:flex items-center gap-6 lg:gap-10"
          style={{
            padding: "10px 20px",
            backgroundColor: isScrolled ? "rgba(255, 255, 255, 0.95)" : "rgba(255, 255, 255, 0.85)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            borderRadius: "50px",
            border: "1px solid rgba(0, 0, 0, 0.08)",
            boxShadow: isScrolled ? "0 4px 24px rgba(0, 0, 0, 0.08)" : "0 2px 12px rgba(0, 0, 0, 0.04)",
          }}
        >
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="transition-colors duration-200"
              style={linkStyle}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#0F1218")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#4A4A4A")}
            >
              {l.label}
            </a>
          ))}
          <a
            href="/app"
            className="transition-all duration-200"
            style={{
              ...linkStyle,
              fontWeight: 500,
              color: "#1B3A6B",
              backgroundColor: "transparent",
              padding: "8px 20px",
              borderRadius: "50px",
              border: "1.5px solid #1B3A6B",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#1B3A6B";
              e.currentTarget.style.color = "#fff";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "#1B3A6B";
            }}
          >
            Launch App
          </a>
          <a
            href="#waitlist"
            className="transition-all duration-200"
            style={{
              ...linkStyle,
              fontWeight: 500,
              color: "#fff",
              backgroundColor: "#1B3A6B",
              padding: "8px 20px",
              borderRadius: "50px",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            Request Early Access
          </a>
        </div>

        {/* Mobile: hamburger toggle */}
        <button
          type="button"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          className="md:hidden inline-flex items-center justify-center"
          style={{
            width: "44px",
            height: "44px",
            borderRadius: "50%",
            backgroundColor: "rgba(255,255,255,0.92)",
            border: "1px solid rgba(0,0,0,0.08)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
          }}
        >
          {/* Hamburger / close icon (pure CSS, no icon dep) */}
          <span aria-hidden="true" style={{ position: "relative", width: "18px", height: "12px", display: "block" }}>
            <span style={{ position: "absolute", left: 0, right: 0, top: menuOpen ? "5px" : 0, height: "2px", backgroundColor: "#0F1218", borderRadius: "2px", transform: menuOpen ? "rotate(45deg)" : "none", transition: "all 0.25s" }} />
            <span style={{ position: "absolute", left: 0, right: 0, top: "5px", height: "2px", backgroundColor: "#0F1218", borderRadius: "2px", opacity: menuOpen ? 0 : 1, transition: "opacity 0.2s" }} />
            <span style={{ position: "absolute", left: 0, right: 0, top: menuOpen ? "5px" : "10px", height: "2px", backgroundColor: "#0F1218", borderRadius: "2px", transform: menuOpen ? "rotate(-45deg)" : "none", transition: "all 0.25s" }} />
          </span>
        </button>
      </div>

      {/* Mobile: dropdown panel */}
      <AnimatePresence>
        {menuOpen && (
          <motion.nav
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="md:hidden"
            style={{
              marginTop: "10px",
              backgroundColor: "rgba(255,255,255,0.97)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1px solid rgba(0,0,0,0.08)",
              borderRadius: "16px",
              boxShadow: "0 12px 40px rgba(0,0,0,0.10)",
              padding: "8px",
              display: "flex",
              flexDirection: "column",
              gap: "2px",
            }}
          >
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setMenuOpen(false)}
                style={{ ...linkStyle, fontSize: "15px", padding: "12px 14px", borderRadius: "10px" }}
              >
                {l.label}
              </a>
            ))}
            <a
              href="/app"
              onClick={() => setMenuOpen(false)}
              className="inline-flex items-center justify-center"
              style={{ ...linkStyle, fontSize: "15px", fontWeight: 500, color: "#1B3A6B", padding: "12px 14px", borderRadius: "10px", border: "1.5px solid #1B3A6B", textAlign: "center", marginTop: "4px" }}
            >
              Launch App
            </a>
            <a
              href="#waitlist"
              onClick={() => setMenuOpen(false)}
              className="inline-flex items-center justify-center"
              style={{ ...linkStyle, fontSize: "15px", fontWeight: 500, color: "#fff", backgroundColor: "#1B3A6B", padding: "12px 14px", borderRadius: "10px", textAlign: "center", marginTop: "4px" }}
            >
              Request Early Access
            </a>
          </motion.nav>
        )}
      </AnimatePresence>
    </motion.header>
  );
};

export default Header;
