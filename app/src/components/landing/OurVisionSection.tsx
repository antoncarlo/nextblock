"use client";

import { motion } from "framer-motion";
import { SectionConnector } from "./FlowchartLines";
import DecorativeGrid from "./DecorativeGrid";

const OurVisionSection = () => {
  return (
    <section
      id="protocol-stack"
      className="relative"
      style={{
        backgroundColor: '#FAFAF8',
        borderTop: '1px solid rgba(0,0,0,0.04)',
        padding: '120px 40px',
        zIndex: 1,
      }}
    >
      {/* Section connector */}
      <SectionConnector fromSide="right" />
      
      {/* Decorative grid */}
      <DecorativeGrid variant="light" position="bottom" />
      <div
        className="mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center"
        style={{ maxWidth: '1200px' }}
      >
        {/* Left Column - Text (55% on desktop) */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="lg:col-span-7 order-1"
        >
          {/* Label */}
          <span
            style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: 500,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: '#9A9A9A',
              marginBottom: '16px',
            }}
          >
            Built for Institutions
          </span>

          {/* Heading */}
          <h2
            style={{
              fontSize: '40px',
              fontWeight: 500,
              color: '#0F1218',
              marginBottom: '32px',
              lineHeight: 1.2,
            }}
          >
            The Protocol
          </h2>

          {/* Feature Cards Grid */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            {/* Fully Compliant */}
            <div
              style={{
                padding: '20px',
                backgroundColor: 'rgba(0,0,0,0.02)',
                borderRadius: '8px',
                border: '1px solid rgba(0,0,0,0.06)',
              }}
            >
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#0F1218', marginBottom: '8px' }}>
                Fully Compliant
              </h3>
              <p style={{ fontSize: '13px', lineHeight: 1.5, color: '#6A6A6A' }}>
                Regulatory compliance, whitelisting, transfer restrictions
              </p>
            </div>

            {/* Automated Settlement */}
            <div
              style={{
                padding: '20px',
                backgroundColor: 'rgba(0,0,0,0.02)',
                borderRadius: '8px',
                border: '1px solid rgba(0,0,0,0.06)',
              }}
            >
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#0F1218', marginBottom: '8px' }}>
                Automated Settlement
              </h3>
              <p style={{ fontSize: '13px', lineHeight: 1.5, color: '#6A6A6A' }}>
                90-day cycles → seconds. On Base.
              </p>
            </div>

            {/* Transparent Accounting */}
            <div
              style={{
                padding: '20px',
                backgroundColor: 'rgba(0,0,0,0.02)',
                borderRadius: '8px',
                border: '1px solid rgba(0,0,0,0.06)',
              }}
            >
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#0F1218', marginBottom: '8px' }}>
                Transparent Accounting
              </h3>
              <p style={{ fontSize: '13px', lineHeight: 1.5, color: '#6A6A6A' }}>
                Real-time NAV on-chain
              </p>
            </div>

            {/* Qualified Custody */}
            <div
              style={{
                padding: '20px',
                backgroundColor: 'rgba(0,0,0,0.02)',
                borderRadius: '8px',
                border: '1px solid rgba(0,0,0,0.06)',
              }}
            >
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#0F1218', marginBottom: '8px' }}>
                Qualified Custody
              </h3>
              <p style={{ fontSize: '13px', lineHeight: 1.5, color: '#6A6A6A' }}>
                Institutional asset segregation
              </p>
            </div>
          </div>

          {/* Bottom Text */}
          <p
            style={{
              fontSize: '15px',
              lineHeight: 1.7,
              color: '#4A4A4A',
            }}
          >
            NextBlock is the open protocol enabling authorized reinsurers, insurers, and asset managers to tokenize real insurance portfolios.
          </p>
        </motion.div>

        {/* Right Column - Image (45% on desktop) */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="lg:col-span-5 order-2"
        >
          <div
            className="relative overflow-hidden transition-all duration-300"
            style={{
              borderRadius: '12px',
              border: '1px solid rgba(0,0,0,0.06)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(27, 58, 107, 0.15)';
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.06)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(0,0,0,0.06)';
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
            }}
          >
            <img
              src={"/assets/our-vision-venice.png"}
              alt="Venetian merchant at desk with Grand Canal view"
              style={{
                width: '100%',
                maxHeight: '500px',
                objectFit: 'cover',
                display: 'block',
              }}
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default OurVisionSection;