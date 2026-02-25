"use client";

import { motion } from "framer-motion";
import { Linkedin, Mail } from "lucide-react";
import WaitlistSection from "./WaitlistSection";
// Custom X (Twitter) icon since lucide doesn't have the new X logo
const XIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const Footer = () => {
  const protocolLinks = [
    { label: "Protocol Overview", href: "#" },
    { label: "GitHub", href: "https://github.com/alessandromaci/nextblock" },
  ];

  const resourceLinks = [
    { label: "FAQ", href: "#" },
  ];

  const legalLinks = [
    { label: "Terms of Service", href: "#" },
    { label: "Privacy Policy", href: "#" },
    { label: "Cookie Policy", href: "#" },
    { label: "Risk Disclaimer", href: "#" },
  ];

  const socialLinks = [
    { icon: XIcon, href: "https://x.com/NBlock2040", label: "X" },
    { icon: Linkedin, href: "https://www.linkedin.com/company/next-block", label: "LinkedIn" },
    { icon: Mail, href: "mailto:nextblock@financier.com", label: "Email" },
  ];

  const linkStyle = {
    fontSize: '14px',
    color: '#8A8A8A',
    transition: 'color 0.2s ease',
  };

  const headerStyle = {
    fontSize: '12px',
    fontWeight: 500,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    color: '#9A9A9A',
    marginBottom: '20px',
  };

  return (
    <div className="relative">
      {/* Waitlist Section */}
      <div className="relative z-10">
        <WaitlistSection />
      </div>
      
      {/* Footer content */}
      <motion.footer
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        style={{
          backgroundColor: '#FFFFFF',
        }}
      >
        {/* Decorative frieze at top */}
        <div className="relative w-full overflow-hidden">
          <video
            src={"/assets/footer-frieze.mp4"}
            autoPlay
            loop
            muted
            playsInline
            aria-hidden="true"
            style={{
              width: '100%',
              height: 'auto',
              display: 'block',
            }}
          />
        </div>
        {/* ROW 1 - Main footer content */}
        <div 
          className="mx-auto"
          style={{ 
            maxWidth: '1200px', 
            padding: '80px 40px 48px 40px',
          }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8">
            {/* Column 1 - Brand */}
            <div className="lg:col-span-1">
              <a href="#" className="inline-block mb-4">
                <img 
                  src={"/assets/logo-black.svg"} 
                  alt="NextBlock" 
                  style={{ height: '100px', width: 'auto' }}
                />
              </a>
              <p 
                className="mb-6"
                style={{ 
                  fontSize: '14px', 
                  color: '#8A8A8A',
                  lineHeight: 1.6,
                }}
              >
                The Universal Marketplace for Insurance-Linked Assets
              </p>
              <div className="flex items-center gap-4">
                {socialLinks.map((social) => (
                  <a
                    key={social.label}
                    href={social.href}
                    aria-label={social.label}
                    className="transition-colors duration-200"
                    style={{ color: '#8A8A8A' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = '#1B3A6B'}
                    onMouseLeave={(e) => e.currentTarget.style.color = '#8A8A8A'}
                  >
                    <social.icon size={20} />
                  </a>
                ))}
              </div>
            </div>

            {/* Column 2 - Protocol */}
            <div>
              <h4 style={headerStyle}>Protocol</h4>
              <ul className="space-y-3">
                {protocolLinks.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      style={linkStyle}
                      className="hover:text-foreground"
                      onMouseEnter={(e) => e.currentTarget.style.color = '#0F1218'}
                      onMouseLeave={(e) => e.currentTarget.style.color = '#8A8A8A'}
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Column 3 - Resources */}
            <div>
              <h4 style={headerStyle}>Resources</h4>
              <ul className="space-y-3">
                {resourceLinks.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      style={linkStyle}
                      className="hover:text-foreground"
                      onMouseEnter={(e) => e.currentTarget.style.color = '#0F1218'}
                      onMouseLeave={(e) => e.currentTarget.style.color = '#8A8A8A'}
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Column 4 - Legal */}
            <div>
              <h4 style={headerStyle}>Legal</h4>
              <ul className="space-y-3">
                {legalLinks.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      style={linkStyle}
                      className="hover:text-foreground"
                      onMouseEnter={(e) => e.currentTarget.style.color = '#0F1218'}
                      onMouseLeave={(e) => e.currentTarget.style.color = '#8A8A8A'}
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* ROW 2 - Disclaimer */}
        <div 
          className="mx-auto text-center"
          style={{ 
            maxWidth: '800px', 
            padding: '0 40px 32px 40px',
          }}
        >
          <p
            style={{
              fontSize: '12px',
              color: '#9A9A9A',
              lineHeight: 1.7,
            }}
          >
            NextBlock is an open-source protocol. The information provided on this website does not constitute investment advice, financial advice, trading advice, or any other sort of advice. You should not treat any of the content as such. Insurance-linked assets involve significant risk. Past performance is not indicative of future results.
          </p>
        </div>

        {/* ROW 3 - Bottom bar */}
        <div
          style={{
            borderTop: '1px solid rgba(0,0,0,0.06)',
          }}
        >
          <div 
            className="mx-auto flex flex-col md:flex-row items-center justify-between gap-4"
            style={{ 
              maxWidth: '1200px', 
              padding: '24px 40px',
            }}
          >
            <p
              style={{
                fontSize: '13px',
                color: '#9A9A9A',
              }}
            >
              © 2025 NextBlock. All rights reserved.
            </p>
            <p
              style={{
                fontSize: '13px',
                color: '#9A9A9A',
              }}
            >
              Built on Base · Secured by Ethereum
            </p>
          </div>
        </div>
      </motion.footer>
    </div>
  );
};

export default Footer;
