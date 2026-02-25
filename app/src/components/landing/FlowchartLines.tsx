"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform, useInView } from "framer-motion";

// Elegant curved connection lines using SVG bezier paths
const FlowchartLines = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const updateDimensions = () => {
      if (typeof window !== 'undefined') {
        setDimensions({
          width: window.innerWidth,
          height: document.documentElement.scrollHeight,
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    
    // Update after content loads
    const timer = setTimeout(updateDimensions, 1000);
    
    return () => {
      window.removeEventListener('resize', updateDimensions);
      clearTimeout(timer);
    };
  }, []);

  if (dimensions.width < 768) return null; // Hide on mobile

  const lineColor = "rgba(27, 58, 107, 0.18)";
  const accentColor = "rgba(74, 108, 247, 0.25)";

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 0 }}
    >
      {/* Dot grid pattern background */}
      <svg 
        className="absolute inset-0 w-full h-full"
        style={{ opacity: 0.6 }}
      >
        <defs>
          <pattern 
            id="dotGrid" 
            width="40" 
            height="40" 
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r="0.8" fill="rgba(27, 58, 107, 0.12)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dotGrid)" />
      </svg>

      {/* Flowing curved lines */}
      <svg 
        className="absolute inset-0 w-full h-full"
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        preserveAspectRatio="none"
      >
        <defs>
          {/* Gradient for main curves */}
          <linearGradient id="curveGradient1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(27, 58, 107, 0.22)" />
            <stop offset="50%" stopColor="rgba(74, 108, 247, 0.18)" />
            <stop offset="100%" stopColor="rgba(27, 58, 107, 0.1)" />
          </linearGradient>
          
          <linearGradient id="curveGradient2" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="transparent" />
            <stop offset="20%" stopColor="rgba(27, 58, 107, 0.2)" />
            <stop offset="80%" stopColor="rgba(27, 58, 107, 0.2)" />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>

          <linearGradient id="accentGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="transparent" />
            <stop offset="30%" stopColor="rgba(74, 108, 247, 0.25)" />
            <stop offset="70%" stopColor="rgba(74, 108, 247, 0.25)" />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
        </defs>

        {/* Main flowing S-curve from top-left area */}
        <motion.path
          d={`
            M ${dimensions.width * 0.15} 400
            Q ${dimensions.width * 0.15} 600, ${dimensions.width * 0.3} 700
            Q ${dimensions.width * 0.45} 800, ${dimensions.width * 0.5} 950
            Q ${dimensions.width * 0.55} 1100, ${dimensions.width * 0.7} 1200
            Q ${dimensions.width * 0.85} 1300, ${dimensions.width * 0.85} 1500
          `}
          fill="none"
          stroke="url(#curveGradient1)"
          strokeWidth="2"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 2, delay: 0.5, ease: "easeInOut" }}
        />

        {/* Right side curve flowing down */}
        <motion.path
          d={`
            M ${dimensions.width * 0.85} 300
            Q ${dimensions.width * 0.9} 500, ${dimensions.width * 0.75} 700
            Q ${dimensions.width * 0.6} 900, ${dimensions.width * 0.65} 1100
            Q ${dimensions.width * 0.7} 1300, ${dimensions.width * 0.55} 1500
            Q ${dimensions.width * 0.4} 1700, ${dimensions.width * 0.5} 1900
          `}
          fill="none"
          stroke="url(#curveGradient1)"
          strokeWidth="1.5"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 2.5, delay: 0.8, ease: "easeInOut" }}
        />

        {/* Accent curve connecting elements */}
        <motion.path
          d={`
            M ${dimensions.width * 0.2} 800
            C ${dimensions.width * 0.35} 850, ${dimensions.width * 0.4} 900, ${dimensions.width * 0.5} 920
            S ${dimensions.width * 0.7} 950, ${dimensions.width * 0.75} 1000
          `}
          fill="none"
          stroke="url(#accentGradient)"
          strokeWidth="2"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.5, delay: 1.2, ease: "easeInOut" }}
        />

        {/* Lower connecting curve */}
        <motion.path
          d={`
            M ${dimensions.width * 0.1} 1400
            Q ${dimensions.width * 0.25} 1500, ${dimensions.width * 0.4} 1480
            T ${dimensions.width * 0.6} 1550
            Q ${dimensions.width * 0.75} 1600, ${dimensions.width * 0.8} 1700
          `}
          fill="none"
          stroke={lineColor}
          strokeWidth="1.5"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 2, delay: 1.5, ease: "easeInOut" }}
        />

        {/* Decorative loop curve */}
        <motion.path
          d={`
            M ${dimensions.width * 0.25} 1800
            C ${dimensions.width * 0.3} 1750, ${dimensions.width * 0.4} 1780, ${dimensions.width * 0.45} 1850
            S ${dimensions.width * 0.55} 1920, ${dimensions.width * 0.5} 2000
          `}
          fill="none"
          stroke="rgba(74, 108, 247, 0.2)"
          strokeWidth="2"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.8, delay: 1.8, ease: "easeInOut" }}
        />

        {/* Small decorative circles at intersection points */}
        <motion.circle
          cx={dimensions.width * 0.5}
          cy={950}
          r={5}
          fill="none"
          stroke="rgba(27, 58, 107, 0.25)"
          strokeWidth="1"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, delay: 1.8 }}
        />
        
        <motion.circle
          cx={dimensions.width * 0.65}
          cy={1100}
          r={4}
          fill="rgba(74, 108, 247, 0.2)"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, delay: 2 }}
        />

        <motion.circle
          cx={dimensions.width * 0.35}
          cy={1480}
          r={6}
          fill="none"
          stroke="rgba(27, 58, 107, 0.2)"
          strokeWidth="1.5"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, delay: 2.2 }}
        />

        <motion.circle
          cx={dimensions.width * 0.75}
          cy={1000}
          r={5}
          fill="rgba(27, 58, 107, 0.15)"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, delay: 2.1 }}
        />
      </svg>
    </div>
  );
};

