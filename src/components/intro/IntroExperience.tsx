import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import logoLeftWhite from "@/assets/logo-left.svg";
import logoRightWhite from "@/assets/logo-right.svg";

interface IntroExperienceProps {
  onComplete: () => void;
}

const IntroExperience = ({ onComplete }: IntroExperienceProps) => {
  const [phase, setPhase] = useState<"initial" | "split" | "reveal">("initial");

  useEffect(() => {
    // Start split animation after showing logo clearly
    const splitTimer = setTimeout(() => setPhase("split"), 2000);
    
    return () => clearTimeout(splitTimer);
  }, []);

  useEffect(() => {
    if (phase === "split") {
      // Complete and show landing page
      const revealTimer = setTimeout(() => {
        setPhase("reveal");
        setTimeout(onComplete, 600);
      }, 1500);
      
      return () => clearTimeout(revealTimer);
    }
  }, [phase, onComplete]);

  // Generate stars with various sizes
  const stars = [...Array(80)].map((_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 2 + 1,
    opacity: Math.random() * 0.5 + 0.3,
  }));

  return (
    <AnimatePresence>
      {phase !== "reveal" && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
          className="fixed inset-0 z-50 overflow-hidden"
        >
          {/* Background */}
          <div 
            className="absolute inset-0"
            style={{
              backgroundColor: phase === "split" ? "#eeebe3" : "hsl(222, 47%, 6%)",
              transition: "background-color 1.2s cubic-bezier(0.4, 0, 0.2, 1)"
            }}
          />

          {/* Simple star field */}
          <div 
            className="absolute inset-0"
            style={{
              opacity: phase === "split" ? 0 : 1,
              transition: "opacity 1s ease-out"
            }}
          >
            {stars.map((star) => (
              <div
                key={star.id}
                className="absolute rounded-full bg-white"
                style={{
                  left: `${star.x}%`,
                  top: `${star.y}%`,
                  width: star.size,
                  height: star.size,
                  opacity: star.opacity,
                }}
              />
            ))}
          </div>

          {/* Center content - Split Logo */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative flex items-center justify-center">
              {/* Left half - NEXT */}
              <motion.div
                className="flex items-center justify-end"
                initial={{ opacity: 0 }}
                animate={{
                  opacity: 1,
                  x: phase === "split" ? "-50vw" : 0,
                }}
                transition={{
                  opacity: { duration: 0.8, ease: [0.4, 0, 0.2, 1] },
                  x: { duration: 1.2, ease: [0.25, 0.1, 0.25, 1] },
                }}
              >
                <img
                  src={logoLeftWhite}
                  alt="Next"
                  className="h-48 md:h-64 lg:h-96 w-auto"
                  style={{
                    filter: phase === "split" ? "none" : "invert(1)",
                    transition: "filter 0.8s ease-out"
                  }}
                />
              </motion.div>

              {/* Right half - BLOCK */}
              <motion.div
                className="flex items-center justify-start -ml-12 md:-ml-16 lg:-ml-24"
                initial={{ opacity: 0 }}
                animate={{
                  opacity: 1,
                  x: phase === "split" ? "50vw" : 0,
                }}
                transition={{
                  opacity: { duration: 0.8, ease: [0.4, 0, 0.2, 1] },
                  x: { duration: 1.2, ease: [0.25, 0.1, 0.25, 1] },
                }}
              >
                <img
                  src={logoRightWhite}
                  alt="Block"
                  className="h-48 md:h-64 lg:h-96 w-auto"
                  style={{
                    filter: phase === "split" ? "none" : "invert(1)",
                    transition: "filter 0.8s ease-out"
                  }}
                />
              </motion.div>
            </div>
          </div>

          {/* Tagline */}
          <motion.p
            className="absolute bottom-20 inset-x-0 text-sm md:text-base tracking-widest uppercase font-heading text-center"
            initial={{ opacity: 0 }}
            animate={{
              opacity: phase === "split" ? 0 : 1,
            }}
            transition={{ 
              duration: 0.5, 
              delay: phase === "initial" ? 0.8 : 0,
              ease: "easeOut"
            }}
            style={{ color: "hsl(215, 20%, 65%)" }}
          >
            The future of insurance finance
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default IntroExperience;
