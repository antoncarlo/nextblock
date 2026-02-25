const baseLogo = "/assets/base-logo.webp";
const ethereumLogo = "/assets/ethereum-logo.png";

const techBadges = [
  {
    name: "Base",
    icon: <img src={baseLogo} alt="Base" className="w-5 h-5 object-contain" />,
  },
  {
    name: "Ethereum",
    icon: <img src={ethereumLogo} alt="Ethereum" className="w-5 h-5 object-contain" />,
  },
  {
    name: "Compliant Infrastructure",
    icon: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
        <path d="M10 2L3 5V11C3 14.87 6.13 18.43 10 19C13.87 18.43 17 14.87 17 11V5L10 2Z" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 10L9 12L13 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    name: "Institutional Custody",
    icon: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
        <rect x="3" y="8" width="14" height="10" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6 8V5C6 3.34 7.79 2 10 2C12.21 2 14 3.34 14 5V8" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    name: "On-Chain Settlement",
    icon: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
        <circle cx="7" cy="7" r="3" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="13" cy="13" r="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M9.5 9.5L10.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
];

const KeyBenefitsSection = () => {
  return (
    <section 
      className="py-12 overflow-hidden"
      style={{
        backgroundColor: '#FAFAF8',
        borderTop: '1px solid rgba(0,0,0,0.06)',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
      }}
    >
      <div className="relative">
        <div className="flex animate-scroll">
          {[...techBadges, ...techBadges].map((item, index) => (
            <div
              key={index}
              className="flex-shrink-0 px-12 py-4"
            >
              <span 
                className="flex items-center gap-2 transition-colors whitespace-nowrap"
                style={{ color: '#1B3A6B' }}
              >
                {item.icon}
                <span className="text-base font-medium tracking-wide">
                  {item.name}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default KeyBenefitsSection;
