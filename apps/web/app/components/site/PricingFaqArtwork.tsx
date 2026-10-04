// The section heading and questions describe this decorative package illustration.
export function PricingFaqArtwork() {
  return (
    <svg viewBox="0 0 360 290" fill="none" aria-hidden="true" focusable="false">
      <circle cx="177" cy="147" r="127" className="pack-faq-art-halo" />

      <g className="pack-faq-art-raised" transform="rotate(-7 134 151)">
        <rect x="49" y="41" width="174" height="220" rx="21" className="pack-faq-art-surface" />
        <rect x="97" y="30" width="79" height="25" rx="9" className="pack-faq-art-inset" />
        <rect x="116" y="39" width="41" height="6" rx="3" className="pack-faq-art-slate" />

        <rect x="65" y="72" width="142" height="80" rx="12" className="pack-faq-art-inset" />
        <path d="m73 138 28-37 29 37H73Zm50 0 28-47 48 47h-76Z" className="pack-faq-art-landscape" />
        <circle cx="182" cy="93" r="9" className="pack-faq-art-slate" />
        <rect x="116" y="94" width="41" height="34" rx="11" className="pack-faq-art-accent" />
        <path d="m132 103 12 8-12 8v-16Z" fill="white" />

        {[174, 202, 230].map((y, index) => (
          <g key={y}>
            <rect x="66" y={y - 7} width="19" height="19" rx="6" className="pack-faq-art-inset" />
            <path d={`m71 ${y + 2} 3 3 6-7`} className="pack-faq-art-check" />
            <rect x="96" y={y - 4} width={index === 1 ? 68 : 91} height="5" rx="2.5" className="pack-faq-art-slate" />
            <rect x="96" y={y + 5} width={index === 1 ? 47 : 66} height="4" rx="2" className="pack-faq-art-inset" />
          </g>
        ))}
      </g>

      <g className="pack-faq-art-raised" transform="rotate(9 271 111)">
        <rect x="218" y="61" width="105" height="99" rx="16" className="pack-faq-art-surface" />
        <path d="M234 61h73c9 0 16 7 16 16v14H218V77c0-9 7-16 16-16Z" className="pack-faq-art-calendar-head" />
        <path d="M243 53v17m54-17v17" className="pack-faq-art-line" />
        {[105, 126].map((y) => [233, 258, 283].map((x) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="15" height="12" rx="4" className="pack-faq-art-inset" />
        )))}
        <path d="m259 130 4 4 8-9" className="pack-faq-art-check" />
      </g>

      <g className="pack-faq-art-raised">
        <circle cx="267" cy="216" r="54" className="pack-faq-art-surface" />
        <circle cx="267" cy="216" r="43" className="pack-faq-art-inset" />
        <path d="M267 184v5m0 54v5m-32-32h5m54 0h5" className="pack-faq-art-clock-tick" />
        <path d="M267 194v22l15 9" className="pack-faq-art-line" />
        <circle cx="267" cy="216" r="4" className="pack-faq-art-accent" />
      </g>

      <g className="pack-faq-art-raised">
        <circle cx="310" cy="57" r="23" className="pack-faq-art-accent" />
        <path d="m300 57 6 6 14-15" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
