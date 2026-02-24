import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

// Blue ink illustration elements as SVG paths
const InkElements = {
  // Quill/feather pen
  quill: (
    <svg viewBox="0 0 60 80" fill="none" className="w-full h-full">
      <path
        d="M30 5 C25 15, 20 25, 22 40 C24 55, 28 70, 30 75 C32 70, 36 55, 38 40 C40 25, 35 15, 30 5"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M30 75 L28 78 L30 80 L32 78 L30 75"
        stroke="currentColor"
        strokeWidth="1"
        fill="currentColor"
      />
      <path
        d="M22 40 C18 38, 15 42, 12 40"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M38 40 C42 38, 45 42, 48 40"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  ),
  
  // Compass rose
  compass: (
    <svg viewBox="0 0 60 60" fill="none" className="w-full h-full">
      <circle cx="30" cy="30" r="25" stroke="currentColor" strokeWidth="1" fill="none" />
      <circle cx="30" cy="30" r="3" stroke="currentColor" strokeWidth="1" fill="currentColor" />
      <path d="M30 5 L32 28 L30 30 L28 28 Z" fill="currentColor" />
      <path d="M55 30 L32 32 L30 30 L32 28 Z" fill="currentColor" opacity="0.5" />
      <path d="M30 55 L28 32 L30 30 L32 32 Z" fill="currentColor" opacity="0.5" />
      <path d="M5 30 L28 28 L30 30 L28 32 Z" fill="currentColor" />
      <text x="30" y="12" textAnchor="middle" fontSize="6" fill="currentColor">N</text>
    </svg>
  ),
  
  // Sailing ship
  ship: (
    <svg viewBox="0 0 80 70" fill="none" className="w-full h-full">
      <path
        d="M15 50 Q40 55, 65 50 L60 60 Q40 65, 20 60 Z"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      <path d="M40 50 L40 15" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M40 15 Q55 25, 55 40 L40 45 Z"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
      />
      <path
        d="M40 20 Q25 30, 25 42 L40 45 Z"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
      />
      <path d="M38 10 L40 15 L42 10" stroke="currentColor" strokeWidth="1" fill="none" />
    </svg>
  ),
  
  // Scroll/document
  scroll: (
    <svg viewBox="0 0 50 70" fill="none" className="w-full h-full">
      <path
        d="M10 10 Q5 10, 5 15 L5 55 Q5 60, 10 60 L40 60 Q45 60, 45 55 L45 15 Q45 10, 40 10 Z"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      <path d="M12 20 L38 20" stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
      <path d="M12 28 L38 28" stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
      <path d="M12 36 L32 36" stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
      <path d="M12 44 L35 44" stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
      <circle cx="8" cy="8" r="4" stroke="currentColor" strokeWidth="1" fill="none" />
      <circle cx="42" cy="62" r="4" stroke="currentColor" strokeWidth="1" fill="none" />
    </svg>
  ),
  
  // Anchor
  anchor: (
    <svg viewBox="0 0 50 70" fill="none" className="w-full h-full">
      <circle cx="25" cy="10" r="6" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M25 16 L25 55" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 45 Q25 60, 40 45" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M15 35 L35 35" stroke="currentColor" strokeWidth="1.5" />
      <path d="M25 55 L22 62 L25 65 L28 62 Z" fill="currentColor" />
    </svg>
  ),
  
  // Coin/medallion
  coin: (
    <svg viewBox="0 0 50 50" fill="none" className="w-full h-full">
      <circle cx="25" cy="25" r="22" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <circle cx="25" cy="25" r="18" stroke="currentColor" strokeWidth="0.8" fill="none" />
      <text x="25" y="30" textAnchor="middle" fontSize="14" fill="currentColor" fontFamily="serif">£</text>
    </svg>
  ),
  
  // Star/navigation
  star: (
    <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
      <path
        d="M20 5 L23 15 L33 15 L25 22 L28 32 L20 26 L12 32 L15 22 L7 15 L17 15 Z"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
      />
    </svg>
  ),
  
  // Wave pattern
  wave: (
    <svg viewBox="0 0 80 30" fill="none" className="w-full h-full">
      <path
        d="M0 15 Q10 5, 20 15 T40 15 T60 15 T80 15"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M0 22 Q10 12, 20 22 T40 22 T60 22 T80 22"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  ),
  
  // Ornate corner flourish
  flourish: (
    <svg viewBox="0 0 60 60" fill="none" className="w-full h-full">
      <path
        d="M5 55 Q5 30, 20 20 Q35 10, 55 5"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M10 50 Q15 35, 25 28 Q35 20, 50 15"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
        strokeLinecap="round"
        opacity="0.6"
      />
      <circle cx="55" cy="5" r="2" fill="currentColor" />
      <circle cx="5" cy="55" r="2" fill="currentColor" />
    </svg>
  ),
  
  // Small dots cluster
  dots: (
    <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
      <circle cx="10" cy="20" r="2" fill="currentColor" />
      <circle cx="20" cy="12" r="1.5" fill="currentColor" opacity="0.7" />
      <circle cx="28" cy="22" r="2.5" fill="currentColor" />
      <circle cx="18" cy="30" r="1.8" fill="currentColor" opacity="0.5" />
      <circle cx="32" cy="32" r="1.2" fill="currentColor" opacity="0.6" />
    </svg>
  ),
};

interface FloatingElementProps {
  element: keyof typeof InkElements;
  className?: string;
  style?: React.CSSProperties;
  parallaxSpeed: number; // -1 to 1, negative = opposite direction
  initialY?: number;
  size?: number;
  opacity?: number;
  rotation?: number;
}

const FloatingElement = ({
  element,
  className = "",
  style = {},
  parallaxSpeed,
  size = 40,
  opacity = 0.15,
  rotation = 0,
}: FloatingElementProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll();
  
  // Transform scroll progress to Y movement
  const y = useTransform(
    scrollYProgress,
    [0, 1],
    [0, parallaxSpeed * 400]
  );
  
  const rotate = useTransform(
    scrollYProgress,
    [0, 1],
    [rotation, rotation + parallaxSpeed * 15]
  );

  return (
    <motion.div
      ref={ref}
      className={`absolute pointer-events-none ${className}`}
      style={{
        ...style,
        y,
        rotate,
        width: size,
        height: size,
        color: "#1B3A6B",
        opacity,
      }}
    >
      {InkElements[element]}
    </motion.div>
  );
};

const FloatingParallaxElements = () => {
  // Configuration for each floating element
  const elements: FloatingElementProps[] = [
    // Left side elements
    { element: "quill", parallaxSpeed: -0.3, size: 50, opacity: 0.12, style: { left: "3%", top: "15%" }, rotation: -15 },
    { element: "compass", parallaxSpeed: 0.5, size: 55, opacity: 0.1, style: { left: "5%", top: "35%" }, rotation: 0 },
    { element: "scroll", parallaxSpeed: -0.4, size: 45, opacity: 0.08, style: { left: "2%", top: "55%" }, rotation: 5 },
    { element: "anchor", parallaxSpeed: 0.3, size: 40, opacity: 0.1, style: { left: "6%", top: "75%" }, rotation: -10 },
    { element: "dots", parallaxSpeed: -0.6, size: 35, opacity: 0.15, style: { left: "8%", top: "25%" }, rotation: 0 },
    { element: "flourish", parallaxSpeed: 0.2, size: 50, opacity: 0.08, style: { left: "4%", top: "88%" }, rotation: 0 },
    
    // Right side elements
    { element: "ship", parallaxSpeed: 0.4, size: 70, opacity: 0.1, style: { right: "3%", top: "20%" }, rotation: 5 },
    { element: "star", parallaxSpeed: -0.5, size: 35, opacity: 0.12, style: { right: "6%", top: "40%" }, rotation: 15 },
    { element: "coin", parallaxSpeed: 0.35, size: 40, opacity: 0.1, style: { right: "4%", top: "58%" }, rotation: 0 },
    { element: "wave", parallaxSpeed: -0.25, size: 70, opacity: 0.08, style: { right: "2%", top: "78%" }, rotation: -5 },
    { element: "dots", parallaxSpeed: 0.55, size: 30, opacity: 0.12, style: { right: "8%", top: "32%" }, rotation: 0 },
    { element: "flourish", parallaxSpeed: -0.35, size: 55, opacity: 0.08, style: { right: "5%", top: "92%" }, rotation: 180 },
    
    // Additional scattered elements for depth
    { element: "star", parallaxSpeed: 0.7, size: 25, opacity: 0.06, style: { left: "12%", top: "45%" }, rotation: 30 },
    { element: "coin", parallaxSpeed: -0.45, size: 30, opacity: 0.07, style: { right: "12%", top: "65%" }, rotation: 10 },
    { element: "dots", parallaxSpeed: 0.8, size: 25, opacity: 0.1, style: { left: "10%", top: "68%" }, rotation: 0 },
    { element: "star", parallaxSpeed: -0.55, size: 20, opacity: 0.08, style: { right: "10%", top: "12%" }, rotation: -20 },
  ];

  return (
    <div 
      className="fixed inset-0 pointer-events-none overflow-hidden hidden md:block"
      style={{ zIndex: 1 }}
    >
      {elements.map((props, index) => (
        <FloatingElement key={index} {...props} />
      ))}
    </div>
  );
};

export default FloatingParallaxElements;
