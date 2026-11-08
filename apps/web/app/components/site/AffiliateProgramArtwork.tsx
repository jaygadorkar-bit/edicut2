import { memo, useId, type CSSProperties, type ReactNode } from "react";

function Reveal({ at = 0, children }: { at?: number; children: ReactNode }) {
  return <g className="affiliate-art-reveal" style={{ "--reveal-at": at } as CSSProperties}>{children}</g>;
}

function Card({ x, y, width, height, children, inset = false }: { x: number; y: number; width: number; height: number; children?: ReactNode; inset?: boolean }) {
  return <g transform={`translate(${x} ${y})`}><rect width={width} height={height} rx="20" fill={inset ? "#dfe8ef" : "#f6f9fb"} stroke={inset ? "#d2dfe8" : "#fff"} className={inset ? undefined : "affiliate-art-card"} />{children}</g>;
}

function Person({ x, y, size = 74, manager = false }: { x: number; y: number; size?: number; manager?: boolean }) {
  return <g transform={`translate(${x} ${y})`}><circle cx={size / 2} cy={size / 2} r={size / 2 + 6} fill={manager ? "#dce9e3" : "#e7dfe8"} /><image href={manager ? "/artwork/why-hire-us/manager.svg" : "/artwork/affiliate/partner.svg"} width={size} height={size} /></g>;
}

function Check({ x, y, size = 22 }: { x: number; y: number; size?: number }) {
  return <g transform={`translate(${x} ${y})`}><circle r={size} fill="#dcece5" stroke="#f6fdf9" strokeWidth="3" /><path d={`M${-size * .42} 0l${size * .28} ${size * .3} ${size * .57} ${-size * .65}`} fill="none" stroke="#28715b" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" /></g>;
}

function Brand({ x, y, width = 150 }: { x: number; y: number; width?: number }) {
  return <image href="/icons/edicut-logo.svg" x={x} y={y} width={width} height={width * 506 / 1162} />;
}

function ShareScene() {
  return <>
    <path d="M159 180h77m167 0h78M320 114V67m0 226v-48" className="affiliate-art-connector" />
    <Reveal><Card x={228} y={120} width={184} height={128}><Brand x={28} y={27} width={128} /><text x="92" y="105" textAnchor="middle" className="affiliate-art-small">Your editing partner</text></Card></Reveal>
    <Reveal at={.4}><Person x={73} y={139} size={76} /><Card x={40} y={232} width={144} height={40}><text x="72" y="25" textAnchor="middle" className="affiliate-art-label">You recommend</text></Card></Reveal>
    <Reveal at={.8}><Person x={486} y={139} size={76} manager /><Card x={453} y={232} width={148} height={40}><text x="74" y="25" textAnchor="middle" className="affiliate-art-label">Creators discover</text></Card></Reveal>
    <Reveal at={1.2}><Card x={248} y={25} width={144} height={48}><path d="m24 24 7 7 13-15" fill="none" stroke="#28715b" strokeWidth="3" strokeLinecap="round" /><text x="58" y="30" className="affiliate-art-label">A good fit</text></Card></Reveal>
    <Reveal at={1.4}><Card x={224} y={292} width={192} height={49}><circle cx="25" cy="25" r="10" fill="#f0dce2" /><path d="M25 19v12m-6-6h12" stroke="#c91d37" strokeWidth="2.5" strokeLinecap="round" /><text x="45" y="30" className="affiliate-art-label">Shared opportunity</text></Card></Reveal>
  </>;
}

