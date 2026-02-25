"use client";
import { motion } from "framer-motion";
const lionImage = "/assets/protocol-stack-lion.png";
import { SectionConnector } from "./FlowchartLines";
import DecorativeGrid from "./DecorativeGrid";

interface CorrelationData {
  assetClass: string;
  vsSP500: string;
  vsCrypto: string;
  isHighlighted?: boolean;
}

const correlationData: CorrelationData[] = [
  { assetClass: "Investment Bonds", vsSP500: "0.35", vsCrypto: "0.15" },
  { assetClass: "Private Credit", vsSP500: "0.42", vsCrypto: "0.28" },
  { assetClass: "Real Estate", vsSP500: "0.51", vsCrypto: "0.22" },
  { assetClass: "INSURANCE RISK", vsSP500: "0.05", vsCrypto: "0.03", isHighlighted: true },
];

const ProtocolStackCards = () => {
  return (
    <section 
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
              The Only Yield Truly
              <br />
              Uncorrelated to Everything
            </h2>
          </motion.div>

          {/* Correlation Table */}
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
            {/* Table Header */}
            <div 
              className="grid grid-cols-3 gap-4 px-6 py-4"
              style={{
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              <span style={{ 
                fontSize: '12px', 
                fontWeight: 500, 
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'rgba(255, 255, 255, 0.4)',
              }}>
                Asset Class
              </span>
              <span style={{ 
                fontSize: '12px', 
                fontWeight: 500, 
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'rgba(255, 255, 255, 0.4)',
                textAlign: 'center',
              }}>
                vs S&P 500
              </span>
              <span style={{ 
                fontSize: '12px', 
                fontWeight: 500, 
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'rgba(255, 255, 255, 0.4)',
                textAlign: 'center',
              }}>
                vs Crypto
              </span>
            </div>

            {/* Table Rows */}
            {correlationData.map((row, index) => (
              <motion.div 
                key={row.assetClass}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.3 + index * 0.1 }}
                className="grid grid-cols-3 gap-4 px-6 py-5"
                style={{
                  borderBottom: index < correlationData.length - 1 ? '1px solid rgba(255, 255, 255, 0.06)' : 'none',
                  backgroundColor: row.isHighlighted ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                }}
              >
                <span style={{ 
                  fontSize: row.isHighlighted ? '15px' : '14px', 
                  fontWeight: row.isHighlighted ? 600 : 400,
                  color: row.isHighlighted ? '#FFFFFF' : 'rgba(255, 255, 255, 0.7)',
                }}>
                  {row.assetClass}
                </span>
                <span style={{ 
                  fontSize: row.isHighlighted ? '18px' : '14px', 
                  fontWeight: row.isHighlighted ? 600 : 400,
                  color: row.isHighlighted ? '#1B3A6B' : 'rgba(255, 255, 255, 0.7)',
                  textAlign: 'center',
                }}>
                  {row.vsSP500}
                </span>
                <span style={{ 
                  fontSize: row.isHighlighted ? '18px' : '14px', 
                  fontWeight: row.isHighlighted ? 600 : 400,
                  color: row.isHighlighted ? '#1B3A6B' : 'rgba(255, 255, 255, 0.7)',
                  textAlign: 'center',
                }}>
                  {row.vsCrypto}
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
            "Hurricanes don't care about Fed policy."
          </motion.p>

        </div>
      </div>
    </section>
  );
};

export default ProtocolStackCards;
