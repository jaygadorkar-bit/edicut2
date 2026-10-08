import { WhyHireUsFilm } from "./WhyHireUsFilm";

export function WhyHireUsSection() {
  return (
    <section id="why-hire-us" aria-label="Why hire the EdiCut studio" className="why-hire border-b neo-line px-5 py-14 sm:px-6 sm:py-20">
      <div className="why-hire__inner">
        <WhyHireUsFilm showPlanButton={false} />
      </div>
    </section>
  );
}

// The nearby headings explain these decorative illustrations to screen readers.
export function TeamArtwork() {
  return (
    <svg viewBox="0 0 320 220" fill="none" aria-hidden="true" focusable="false">
      <circle cx="160" cy="100" r="84" className="why-art-halo" />
      <path d="M160 119v23H79v21m81-21h81v21" className="why-art-connector" />
      <circle cx="160" cy="142" r="4" className="why-art-accent" />
      <g className="why-art-raised">
        <circle cx="160" cy="76" r="49" className="why-art-surface" />
        <circle cx="160" cy="76" r="39" className="why-art-inset" />
        <path d="M132 104c0-20 56-20 56 0" className="why-art-accent" />
        <path d="M152 83h16v14c-6 5-10 5-16 0V83Z" fill="#e5bda6" />
        <ellipse cx="160" cy="66" rx="17" ry="21" fill="#f0d3bf" />
        <path d="M143 64c-4-23 39-28 35 3-5-1-8-7-9-13-5 8-17 9-26 10Z" className="why-art-ink" />
        <path d="M139 65v14m42-14v14m-1-1c0 8-4 11-13 11" className="why-art-line" />
        <rect x="135" y="66" width="7" height="13" rx="3" className="why-art-ink" />
        <rect x="178" y="66" width="7" height="13" rx="3" className="why-art-ink" />
      </g>
      {[28, 188].map((x) => (
        <g key={x} className="why-art-raised">
          <rect x={x} y="156" width="104" height="54" rx="16" className="why-art-surface" />
          <circle cx={x + 25} cy="183" r="16" className="why-art-inset" />
          <circle cx={x + 25} cy="178" r="5" className="why-art-slate" />
          <path d={`M${x + 16} 192c0-12 18-12 18 0`} className="why-art-slate" />
          <rect x={x + 48} y="175" width="37" height="5" rx="2.5" className="why-art-slate" />
          <rect x={x + 48} y="186" width="25" height="4" rx="2" className="why-art-inset" />
          <path d={`m${x + 83} 190 3 3 6-7`} className="why-art-check" />
        </g>
      ))}
      <g className="why-art-raised" transform="rotate(-9 69 63)">
        <rect x="42" y="33" width="51" height="61" rx="12" className="why-art-surface" />
        <path d="M54 48h26m-26 10h26m-26 10h16" className="why-art-connector" />
        <path d="m56 79 4 4 9-9" className="why-art-check" />
      </g>
      <circle cx="239" cy="63" r="19" className="why-art-surface why-art-raised" />
      <path d="m231 63 5 5 11-12" className="why-art-check" />
    </svg>
  );
}

export function QualityArtwork() {
  return (
    <svg viewBox="0 0 320 220" fill="none" aria-hidden="true" focusable="false">
      <circle cx="160" cy="104" r="86" className="why-art-halo" />
      <g className="why-art-raised">
        <rect x="39" y="35" width="242" height="157" rx="20" className="why-art-surface" />
        <rect x="51" y="47" width="218" height="104" rx="11" className="why-art-inset" />
        <circle cx="225" cy="74" r="13" fill="#b7c8d7" />
        <path d="m59 138 53-64 45 55 31-33 65 42H59Z" fill="#b2c2cf" />
        <path d="m90 138 49-41 32 41H90Z" fill="#91a7b9" />
        <rect x="130" y="79" width="60" height="43" rx="14" className="why-art-accent" />
        <path d="m155 91 14 10-14 10V91Z" fill="white" />
        <path d="M62 58h18m-18 0v14m196-14h-18m18 0v14M62 139h18m-18 0v-14m196 14h-18m18 0v-14" stroke="white" strokeWidth="2" strokeLinecap="round" />
        <rect x="55" y="162" width="67" height="15" rx="4" className="why-art-slate" />
        <rect x="126" y="162" width="44" height="15" rx="4" className="why-art-accent" />
        <rect x="174" y="162" width="91" height="15" rx="4" className="why-art-inset" />
        <path d="M144 156v27" className="why-art-line" />
      </g>
      <g className="why-art-raised" transform="rotate(-10 45 112)">
        <rect x="18" y="82" width="48" height="67" rx="13" className="why-art-surface" />
        <circle cx="33" cy="99" r="6" className="why-art-accent" />
        <circle cx="51" cy="99" r="6" className="why-art-ink" />
        <circle cx="33" cy="119" r="6" className="why-art-slate" />
        <circle cx="51" cy="119" r="6" className="why-art-inset" />
        <path d="M30 136h24" className="why-art-connector" />
      </g>
      <circle cx="268" cy="43" r="25" className="why-art-accent why-art-raised" />
      <path d="m257 43 7 7 15-16" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DeliveryArtwork() {
  return (
    <svg viewBox="0 0 320 220" fill="none" aria-hidden="true" focusable="false">
      <circle cx="160" cy="110" r="86" className="why-art-halo" />
      <g className="why-art-raised" transform="rotate(-7 116 115)">
        <rect x="35" y="47" width="171" height="143" rx="20" className="why-art-surface" />
        <path d="M35 68c0-12 8-21 20-21h131c12 0 20 9 20 21v13H35V68Z" fill="#f3dfe2" />
        <path d="M72 38v20m99-20v20" className="why-art-line" />
        {[99, 127, 155].map((y) => [56, 88, 120, 152].map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="19" height="17" rx="5" className="why-art-inset" />))}
        <path d="m59 107 4 4 8-9m20 33 4 4 8-9m20 5 4 4 8-9m-8 31 4 4 8-9" className="why-art-check" />
      </g>
      <g className="why-art-raised" transform="rotate(8 223 114)">
        <rect x="158" y="59" width="117" height="78" rx="13" className="why-art-surface" />
        <rect x="166" y="67" width="101" height="62" rx="7" className="why-art-slate" />
        <path d="m208 83 21 14-21 14V83Z" fill="white" />
      </g>
      <g className="why-art-raised" transform="rotate(-6 224 146)">
        <rect x="161" y="103" width="124" height="83" rx="14" className="why-art-surface" />
        <rect x="169" y="111" width="108" height="67" rx="8" className="why-art-inset" />
        <path d="m170 165 33-38 30 38h-63Z" fill="#b2c2cf" />
        <rect x="243" y="111" width="34" height="67" rx="8" className="why-art-accent" />
        <path d="m205 132 20 13-20 13v-26Z" fill="white" />
      </g>
      <circle cx="257" cy="181" r="20" className="why-art-surface why-art-raised" />
      <path d="m248 181 5 5 12-13" className="why-art-check" />
      <path d="M250 43h30m0 0-10-10m10 10-10 10" className="why-art-check" />
    </svg>
  );
}
