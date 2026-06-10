import { useState } from "react";
import { motion } from "framer-motion";
import { Lock, Unlock, ChevronLeft, ChevronRight } from "lucide-react";
import ProtocolStackCards from "./ProtocolStackCards";
import { SectionConnector } from "./FlowchartLines";
import DecorativeGrid from "./DecorativeGrid";
interface SolutionCardData {
  id: string;
  label: string;
  title: string;
  content: string;
  icon: React.ReactNode;
}
const solutionCards: SolutionCardData[] = [{
  id: "premium",
  label: "Premium Collection",
  title: "8-12% Annual Yields",
  content: "8-12% annual yields from real insurance premiums. Independent of equity markets and crypto.",
  icon: <Lock />
}, {
  id: "settlement",
  label: "On-Chain Settlement",
  title: "Real-Time Transparency",
  content: "Every premium, claim, and distribution settles on Base. Real-time. Transparent. Automated.",
  icon: <Unlock />
}, {
  id: "access",
  label: "Institutional Access",
  title: "Compliant Custody",
  content: "Qualified custody. Compliant. Built for institutional capital.",
  icon: <Lock />
}];
const FeaturesSection = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const handleCardClick = (index: number) => {
    setActiveIndex(index);
  };
  const handlePrev = () => {
    setActiveIndex(prev => prev === 0 ? solutionCards.length - 1 : prev - 1);
  };
  const handleNext = () => {
    setActiveIndex(prev => prev === solutionCards.length - 1 ? 0 : prev + 1);
  };
  return <section className="relative" style={{
    zIndex: 1
  }}>
      {/* From Silos to Liquid Marketplace Section */}
      <div className="relative overflow-hidden" style={{
      backgroundColor: '#FFFFFF',
      minHeight: '500px'
    }}>
        {/* Section connector */}
        <SectionConnector fromSide="left" isDark={false} />
        
        {/* Decorative grid */}
        <DecorativeGrid variant="light" position="bottom" />

        {/* Subtle gradient overlay for depth */}
        <div className="absolute inset-0" style={{
        background: 'radial-gradient(ellipse at 50% 0%, rgba(27, 58, 107, 0.03) 0%, transparent 60%)'
      }} />

        {/* Content */}
        <div className="relative z-10 px-6 py-24 md:py-32">
          <div className="mx-auto" style={{
          maxWidth: '1100px'
        }}>
            {/* Section Header */}
            <motion.div initial={{
            opacity: 0,
            y: 20
          }} whileInView={{
            opacity: 1,
            y: 0
          }} viewport={{
            once: true
          }} transition={{
            duration: 0.6
          }} className="text-center mb-12 md:mb-16">
              
              <span style={{
                fontSize: '12px',
                fontWeight: 500,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: '#1B3A6B',
                marginBottom: '12px',
                display: 'block'
              }}>
                REAL ASSETS. REAL INCOME.
              </span>
              <h2 style={{
              fontSize: 'clamp(28px, 5vw, 42px)',
              fontWeight: 500,
              color: '#0F1218',
              lineHeight: 1.2
            }}>
                Uncorrelated Returns from
                <br />
                Real Insurance Premiums
              </h2>
            </motion.div>

            {/* Cards - Unified layout with equal widths */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
              {solutionCards.map((card, index) => {
                const isActive = activeIndex === index;
                return (
                  <div
                    key={card.id}
                    onClick={() => handleCardClick(index)}
                    className="relative cursor-pointer overflow-hidden"
                    style={{
                      borderRadius: '16px',
                      backdropFilter: 'blur(8px)',
                      backgroundColor: isActive ? 'rgba(27, 58, 107, 0.06)' : 'rgba(27, 58, 107, 0.02)',
                      opacity: isActive ? 1 : 0.85,
                      transition: 'background-color 0.3s ease-out, opacity 0.3s ease-out'
                    }}
                  >
                    <div 
                      className="absolute inset-0 border" 
                      style={{
                        borderRadius: '16px',
                        borderColor: isActive ? 'rgba(27, 58, 107, 0.15)' : 'rgba(27, 58, 107, 0.08)',
                        boxShadow: isActive ? '0 8px 32px rgba(27, 58, 107, 0.08)' : 'none',
                        transition: 'border-color 0.3s ease-out, box-shadow 0.3s ease-out'
                      }} 
                    />
                    
                    <div className="relative h-full p-5 md:p-7 flex flex-col" style={{ minHeight: '200px' }}>
                      {/* Icon */}
                      <div
                        style={{
                          color: isActive ? '#1B3A6B' : 'rgba(27, 58, 107, 0.5)',
                          width: '28px',
                          height: '28px',
                          transition: 'color 0.3s ease-out'
                        }}
                      >
                        <div style={{ width: '100%', height: '100%' }}>
                          {card.icon}
                        </div>
                      </div>

                      {/* Spacer */}
                      <div className="flex-1 min-h-4" />

                      {/* Label */}
                      <span
                        style={{
                          color: isActive ? '#1B3A6B' : 'rgba(27, 58, 107, 0.5)',
                          fontSize: '12px',
                          fontWeight: 500,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          marginBottom: '8px',
                          transition: 'color 0.3s ease-out'
                        }}
                      >
                        {card.label}
                      </span>

                      {/* Separator Line */}
                      <div
                        style={{
                          width: '40px',
                          backgroundColor: isActive ? '#1B3A6B' : 'rgba(27, 58, 107, 0.15)',
                          height: '1px',
                          marginBottom: '12px',
                          transition: 'background-color 0.3s ease-out'
                        }}
                      />

                      {/* Title */}
                      <h3
                        style={{
                          color: isActive ? '#0F1218' : 'rgba(15, 18, 24, 0.7)',
                          fontSize: '16px',
                          fontWeight: isActive ? 600 : 500,
                          lineHeight: 1.3,
                          transition: 'color 0.3s ease-out, font-weight 0.3s ease-out'
                        }}
                      >
                        {card.title}
                      </h3>

                      {/* Expanded Content */}
                      <div
                        style={{
                          opacity: isActive ? 1 : 0,
                          maxHeight: isActive ? '200px' : '0px',
                          marginTop: isActive ? '16px' : '0px',
                          overflow: 'hidden',
                          transition: 'opacity 0.25s ease-out, max-height 0.3s ease-out, margin-top 0.25s ease-out'
                        }}
                      >
                        <p style={{
                          fontSize: '14px',
                          lineHeight: 1.65,
                          color: '#4A4A4A'
                        }}>
                          {card.content}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Navigation Arrows */}
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={handlePrev} className="flex items-center justify-center transition-all duration-300" style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: 'rgba(27, 58, 107, 0.06)',
              border: '1px solid rgba(27, 58, 107, 0.12)'
            }} onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(27, 58, 107, 0.12)';
              e.currentTarget.style.borderColor = 'rgba(27, 58, 107, 0.25)';
            }} onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(27, 58, 107, 0.06)';
              e.currentTarget.style.borderColor = 'rgba(27, 58, 107, 0.12)';
            }}>
                <ChevronLeft size={18} style={{
                color: 'rgba(27, 58, 107, 0.6)'
              }} />
              </button>
              <button onClick={handleNext} className="flex items-center justify-center transition-all duration-300" style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: 'rgba(27, 58, 107, 0.06)',
              border: '1px solid rgba(27, 58, 107, 0.12)'
            }} onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(27, 58, 107, 0.12)';
              e.currentTarget.style.borderColor = 'rgba(27, 58, 107, 0.25)';
            }} onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(27, 58, 107, 0.06)';
              e.currentTarget.style.borderColor = 'rgba(27, 58, 107, 0.12)';
            }}>
                <ChevronRight size={18} style={{
                color: 'rgba(27, 58, 107, 0.6)'
              }} />
              </button>
            </div>

            {/* Bottom tagline */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="text-center mt-12 font-serif italic"
              style={{
                fontSize: 'clamp(16px, 3vw, 20px)',
                color: '#0F1218',
                fontFamily: "'Playfair Display', serif",
                maxWidth: '700px',
                margin: '48px auto 0'
              }}
            >
              Insurance risk premium is compensation for assuming real-world risk — hurricanes, earthquakes, mortality. Not financial engineering.
            </motion.p>

          </div>
        </div>
      </div>

      {/* Protocol Stack Cards */}
      <ProtocolStackCards />
    </section>;
};
export default FeaturesSection;