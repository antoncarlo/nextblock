"use client";
import { motion } from "framer-motion";
const HeroSection = () => {
  return <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background Video */}
      <div className="absolute inset-0 z-0">
        <video autoPlay muted loop playsInline className="w-full h-full object-cover">
          <source src="/videos/hero-background.mp4" type="video/mp4" />
        </video>
      </div>

      {/* Content */}
      <div className="relative z-10 w-full max-w-7xl px-6 md:px-12 lg:px-24 text-left" style={{
      paddingTop: '160px',
      paddingBottom: '120px'
    }}>
        <motion.div initial={{
        opacity: 0,
        y: 40
      }} animate={{
        opacity: 1,
        y: 0
      }} transition={{
        duration: 0.8,
        delay: 0.2
       }} className="w-full">
          <div className="flex flex-col">
            <h1 className="text-4xl md:text-5xl lg:text-6xl max-w-4xl font-serif" style={{
              fontFamily: "'Playfair Display', serif",
              fontWeight: 500,
              lineHeight: 1.1,
              letterSpacing: '-0.03em',
              color: '#0F1218'
            }}>Insurance is the world's largest real-world asset class and the only one without blockchain infrastructure.
            </h1>
            
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="text-right w-full max-w-4xl font-serif"
              style={{
                fontFamily: "'Playfair Display', serif",
                marginTop: '16px',
                fontSize: 'clamp(2rem, 5vw, 3.75rem)',
                fontWeight: 500,
                fontStyle: 'italic',
                color: '#0F1218',
                letterSpacing: '-0.03em',
                lineHeight: 1.1
              }}
            >
              Until Now
            </motion.p>
          </div>
          
          <motion.p initial={{
          opacity: 0,
          y: 20
        }} animate={{
          opacity: 1,
          y: 0
        }} transition={{
          duration: 0.8,
          delay: 0.4
        }} style={{
          marginTop: '24px',
          maxWidth: '560px',
          fontSize: '17px',
          lineHeight: 1.7,
          color: '#4A4A4A'
        }}>
        </motion.p>

          <motion.div initial={{
          opacity: 0,
          y: 20
        }} animate={{
          opacity: 1,
          y: 0
        }} transition={{
          duration: 0.8,
          delay: 0.6
        }} className="flex flex-col sm:flex-row" style={{
          marginTop: '32px',
          gap: '16px'
        }}>
            <a href="#waitlist" className="inline-flex items-center justify-center transition-all hover:opacity-90" style={{
            backgroundColor: '#1B3A6B',
            color: '#fff',
            padding: '14px 32px',
            borderRadius: '6px',
            fontWeight: 500,
            fontSize: '15px'
          }}>
              Request Early Access
            </a>
          </motion.div>
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div initial={{
      opacity: 0
    }} animate={{
      opacity: 1
    }} transition={{
      delay: 1.2
    }} className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
        <motion.div animate={{
        y: [0, 10, 0]
      }} transition={{
        repeat: Infinity,
        duration: 2
      }} className="w-6 h-10 rounded-full flex items-start justify-center p-2" style={{
        border: '2px solid rgba(0,0,0,0.2)'
      }}>
          <div className="w-1 h-2 rounded-full" style={{
          backgroundColor: '#1B3A6B'
        }} />
        </motion.div>
      </motion.div>
    </section>;
};
export default HeroSection;