function ApplicationScene() {
  return <>
    <Reveal><Card x={136} y={43} width={330} height={278}><Brand x={24} y={20} width={99} /><text x="24" y="99" className="affiliate-art-heading">Partner application</text><text x="24" y="132" className="affiliate-art-small">Your contact details</text><rect x="24" y="145" width="282" height="34" rx="9" fill="#e5edf3" /><text x="38" y="167" className="affiliate-art-label">WhatsApp + social profiles</text><text x="24" y="207" className="affiliate-art-small">How you would share EdiCut</text><rect x="24" y="219" width="189" height="6" rx="3" fill="#c2d0dc" /><rect x="24" y="234" width="248" height="6" rx="3" fill="#d4dfe8" /><rect x="24" y="249" width="222" height="6" rx="3" fill="#d4dfe8" /></Card></Reveal>
    <Reveal at={.65}><Person x={447} y={72} size={76} manager /></Reveal>
    <Reveal at={1.1}><Card x={330} y={252} width={242} height={76}><Check x={36} y={38} size={18} /><text x="68" y="32" className="affiliate-art-label">Reviewed by our team</text><text x="68" y="53" className="affiliate-art-small">Individual terms confirmed</text></Card></Reveal>
  </>;
}

function LinkScene() {
  return <>
    <Reveal><Card x={66} y={55} width={366} height={141}><circle cx="43" cy="43" r="24" fill="#e3eaf1" /><path d="m34 46 8-8m-13 1 5-5a8 8 0 0 1 11 11l-3 3m-7-3-3 3a8 8 0 0 0 11 11l5-5" transform="translate(3 -5)" stroke="#536779" strokeWidth="3" fill="none" strokeLinecap="round" /><text x="82" y="39" className="affiliate-art-heading">Your referral link</text><text x="82" y="63" className="affiliate-art-small">A personal path to EdiCut</text><rect x="23" y="87" width="320" height="32" rx="8" fill="#e3ebf2" /><text x="38" y="108" className="affiliate-art-label">edicut.com · your referral code</text></Card></Reveal>
    <Reveal at={.65}><g transform="rotate(-6 417 244)"><Card x={290} y={177} width={282} height={139}><path d="M203 9v121" stroke="#c5d3df" strokeWidth="2" strokeDasharray="5 7" /><text x="24" y="35" className="affiliate-art-small">Your customer coupon</text><text x="24" y="77" fill="#c91d37" fontSize="32" fontWeight="750" letterSpacing="-1">YOURCODE</text><text x="24" y="107" className="affiliate-art-small">Ready to share after approval</text><path d="m222 63 12 12 22-27" fill="none" stroke="#28715b" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></Card></g></Reveal>
    <Reveal at={1.1}><Person x={97} y={239} size={64} /><path d="M185 275h61m0 0-9-9m9 9-9 9" className="affiliate-art-connector" /></Reveal>
  </>;
}

function RewardsScene() {
  return <>
    <Reveal><Card x={191} y={69} width={257} height={246}><Brand x={28} y={20} width={106} /><text x="27" y="101" className="affiliate-art-heading">Editing package</text><rect x="28" y="122" width="199" height="7" rx="3.5" fill="#c5d3df" /><rect x="28" y="139" width="148" height="7" rx="3.5" fill="#d4dfe8" /><path d="M28 172h199" stroke="#d3dfe8" strokeDasharray="5 5" /><Check x={48} y={209} size={18} /><text x="77" y="215" className="affiliate-art-label">Payment confirmed</text></Card></Reveal>
    <Reveal at={.6}><Card x={24} y={187} width={182} height={128}><text x="22" y="30" className="affiliate-art-small">For your customer</text><text x="22" y="83" fill="#c91d37" fontSize="48" fontWeight="750" letterSpacing="-2">10%</text><text x="22" y="110" className="affiliate-art-label">Coupon discount</text></Card></Reveal>
    <Reveal at={1.2}><Card x={421} y={35} width={178} height={137}><text x="21" y="31" className="affiliate-art-small">For you</text><text x="21" y="84" fill="#28715b" fontSize="48" fontWeight="750" letterSpacing="-2">10%</text><text x="21" y="111" className="affiliate-art-label">Commission</text></Card></Reveal>
    <text x="320" y="350" textAnchor="middle" className="affiliate-art-small">Default rates · eligible paid orders · individual terms may differ</text>
  </>;
}

