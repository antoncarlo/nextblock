import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import IntroExperience from "@/components/intro/IntroExperience";
import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import KeyBenefitsSection from "@/components/KeyBenefitsSection";
import FeaturesSection from "@/components/FeaturesSection";
import AboutSection from "@/components/AboutSection";
import OurVisionSection from "@/components/OurVisionSection";
import Footer from "@/components/Footer";
import FlowchartLines from "@/components/FlowchartLines";
import FloatingParallaxElements from "@/components/FloatingParallaxElements";

const Index = () => {
  const [showIntro, setShowIntro] = useState(true);

  return (
    <>
      <AnimatePresence mode="wait">
        {showIntro && (
          <IntroExperience 
            key="intro" 
            onComplete={() => setShowIntro(false)} 
          />
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: showIntro ? 0 : 1 }}
        transition={{ duration: 0.8 }}
        className="min-h-screen bg-background relative"
      >
        {/* Flowchart vertical lines */}
        <FlowchartLines />
        
        {/* Floating parallax ink illustrations */}
        <FloatingParallaxElements />
        
        <Header />
        <HeroSection />
        <KeyBenefitsSection />
        <FeaturesSection />
        <AboutSection />
        <OurVisionSection />
        <Footer />
      </motion.div>
    </>
  );
};

export default Index;
