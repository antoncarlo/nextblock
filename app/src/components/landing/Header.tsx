"use client";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
const logoBlack = "/assets/logo-black.svg";

const Header = () => {
  const [isScrolled, setIsScrolled] = useState(false);

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
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{
        backgroundColor: 'transparent',
        padding: '20px 40px',
      }}
    >
      <div 
        className="mx-auto flex items-center justify-center relative"
        style={{
          maxWidth: '1280px',
        }}
      >
        {/* Left: Logo - Outside container, hidden on scroll */}
        <motion.a 
          href="#" 
          className="flex items-center absolute left-0"
          initial={{ opacity: 1 }}
          animate={{ 
            opacity: isScrolled ? 0 : 1,
            pointerEvents: isScrolled ? 'none' : 'auto',
          }}
          transition={{ duration: 0.3 }}
        >
          <img 
            src={logoBlack} 
            alt="NextBlock" 
            style={{ height: '140px', width: 'auto' }}
          />
        </motion.a>
        
        {/* Center: Navigation container */}
        <div
          className="flex items-center gap-6 md:gap-10"
          style={{
            padding: '10px 20px',
            backgroundColor: isScrolled ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.85)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderRadius: '50px',
            border: '1px solid rgba(0, 0, 0, 0.08)',
            boxShadow: isScrolled ? '0 4px 24px rgba(0, 0, 0, 0.08)' : '0 2px 12px rgba(0, 0, 0, 0.04)',
          }}
        >
          <a 
            href="#about" 
            className="transition-colors duration-200"
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: '13px',
              fontWeight: 400,
              color: '#4A4A4A',
              letterSpacing: '0.01em',
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#0F1218'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#4A4A4A'}
          >
            Market
          </a>
          <a 
            href="#how-it-works" 
            className="transition-colors duration-200"
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: '13px',
              fontWeight: 400,
              color: '#4A4A4A',
              letterSpacing: '0.01em',
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#0F1218'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#4A4A4A'}
          >
            How It Works
          </a>
          <a 
            href="#protocol-stack" 
            className="transition-colors duration-200"
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: '13px',
              fontWeight: 400,
              color: '#4A4A4A',
              letterSpacing: '0.01em',
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#0F1218'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#4A4A4A'}
          >
            Protocol
          </a>
          <a 
            href="/app"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-all duration-200"
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: '13px',
              fontWeight: 500,
              color: '#1B3A6B',
              letterSpacing: '0.01em',
              backgroundColor: 'transparent',
              padding: '8px 20px',
              borderRadius: '50px',
              border: '1.5px solid #1B3A6B',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#1B3A6B';
              e.currentTarget.style.color = '#fff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#1B3A6B';
            }}
          >
            Launch App
          </a>
          <a 
            href="#waitlist" 
            className="transition-all duration-200"
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: '13px',
              fontWeight: 500,
              color: '#fff',
              letterSpacing: '0.01em',
              backgroundColor: '#1B3A6B',
              padding: '8px 20px',
              borderRadius: '50px',
            }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
          >
            Request Early Access
          </a>
        </div>
      </div>
    </motion.header>
  );
};

export default Header;