function DashboardScene() {
  return <>
    <Reveal><Card x={64} y={40} width={512} height={277}>
      <rect x="0" y="0" width="118" height="277" rx="20" fill="#e5edf3" />
      <Brand x={17} y={20} width={83} />
      <rect x="16" y="91" width="85" height="29" rx="8" fill="#f5f8fa" />
      <text x="27" y="110" className="affiliate-art-label">Affiliates</text>
      <rect x="25" y="142" width="67" height="5" rx="2.5" fill="#bdccd9" />
      <rect x="25" y="164" width="48" height="5" rx="2.5" fill="#cbd8e2" />
      <text x="142" y="42" className="affiliate-art-heading">Your partner dashboard</text>
      <text x="142" y="66" className="affiliate-art-small">Every referral, in one place</text>
      <Card x={141} y={88} width={104} height={80} inset>
        <text x="13" y="26" className="affiliate-art-small">Orders</text>
        <path d="M14 62h12l8-5 9 3 16-10 15 6 15-9" stroke="#536779" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Card>
      <Card x={256} y={88} width={104} height={80} inset>
        <text x="13" y="26" className="affiliate-art-small">Earnings</text>
        <path d="M17 62v-3m16 3v-6m16 6v-9m16 9v-12m16 12v-16" stroke="#28715b" strokeWidth="8" strokeLinecap="round" />
      </Card>
      <Card x={371} y={88} width={119} height={80} inset>
        <text x="12" y="26" className="affiliate-art-small">Payout requests</text>
        <Check x={58} y={55} size={11} />
      </Card>
      <path d="M142 186h345m-345 29h345m-345 29h345" stroke="#d5dfe8" />
      <text x="143" y="204" className="affiliate-art-label">Attributed orders</text>
      <text x="143" y="233" className="affiliate-art-label">Payment status</text>
      <text x="143" y="262" className="affiliate-art-label">Payout history</text>
      <path d="m451 197 5 5 9-10m-14 36 5 5 9-10m-14 36 5 5 9-10" stroke="#28715b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Card></Reveal>
    <Reveal at={.85}><Card x={352} y={285} width={211} height={51}><circle cx="27" cy="26" r="14" fill="#f0dce2" /><path d="M21 26h12m-5-5 5 5-5 5" stroke="#c91d37" fill="none" strokeWidth="2.5" strokeLinecap="round" /><text x="51" y="32" className="affiliate-art-label">Request your payout</text></Card></Reveal>
  </>;
}

function ClosingScene() {
  return <>
    <path d="M164 197h312" className="affiliate-art-connector" />
    <Reveal><Card x={183} y={90} width={274} height={183}><Brand x={44} y={35} width={186} /><text x="137" y="147" textAnchor="middle" className="affiliate-art-label">Share good editing. Grow together.</text></Card></Reveal>
    <Reveal at={.5}><Person x={69} y={154} size={78} /></Reveal>
    <Reveal at={.9}><Person x={490} y={154} size={78} manager /></Reveal>
    <Reveal at={1.3}><Check x={320} y={305} size={24} /></Reveal>
  </>;
}

const scenes = [ShareScene, ApplicationScene, LinkScene, RewardsScene, DashboardScene, ClosingScene];

export const AffiliateProgramArtwork = memo(function AffiliateProgramArtwork({ scene }: { scene: number }) {
  const id = useId().replace(/:/g, "");
  const Scene = scenes[scene] ?? ShareScene;
  return <svg viewBox="0 0 640 380" fill="none" aria-hidden="true" focusable="false" className="affiliate-artwork">
    <defs><radialGradient id={`affiliate-halo-${id}`}><stop stopColor="#dbe6ef" /><stop offset="1" stopColor="#dbe6ef" stopOpacity="0" /></radialGradient></defs>
    <ellipse cx="320" cy="194" rx="306" ry="181" fill={`url(#affiliate-halo-${id})`} /><Scene />
  </svg>;
});
