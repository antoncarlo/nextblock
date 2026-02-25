"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Compass, Key, Handshake, ChevronRight } from "lucide-react";
import WaitlistForm from "./WaitlistForm";
import { SectionConnector } from "./FlowchartLines";
import DecorativeGrid from "./DecorativeGrid";

interface RoleCardData {
  id: string;
  label: string;
  title: string;
  content: string;
  icon: React.ReactNode;
}

const roleCards: RoleCardData[] = [
  {
    id: "curator",
    label: "For Vault Curators",
    title: "Reinsurers · Insurers · Asset Managers",
    content: "Deploy compliant vaults. Access global capital. You control underwriting — the protocol handles infrastructure.",
    icon: <Compass />,
  },
  {
    id: "allocator",
    label: "For Allocators",
    title: "Family Offices · Funds · Endowments",
    content: "Access the only RWA uncorrelated to equities, bonds, and crypto.",
    icon: <Key />,
  },
];

const WaitlistSection = () => {
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [showForm, setShowForm] = useState(false);

  const handleCardClick = (index: number) => {
    setActiveCardIndex(index);
  };

  return (
    <section 
      id="waitlist" 
      className="relative overflow-hidden"
      style={{ 
        minHeight: '700px',
        backgroundColor: '#FFFFFF',
        zIndex: 1,
      }}
    >
      {/* Section connector */}
      <SectionConnector fromSide="left" isDark={false} />
      
      {/* Decorative grid */}
      <DecorativeGrid variant="light" position="bottom" />

      {/* Content */}
      <div className="relative z-10 px-6 py-24 md:py-32">
        <div className="mx-auto" style={{ maxWidth: '1200px' }}>
          {/* Section Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12 md:mb-16"
          >
            <span 
              className="block mb-4"
              style={{ 
                fontSize: '13px',
                fontWeight: 500,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'rgba(27, 58, 107, 0.5)',
              }}
            >
              Early Access
            </span>
            <h2 
              style={{ 
                fontSize: 'clamp(28px, 5vw, 42px)',
                fontWeight: 500,
                color: '#0F1218',
                lineHeight: 1.2,
              }}
            >
              NextBlock is onboarding a select cohort
              <br />
              of institutional partners.
            </h2>
          </motion.div>

          {/* Unified Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-start">
            {/* Left: Role Cards */}
            <div className="flex flex-col gap-3">
              {roleCards.map((card, index) => {
                const isActive = activeCardIndex === index;
                
                return (
                  <motion.div
                    key={card.id}
                    onClick={() => handleCardClick(index)}
                    className="relative cursor-pointer overflow-hidden"
                    style={{
                      borderRadius: '16px',
                      backdropFilter: isActive ? 'none' : 'blur(8px)',
                    }}
                    initial={false}
                    animate={{
                      backgroundColor: isActive ? '#FFFFFF' : 'rgba(27, 58, 107, 0.04)',
                      borderColor: isActive ? 'rgba(0, 0, 0, 0.08)' : 'rgba(27, 58, 107, 0.1)',
                    }}
                    whileHover={{
                      borderColor: isActive ? 'rgba(0, 0, 0, 0.08)' : 'rgba(27, 58, 107, 0.2)',
                    }}
                    transition={{
                      duration: 0.5,
                      ease: [0.4, 0, 0.2, 1],
                    }}
                  >
                    <div 
                      className="absolute inset-0 border"
                      style={{
                        borderRadius: '16px',
                        borderColor: isActive ? 'rgba(0, 0, 0, 0.08)' : 'rgba(27, 58, 107, 0.1)',
                        boxShadow: isActive ? '0 8px 32px rgba(0, 0, 0, 0.12)' : 'none',
                        transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                      }}
                    />
                    
                    <div className="relative p-5 md:p-6">
                      <div className="flex items-start gap-4">
                        {/* Icon */}
                        <motion.div
                          animate={{
                            color: isActive ? '#1B3A6B' : 'rgba(27, 58, 107, 0.6)',
                          }}
                          transition={{ duration: 0.4 }}
                          className="flex-shrink-0"
                          style={{ width: '28px', height: '28px' }}
                        >
                          {card.icon}
                        </motion.div>

                        <div className="flex-1">
                          {/* Label */}
                          <motion.span
                            animate={{
                              color: isActive ? '#8A8A8A' : 'rgba(27, 58, 107, 0.5)',
                            }}
                            style={{
                              fontSize: '12px',
                              fontWeight: 500,
                              letterSpacing: '0.08em',
                              textTransform: 'uppercase',
                              display: 'block',
                              marginBottom: '4px',
                            }}
                          >
                            {card.label}
                          </motion.span>

                          {/* Title */}
                          <motion.h3
                            animate={{
                              color: isActive ? '#0F1218' : '#1B3A6B',
                            }}
                            transition={{ duration: 0.4 }}
                            style={{
                              fontSize: '16px',
                              fontWeight: 500,
                              lineHeight: 1.3,
                            }}
                          >
                            {card.title}
                          </motion.h3>

                          {/* Expanded Content */}
                          <motion.div
                            initial={false}
                            animate={{
                              opacity: isActive ? 1 : 0,
                              maxHeight: isActive ? '150px' : '0px',
                              marginTop: isActive ? '12px' : '0px',
                            }}
                            transition={{
                              opacity: { duration: 0.4, delay: isActive ? 0.15 : 0 },
                              maxHeight: { duration: 0.5, ease: [0.4, 0, 0.2, 1] },
                              marginTop: { duration: 0.4 },
                            }}
                            style={{ overflow: 'hidden' }}
                          >
                            <div 
                              style={{ 
                                width: '40px', 
                                height: '1px', 
                                backgroundColor: '#1B3A6B',
                                marginBottom: '12px',
                              }} 
                            />
                            <p
                              style={{
                                fontSize: '14px',
                                lineHeight: 1.65,
                                color: '#4A4A4A',
                              }}
                            >
                              {card.content}
                            </p>
                          </motion.div>
                        </div>

                        {/* Arrow indicator */}
                        <motion.div
                          animate={{
                            color: isActive ? '#1B3A6B' : 'rgba(27, 58, 107, 0.4)',
                            rotate: isActive ? 90 : 0,
                          }}
                          transition={{ duration: 0.3 }}
                          className="flex-shrink-0"
                        >
                          <ChevronRight size={20} />
                        </motion.div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Right: Form Card */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="relative"
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid rgba(0, 0, 0, 0.08)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
                padding: '24px',
              }}
            >
              <WaitlistForm />
            </motion.div>
          </div>

        </div>
      </div>
    </section>
  );
};

export default WaitlistSection;