// Section connector with elegant curved path
export const SectionConnector = ({ 
  fromSide = "left",
  isDark = false,
}: { 
  fromSide?: "left" | "right";
  isDark?: boolean;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  
  const strokeColor = isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(27, 58, 107, 0.18)";
  const accentColor = isDark ? "rgba(74, 108, 247, 0.25)" : "rgba(74, 108, 247, 0.2)";

  return (
    <div 
      ref={ref}
      className="absolute inset-x-0 top-0 h-32 pointer-events-none overflow-visible hidden md:block"
      style={{ zIndex: 0 }}
    >
      <svg 
        className="absolute w-full h-full overflow-visible"
        viewBox="0 0 1200 120"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={`sectionGrad-${fromSide}-${isDark}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={fromSide === "left" ? accentColor : "transparent"} />
            <stop offset="50%" stopColor={strokeColor} />
            <stop offset="100%" stopColor={fromSide === "right" ? accentColor : "transparent"} />
          </linearGradient>
        </defs>
        
        {/* Elegant curved connector */}
        <motion.path
          d={fromSide === "left" 
            ? "M 0 60 Q 200 20, 400 50 T 600 40 Q 800 30, 1000 60 T 1200 50"
            : "M 1200 60 Q 1000 20, 800 50 T 600 40 Q 400 30, 200 60 T 0 50"
          }
          fill="none"
          stroke={`url(#sectionGrad-${fromSide}-${isDark})`}
          strokeWidth="1.5"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={isInView ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
          transition={{ duration: 1.5, ease: "easeInOut" }}
        />

        {/* Small node at curve center */}
        <motion.circle
          cx={600}
          cy={40}
          r={4}
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.5"
          initial={{ scale: 0, opacity: 0 }}
          animate={isInView ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
          transition={{ duration: 0.4, delay: 0.8 }}
        />
        <motion.circle
          cx={600}
          cy={40}
          r={2}
          fill={accentColor}
          initial={{ scale: 0, opacity: 0 }}
          animate={isInView ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
          transition={{ duration: 0.3, delay: 1 }}
        />
      </svg>
    </div>
  );
};

// Flowing connection that links to content cards
export const FlowingConnection = ({
  direction = "left-to-center",
  isDark = false,
}: {
  direction?: "left-to-center" | "right-to-center" | "center-to-left" | "center-to-right";
  isDark?: boolean;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  
  const strokeColor = isDark ? "rgba(255, 255, 255, 0.18)" : "rgba(27, 58, 107, 0.2)";

  const paths: Record<string, string> = {
    "left-to-center": "M 0 50 Q 80 30, 150 50 T 300 40 Q 400 35, 500 50",
    "right-to-center": "M 500 50 Q 420 30, 350 50 T 200 40 Q 100 35, 0 50",
    "center-to-left": "M 250 0 Q 200 30, 150 40 C 100 50, 50 45, 0 60",
    "center-to-right": "M 250 0 Q 300 30, 350 40 C 400 50, 450 45, 500 60",
  };

  return (
    <div 
      ref={ref}
      className="absolute pointer-events-none hidden md:block"
      style={{ 
        width: '500px',
        height: '80px',
        left: direction.includes("left") ? 0 : 'auto',
        right: direction.includes("right") ? 0 : 'auto',
        zIndex: 0,
      }}
    >
      <svg className="w-full h-full" viewBox="0 0 500 80" preserveAspectRatio="none">
        <motion.path
          d={paths[direction]}
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={isInView ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
        />
      </svg>
    </div>
  );
};

// Export placeholder components for backward compatibility
export const FlowchartMarker = ({ sectionId, isDark, branches }: any) => {
  return <SectionConnector fromSide={branches?.[0]?.direction || "left"} isDark={isDark} />;
};

export const FlowchartMobileMarker = ({ isDark }: { isDark?: boolean }) => null;

export default FlowchartLines;
