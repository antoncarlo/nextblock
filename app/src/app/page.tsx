"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import IntroExperience from "@/components/landing/intro/IntroExperience";
import Header from "@/components/landing/Header";
import HeroSection from "@/components/landing/HeroSection";
import KeyBenefitsSection from "@/components/landing/KeyBenefitsSection";
import FeaturesSection from "@/components/landing/FeaturesSection";
import AboutSection from "@/components/landing/AboutSection";
import OurVisionSection from "@/components/landing/OurVisionSection";
import Footer from "@/components/landing/Footer";
import FlowchartLines from "@/components/landing/FlowchartLines";
import FloatingParallaxElements from "@/components/landing/FloatingParallaxElements";

export default function HomePage() {
  const [showIntro, setShowIntro] = useState(true);

  return (
    <>
      <AnimatePresence>
        {showIntro && (
          <IntroExperience onComplete={() => setShowIntro(false)} />
        )}
      </AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: showIntro ? 0 : 1 }}
        transition={{ duration: 0.5 }}
      >
        <Header />
        <main>
          <HeroSection />
          <FlowchartLines />
          <FloatingParallaxElements />
          <KeyBenefitsSection />
          <FeaturesSection />
          <AboutSection />
          <OurVisionSection />
        </main>
        <Footer />
      </motion.div>
    </>
  );
}
