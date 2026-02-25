"use client";
import { motion } from "framer-motion";
import { SectionConnector } from "./FlowchartLines";
import DecorativeGrid from "./DecorativeGrid";

const AboutSection = () => {
  const stats = [
    { 
      value: "$16T", 
      label: "Global Insurance Market",
    },
    { 
      value: "$700B+", 
      label: "Annual Reinsurance Capital",
    },
    { 
      value: "<1%", 
      label: "Currently Tokenized",
    },
  ];

  return (
    <section 
      id="about" 
      className="relative px-6 overflow-hidden"
      style={{ 
        padding: '100px 24px',
        backgroundColor: '#F2F1EE',
        zIndex: 1,
      }}
    >
      {/* Section connector */}
      <SectionConnector fromSide="left" />
      
      {/* Decorative grid at bottom */}
      <DecorativeGrid variant="light" position="bottom" />

      <div className="mx-auto relative z-10" style={{ maxWidth: '1100px' }}>
        {/* Main heading */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center"
          style={{ marginBottom: '48px' }}
        >
          <h2 
            className="text-4xl md:text-5xl lg:text-6xl font-medium leading-tight"
            style={{ color: '#0F1218' }}
          >
            The Largest RWA Opportunity
            <br />
            <span style={{ color: '#1B3A6B' }}>Still Untouched</span>
          </h2>
        </motion.div>

        {/* Stats in organic layout */}
        <div className="relative">
          {/* Vertical connection line */}
          <motion.div 
            className="absolute left-1/2 top-0 bottom-0 w-px hidden md:block"
            style={{ background: 'linear-gradient(to bottom, transparent, rgba(27,58,107,0.2) 10%, rgba(27,58,107,0.2) 90%, transparent)' }}
            initial={{ scaleY: 0 }}
            whileInView={{ scaleY: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.2 }}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            {stats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, x: index % 2 === 0 ? -30 : 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.15 }}
                className={`relative flex items-center ${
                  index % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"
                }`}
                style={{ gap: '32px' }}
              >
                {/* Connection node */}
                <motion.div 
                  className="absolute left-1/2 hidden md:flex items-center justify-center"
                  style={{ transform: 'translateX(calc(-50% - 12px))' }}
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.3 + index * 0.15 }}
                >
                  <div 
                    className="w-4 h-4 rounded-full"
                    style={{ 
                      background: 'rgba(27,58,107,0.1)',
                      border: '2px solid rgba(27,58,107,0.3)'
                    }}
                  >
                    <div className="w-full h-full rounded-full flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#1B3A6B' }} />
                    </div>
                  </div>
                </motion.div>

                {/* Stat content */}
                <div className={`flex-1 ${index % 2 === 0 ? "md:text-right md:pr-12" : "md:text-left md:pl-12"} text-center`}>
                  <motion.div 
                    className="text-4xl md:text-6xl stat-number mb-2"
                    initial={{ opacity: 0, scale: 0.9 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.2 + index * 0.15, type: "spring" }}
                  >
                    {stat.value}
                  </motion.div>
                  <div 
                    className="text-lg font-medium mb-2"
                    style={{ color: '#1A1F2E' }}
                  >
                    {stat.label}
                  </div>
                </div>

                {/* Empty space for alternating layout */}
                <div className="flex-1 hidden md:block" />
              </motion.div>
            ))}
          </div>
        </div>

        {/* Bottom tagline */}
        <motion.p
          className="text-center text-xl md:text-2xl lg:text-3xl mt-12 font-serif italic"
          style={{ 
            color: '#0F1218',
            fontFamily: "'Playfair Display', serif",
          }}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          Treasuries have protocols. Credit has protocols. Insurance doesn't.
        </motion.p>
      </div>
    </section>
  );
};

export default AboutSection;
