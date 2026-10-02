"use client";
import { motion } from "framer-motion";
const lionImage = "/assets/protocol-stack-lion.png";
import { SectionConnector } from "./FlowchartLines";
import DecorativeGrid from "./DecorativeGrid";

interface ReturnDriver {
  assetClass: string;
  driver: string;
  isHighlighted?: boolean;
}

// Qualitative on purpose: what moves the return of each asset class. No coefficients,
// because none is shown without a published source behind it.
const returnDrivers: ReturnDriver[] = [
  { assetClass: "Investment Bonds", driver: "Interest rates and credit spreads" },
  { assetClass: "Private Credit", driver: "Borrower defaults and the credit cycle" },
  { assetClass: "Real Estate", driver: "Interest rates, rents and property valuations" },
  {
    assetClass: "INSURANCE RISK",
    driver: "Whether insured events happen, and how severe they are",
    isHighlighted: true,
  },
];

const ProtocolStackCards = () => {
  return (
    <section data-track-section="protocol_stack" 
      id="how-it-works" 
      className="relative overflow-hidden"
      style={{ 
        minHeight: '600px',
        zIndex: 1,
      }}
    >
      {/* Section connector */}
      <SectionConnector fromSide="right" isDark={true} />
      
      {/* Decorative grid */}
      <DecorativeGrid variant="dark" position="bottom" />
      {/* Background Image - Winged Lion of Saint Mark */}
      <div 
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${lionImage})`,
          backgroundSize: 'contain',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundColor: '#FAFAF8',
        }}
      />
      

      {/* Light Overlay */}
      <div 
        className="absolute inset-0"
        style={{
          background: 'rgba(15, 18, 24, 0.3)',
        }}
      />

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
            <h2
              style={{ 
                fontSize: 'clamp(28px, 5vw, 42px)',
                fontWeight: 500,
                color: '#FFFFFF',
                lineHeight: 1.2,
              }}
            >
              A Return Driven by
              <br />
              Insured Events, Not Markets
            </h2>
          </motion.div>

          {/* What drives each return */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="overflow-hidden"
            style={{
              borderRadius: '16px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <div
              className="grid gap-4 px-6 py-4"
              style={{
                gridTemplateColumns: '1fr 1.6fr',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              {['Asset Class', 'What drives the return'].map((label) => (
                <span
                  key={label}
                  style={{
                    fontSize: '12px',
                    fontWeight: 500,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'rgba(255, 255, 255, 0.4)',
                  }}
                >
                  {label}
                </span>
              ))}
            </div>

            {returnDrivers.map((row, index) => (
              <motion.div
                key={row.assetClass}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.3 + index * 0.1 }}
                className="grid gap-4 px-6 py-5"
                style={{
                  gridTemplateColumns: '1fr 1.6fr',
                  borderBottom: index < returnDrivers.length - 1 ? '1px solid rgba(255, 255, 255, 0.06)' : 'none',
                  backgroundColor: row.isHighlighted ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                }}
              >
                <span
                  style={{
                    fontSize: row.isHighlighted ? '15px' : '14px',
                    fontWeight: row.isHighlighted ? 600 : 400,
                    color: row.isHighlighted ? '#FFFFFF' : 'rgba(255, 255, 255, 0.7)',
                  }}
                >
                  {row.assetClass}
                </span>
                <span
                  style={{
                    fontSize: row.isHighlighted ? '15px' : '14px',
                    fontWeight: row.isHighlighted ? 600 : 400,
                    color: row.isHighlighted ? '#FFFFFF' : 'rgba(255, 255, 255, 0.7)',
                  }}
                >
                  {row.driver}
                </span>
              </motion.div>
            ))}
          </motion.div>

          {/* Quote */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="text-center mt-12 font-serif italic"
            style={{
              fontSize: 'clamp(24px, 4vw, 36px)',
              color: '#FFFFFF',
              fontFamily: "'Playfair Display', serif",
              maxWidth: '800px',
              margin: '48px auto 0',
            }}
          >
            &ldquo;Hurricanes don&apos;t care about Fed policy.&rdquo;
          </motion.p>

        </div>
      </div>
    </section>
  );
};

export default ProtocolStackCards;
