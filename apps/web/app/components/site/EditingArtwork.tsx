import "../../styles/editing-artwork.css";

type EditingStage = "upload" | "edit" | "review" | "monthly";

/** Decorative scenes use the same raised surfaces and timeline colours as the homepage. */
export function EditingArtwork({ stage = "edit", timelineScene = false }: { stage?: EditingStage; timelineScene?: boolean }) {
  return <svg className={`editing-artwork editing-artwork--${stage}${timelineScene ? " editing-artwork--timeline" : ""}`} viewBox="0 0 360 270" fill="none" aria-hidden="true" focusable="false">
    <ellipse cx="181" cy="137" rx="138" ry="116" className="editing-artwork__halo" />
    {stage === "upload" ? <>
      <g className="editing-artwork__raised" transform="rotate(-8 140 116)">
        <rect x="55" y="39" width="151" height="166" rx="17" className="editing-artwork__surface" />
        <rect x="69" y="55" width="123" height="88" rx="10" className="editing-artwork__inset" />
        <path d="m78 131 29-37 28 37h-57Zm44 0 29-50 32 50h-61Z" className="editing-artwork__slate-light" />
        <circle cx="174" cy="74" r="8" className="editing-artwork__slate" />
        <rect x="72" y="159" width="94" height="6" rx="3" className="editing-artwork__slate" />
        <rect x="72" y="174" width="68" height="5" rx="2.5" className="editing-artwork__inset" />
      </g>
      <g className="editing-artwork__raised">
        <path d="M108 122c0-11 9-20 20-20h45l17 17h92c11 0 20 9 20 20v80c0 11-9 20-20 20H128c-11 0-20-9-20-20v-97Z" className="editing-artwork__surface" />
        <rect x="121" y="137" width="168" height="88" rx="13" className="editing-artwork__inset" />
        <path d="M206 197v-42m-17 17 17-17 17 17m-40 30v9h46v-9" className="editing-artwork__line" />
      </g>
      <g className="editing-artwork__float editing-artwork__raised">
        <circle cx="294" cy="78" r="29" className="editing-artwork__accent" />
        <path d="m282 78 8 8 16-18" className="editing-artwork__white-line" />
      </g>
    </> : stage === "monthly" ? <>
      <g className="editing-artwork__raised" transform="rotate(-5 163 136)">
        <rect x="55" y="43" width="224" height="187" rx="22" className="editing-artwork__surface" />
        <path d="M77 43h180c12 0 22 10 22 22v28H55V65c0-12 10-22 22-22Z" className="editing-artwork__rose" />
        <path d="M102 32v26m130-26v26" className="editing-artwork__line" />
        {[110, 146, 182].map((y) => [76, 113, 150, 187, 224].map((x, index) => <rect key={`${x}-${y}`} x={x} y={y} width="25" height="24" rx="7" className={index === 2 ? "editing-artwork__slate" : "editing-artwork__inset"} />))}
        <path d="m157 156 4 4 8-9" className="editing-artwork__white-line" />
      </g>
      <g className="editing-artwork__float editing-artwork__raised">
        <circle cx="278" cy="193" r="53" className="editing-artwork__surface" />
        <circle cx="278" cy="193" r="41" className="editing-artwork__inset" />
        <path d="M278 168v25l16 10" className="editing-artwork__line" />
        <circle cx="278" cy="193" r="4" className="editing-artwork__accent" />
      </g>
      <g className="editing-artwork__raised" transform="rotate(8 296 68)">
        <rect x="269" y="38" width="54" height="48" rx="14" className="editing-artwork__accent" />
        <path d="m289 52 17 11-17 11V52Z" fill="white" />
      </g>
    </> : <>
      <g className="editing-artwork__raised" transform="rotate(-4 172 140)">
        <rect x="43" y="45" width="254" height="187" rx="20" className="editing-artwork__surface" />
        <circle cx="62" cy="61" r="3" className="editing-artwork__slate" />
        <circle cx="73" cy="61" r="3" className="editing-artwork__slate" />
        <circle cx="84" cy="61" r="3" className="editing-artwork__slate" />
        <rect x="57" y="77" width="226" height="96" rx="11" className="editing-artwork__inset" />
        <g className="editing-artwork__scene editing-artwork__scene--landscape">
          <path d="m67 161 46-59 45 59H67Zm76 0 51-73 77 73H143Z" className="editing-artwork__slate-light" />
          <circle cx="252" cy="96" r="9" className="editing-artwork__slate" />
        </g>
        {timelineScene ? <>
          <g className="editing-artwork__scene editing-artwork__scene--city">
            <circle cx="247" cy="98" r="12" className="editing-artwork__rose" />
            <rect x="71" y="118" width="46" height="43" rx="5" className="editing-artwork__slate-light" />
            <rect x="123" y="94" width="52" height="67" rx="5" className="editing-artwork__slate" />
            <rect x="181" y="109" width="41" height="52" rx="5" className="editing-artwork__slate-light" />
            <rect x="228" y="128" width="43" height="33" rx="5" className="editing-artwork__slate" />
            <path d="M136 107h9m8 0h9m-26 12h9m8 0h9m-26 12h9m8 0h9M84 132h19m-19 12h19m90-22h16m-16 12h16m-16 12h16" stroke="#f4f7fa" strokeWidth="3" strokeLinecap="round" />
          </g>
          <g className="editing-artwork__scene editing-artwork__scene--audio">
            <g className="editing-artwork__waveform">
              {[16, 30, 44, 24, 56, 36, 62, 48, 28, 54, 38, 20, 42, 30, 14].map((height, index) => <rect key={index} x={74 + index * 13} y={125 - height / 2} width="7" height={height} rx="3.5" className={index > 5 && index < 9 ? "editing-artwork__rose" : "editing-artwork__slate"} />)}
            </g>
          </g>
        </> : <>
          <rect x="146" y="101" width="49" height="42" rx="13" className="editing-artwork__accent" />
          <path d="m164 111 15 11-15 11v-22Z" fill="white" />
        </>}
        <rect x="57" y="185" width="226" height="33" rx="9" className="editing-artwork__inset" />
        <rect x="66" y="194" width="51" height="15" rx="4" className="editing-artwork__slate-light" />
        <rect x="121" y="194" width="88" height="15" rx="4" className="editing-artwork__slate" />
        <rect x="213" y="194" width="59" height="15" rx="4" className="editing-artwork__rose" />
        <path d="M184 180v43" className="editing-artwork__accent-line editing-artwork__playhead" />
      </g>
      {stage === "review" ? <>
        <g className="editing-artwork__float editing-artwork__raised">
          <path d="M233 26h83c10 0 18 8 18 18v40c0 10-8 18-18 18h-41l-19 15v-15h-23c-10 0-18-8-18-18V44c0-10 8-18 18-18Z" className="editing-artwork__surface" />
          <path d="m250 64 12 12 26-28" className="editing-artwork__accent-line" />
          <rect x="298" y="54" width="17" height="5" rx="2.5" className="editing-artwork__slate" />
          <rect x="298" y="66" width="12" height="5" rx="2.5" className="editing-artwork__inset" />
        </g>
      </> : <g className="editing-artwork__float editing-artwork__raised" transform="rotate(9 294 77)">
        <rect x="262" y="42" width="65" height="65" rx="18" className="editing-artwork__surface" />
        <g className="editing-artwork__scissor-left"><circle cx="282" cy="85" r="6" className="editing-artwork__line" /><path d="m286 80 24-24" className="editing-artwork__line" /></g>
        <g className="editing-artwork__scissor-right"><circle cx="306" cy="85" r="6" className="editing-artwork__line" /><path d="m302 80-24-24" className="editing-artwork__line" /></g>
      </g>}
      {!timelineScene ? <g className="editing-artwork__raised">
        <circle cx="62" cy="219" r="27" className="editing-artwork__surface" />
        <path d="m51 219 8 8 15-17" className="editing-artwork__accent-line" />
      </g> : null}
    </>}
  </svg>;
}
