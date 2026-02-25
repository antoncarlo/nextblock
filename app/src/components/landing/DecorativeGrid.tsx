"use client";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";

// Decorative geometric grid with organic shapes
const DecorativeGrid = ({ 
  variant = "light",
  position = "bottom",
}: { 
  variant?: "light" | "dark";
  position?: "bottom" | "top" | "full";
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  const isDark = variant === "dark";
  const baseColor = isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(27, 58, 107, 0.08)";
  const accentColor = isDark ? "rgba(74, 108, 247, 0.12)" : "rgba(74, 108, 247, 0.1)";
  const lineColor = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(27, 58, 107, 0.1)";

  const positionStyles: Record<string, React.CSSProperties> = {
    bottom: { bottom: 0, height: '300px' },
    top: { top: 0, height: '300px' },
    full: { top: 0, bottom: 0 },
  };

  return (
    <div 
      ref={ref}
      className="absolute left-0 right-0 pointer-events-none overflow-hidden hidden md:block"
      style={{ 
        ...positionStyles[position],
        zIndex: 0,
      }}
    >
      <svg 
        className="absolute w-full h-full"
        viewBox="0 0 1400 300"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          {/* Gradient masks */}
          <linearGradient id={`fadeUp-${variant}`} x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="white" stopOpacity="1" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
          
          <mask id={`fadeMask-${variant}`}>
            <rect width="100%" height="100%" fill={`url(#fadeUp-${variant})`} />
          </mask>
        </defs>

        <g mask={position === "bottom" ? `url(#fadeMask-${variant})` : undefined}>
          {/* Organic curved grid lines */}
          <motion.path
            d="M 0 150 Q 350 100, 700 150 T 1400 120"
            fill="none"
            stroke={lineColor}
            strokeWidth="1"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={isInView ? { pathLength: 1, opacity: 1 } : {}}
            transition={{ duration: 2, ease: "easeOut" }}
          />
          
          <motion.path
            d="M 0 200 Q 300 170, 600 200 T 1200 180 Q 1350 170, 1400 190"
            fill="none"
            stroke={lineColor}
            strokeWidth="0.8"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={isInView ? { pathLength: 1, opacity: 1 } : {}}
            transition={{ duration: 2, delay: 0.3, ease: "easeOut" }}
          />

          <motion.path
            d="M 0 250 Q 400 230, 800 250 T 1400 240"
            fill="none"
            stroke={lineColor}
            strokeWidth="0.6"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={isInView ? { pathLength: 1, opacity: 1 } : {}}
            transition={{ duration: 2, delay: 0.5, ease: "easeOut" }}
          />

          {/* Vertical flowing lines */}
          <motion.path
            d="M 200 0 Q 220 80, 200 160 T 180 300"
            fill="none"
            stroke={lineColor}
            strokeWidth="0.8"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={isInView ? { pathLength: 1, opacity: 1 } : {}}
            transition={{ duration: 1.5, delay: 0.4, ease: "easeOut" }}
          />

          <motion.path
            d="M 600 0 Q 580 100, 620 180 T 600 300"
            fill="none"
            stroke={accentColor}
            strokeWidth="1"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={isInView ? { pathLength: 1, opacity: 1 } : {}}
            transition={{ duration: 1.5, delay: 0.6, ease: "easeOut" }}
          />

          <motion.path
            d="M 1000 0 Q 1020 90, 980 170 T 1000 300"
            fill="none"
            stroke={lineColor}
            strokeWidth="0.8"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={isInView ? { pathLength: 1, opacity: 1 } : {}}
            transition={{ duration: 1.5, delay: 0.8, ease: "easeOut" }}
          />

          {/* Decorative organic shapes */}
          <motion.ellipse
            cx="300"
            cy="180"
            rx="60"
            ry="40"
            fill="none"
            stroke={accentColor}
            strokeWidth="1"
            initial={{ scale: 0, opacity: 0 }}
            animate={isInView ? { scale: 1, opacity: 1 } : {}}
            transition={{ duration: 0.8, delay: 1 }}
          />

          <motion.circle
            cx="800"
            cy="200"
            r="30"
            fill="none"
            stroke={baseColor}
            strokeWidth="1.5"
            initial={{ scale: 0, opacity: 0 }}
            animate={isInView ? { scale: 1, opacity: 1 } : {}}
            transition={{ duration: 0.6, delay: 1.2 }}
          />

          <motion.path
            d="M 1100 160 Q 1130 140, 1160 160 T 1220 150 Q 1250 170, 1200 190 T 1100 160"
            fill={baseColor}
            stroke={lineColor}
            strokeWidth="0.5"
            initial={{ scale: 0, opacity: 0 }}
            animate={isInView ? { scale: 1, opacity: 1 } : {}}
            transition={{ duration: 0.8, delay: 1.4 }}
          />

          {/* Small accent dots */}
          {[
            { cx: 150, cy: 120, r: 3, delay: 1.5 },
            { cx: 450, cy: 180, r: 2, delay: 1.6 },
            { cx: 750, cy: 140, r: 4, delay: 1.7 },
            { cx: 950, cy: 220, r: 2.5, delay: 1.8 },
            { cx: 1200, cy: 100, r: 3, delay: 1.9 },
          ].map((dot, i) => (
            <motion.circle
              key={i}
              cx={dot.cx}
              cy={dot.cy}
              r={dot.r}
              fill={accentColor}
              initial={{ scale: 0, opacity: 0 }}
              animate={isInView ? { scale: 1, opacity: 1 } : {}}
              transition={{ duration: 0.4, delay: dot.delay }}
            />
          ))}

          {/* Diamond shapes */}
          <motion.path
            d="M 500 230 L 515 245 L 500 260 L 485 245 Z"
            fill="none"
            stroke={accentColor}
            strokeWidth="1"
            initial={{ scale: 0, opacity: 0 }}
            animate={isInView ? { scale: 1, opacity: 1 } : {}}
            transition={{ duration: 0.5, delay: 1.3 }}
          />

          <motion.path
            d="M 900 170 L 912 185 L 900 200 L 888 185 Z"
            fill={baseColor}
            stroke={lineColor}
            strokeWidth="0.5"
            initial={{ scale: 0, opacity: 0 }}
            animate={isInView ? { scale: 1, opacity: 1 } : {}}
            transition={{ duration: 0.5, delay: 1.5 }}
          />
        </g>
      </svg>
    </div>
  );
};

export default DecorativeGrid;
