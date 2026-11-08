import { useId } from "react";

/** Decorative editorial illustrations; all of their meaning is in the adjacent story. */
export function HireEdicutArtwork({ kind }: { kind: "managed" | "craft" | "plans" }) {
  const clipId = `hire-recording-${useId().replace(/:/g, "")}`;
  return <svg className={`hire-art hire-art--${kind}`} viewBox="0 0 600 460" fill="none" aria-hidden="true" focusable="false">
    <defs><clipPath id={clipId}><rect width="248" height="140" rx="10" /></clipPath></defs>
    {kind === "managed" ? <>
      <path d="M103 115C117 59 219 43 283 68M481 335c-2 42-75 70-137 58" className="hire-art__connector" />
      <g className="hire-art__raised">
        <rect x="82" y="107" width="442" height="273" rx="23" className="hire-art__paper" />
        <path d="M82 163h442" className="hire-art__line" />
        <text x="108" y="142" className="hire-art__heading">Your next upload</text>
        <circle cx="493" cy="137" r="5" className="hire-art__green-fill" />
        <rect x="104" y="188" width="136" height="165" rx="12" className="hire-art__inset" />
        {["Your brief", "The edit", "Your review"].map((label, index) => <g key={label} transform={`translate(121 ${220 + index * 47})`}>
          <circle r="10" className={index === 1 ? "hire-art__red-fill" : "hire-art__paper-fill"} />
          {index === 0 ? <path d="m-4 0 3 3 6-7" className="hire-art__green-stroke" /> : index === 1 ? <path d="m-2-4 6 4-6 4Z" fill="white" /> : <path d="M-4-3h8v5H0l-3 3V2h-1Z" className="hire-art__slate-stroke" />}
          <text x="18" y="5" className="hire-art__small">{label}</text>
        </g>)}
        <g transform="translate(255 187)" clipPath={`url(#${clipId})`}>
          <image width="248" height="140" href="/artwork/why-hire-us/creator-recording-scene-b93b36d3.svg" preserveAspectRatio="xMidYMid slice" />
        </g>
        <rect x="259" y="344" width="241" height="4" rx="2" className="hire-art__track-fill" />
        <rect x="259" y="344" width="166" height="4" rx="2" className="hire-art__red-fill" />
      </g>
      <g className="hire-art__raised" transform="rotate(-5 149 83)">
        <rect x="39" y="42" width="247" height="79" rx="19" className="hire-art__paper" />
        <circle cx="82" cy="81" r="27" className="hire-art__sage-fill" />
        <image x="54" y="53" width="56" height="56" href="/artwork/why-hire-us/manager.svg" />
        <text x="122" y="75" className="hire-art__label">Your project manager</text>
        <text x="122" y="96" className="hire-art__small">Keeps the pieces together</text>
      </g>
      <g className="hire-art__raised" transform="rotate(5 434 377)">
        <rect x="327" y="344" width="226" height="75" rx="17" className="hire-art__paper" />
        <circle cx="362" cy="381" r="18" className="hire-art__sage-fill" />
        <path d="m355 381 5 5 10-11" className="hire-art__green-stroke" />
        <text x="392" y="377" className="hire-art__label">Feedback, connected.</text>
        <text x="392" y="397" className="hire-art__small">One shared workspace</text>
      </g>
    </> : kind === "craft" ? <>
      <path d="M125 68c88-30 210-30 299 11M507 305c17 47-19 89-76 98" className="hire-art__connector" />
      <g className="hire-art__raised">
        <rect x="89" y="81" width="429" height="280" rx="23" className="hire-art__paper" />
        <text x="115" y="114" className="hire-art__heading">A considered cut.</text>
        <g transform="translate(110 131)">
          <svg width="387" height="171" viewBox="0 0 248 140" preserveAspectRatio="xMidYMid slice" overflow="hidden">
            <g clipPath={`url(#${clipId})`}><image width="248" height="140" href="/artwork/why-hire-us/creator-recording-scene-b93b36d3.svg" preserveAspectRatio="xMidYMid slice" /></g>
          </svg>
          <path d="M12 26V12h18m345 14V12h-18M12 145v14h18m345-14v14h-18" stroke="white" strokeWidth="2" strokeLinecap="round" />
        </g>
        <rect x="110" y="315" width="90" height="18" rx="5" className="hire-art__slate-fill" />
        <rect x="205" y="315" width="126" height="18" rx="5" className="hire-art__red-fill" />
        <rect x="336" y="315" width="161" height="18" rx="5" className="hire-art__track-fill" />
        <path d="M254 308v33" className="hire-art__ink-stroke" />
      </g>
      <g className="hire-art__raised" transform="rotate(-8 101 234)">
        <rect x="39" y="165" width="107" height="144" rx="18" className="hire-art__paper" />
        <text x="57" y="194" className="hire-art__label">Color</text>
        <circle cx="70" cy="221" r="13" className="hire-art__red-fill" />
        <circle cx="113" cy="221" r="13" className="hire-art__slate-fill" />
        <circle cx="70" cy="261" r="13" fill="#e0b6a1" />
        <circle cx="113" cy="261" r="13" className="hire-art__sage-fill" />
        <path d="M58 288h68" className="hire-art__line" />
      </g>
      <g className="hire-art__raised" transform="rotate(5 469 80)">
        <rect x="382" y="39" width="167" height="73" rx="17" className="hire-art__paper" />
        <circle cx="415" cy="75" r="17" className="hire-art__sage-fill" />
        <path d="m409 75 4 4 9-10" className="hire-art__green-stroke" />
        <text x="442" y="73" className="hire-art__label">Studio</text>
        <text x="442" y="92" className="hire-art__small">review</text>
      </g>
      <g className="hire-art__raised">
        <rect x="148" y="345" width="313" height="66" rx="16" className="hire-art__paper" />
        <text x="169" y="384" className="hire-art__label">Sound</text>
        {Array.from({ length: 26 }, (_, index) => {
          const height = 8 + (index * 17 + 7) % 25;
          return <rect key={index} x={237 + index * 7.3} y={378 - height / 2} width="3" height={height} rx="1.5" className={index % 4 === 0 ? "hire-art__red-fill" : "hire-art__slate-fill"} />;
        })}
      </g>
    </> : <>
      <path d="M100 131c-8-52 50-85 114-79m202 325c64 27 123-3 125-61" className="hire-art__connector" />
      <g className="hire-art__raised" transform="rotate(-9 216 233)">
        <rect x="74" y="74" width="250" height="314" rx="22" className="hire-art__paper" />
        <rect x="96" y="98" width="51" height="51" rx="15" className="hire-art__inset" />
        <path d="m117 112 16 11-16 11Z" className="hire-art__red-fill" />
        <text x="98" y="188" className="hire-art__plan-heading">Single video</text>
        <text x="98" y="213" className="hire-art__label">One focused project</text>
        <path d="M98 237h201" className="hire-art__line" />
        <text x="98" y="267" className="hire-art__small">A defined deliverable</text>
        <text x="98" y="293" className="hire-art__small">Clear footage limits</text>
        <text x="98" y="319" className="hire-art__small">Agreed revision rounds</text>
        <path d="M98 351h85" className="hire-art__red-stroke" />
      </g>
      <g className="hire-art__raised" transform="rotate(8 407 245)">
        <rect x="294" y="99" width="250" height="314" rx="22" className="hire-art__paper" />
        <rect x="316" y="123" width="51" height="51" rx="15" className="hire-art__inset" />
        <path d="M333 140h18l-4-4m4 4-4 4m3 14h-18l4 4m-4-4 4-4" className="hire-art__red-stroke" />
        <text x="318" y="213" className="hire-art__plan-heading">Monthly plan</text>
        <text x="318" y="238" className="hire-art__label">Room for recurring work</text>
        <path d="M318 262h201" className="hire-art__line" />
        <text x="318" y="292" className="hire-art__small">Reserved editing hours</text>
        <text x="318" y="318" className="hire-art__small">Editing and revisions</text>
        <text x="318" y="344" className="hire-art__small">Scope that fits your work</text>
        <path d="M318 376h85" className="hire-art__red-stroke" />
      </g>
      <image x="430" y="38" width="101" height="44" href="/icons/edicut-logo.svg" preserveAspectRatio="xMidYMid meet" />
    </>}
  </svg>;
}
