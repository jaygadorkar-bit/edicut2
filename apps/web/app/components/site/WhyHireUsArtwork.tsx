import { memo, useId } from "react";
import type { CSSProperties, ReactNode } from "react";

function Motion({ at = 0, duration = .65, kind = "reveal", children }: { at?: number; duration?: number; kind?: "reveal" | "draw" | "wipe"; children: ReactNode }) {
  return <g className={`offer-motion offer-motion--${kind}`} style={{ "--motion-start": at, "--motion-duration": `${duration}s` } as CSSProperties}>{children}</g>;
}

function Card({ x, y, width, height, children, inset = false }: { x: number; y: number; width: number; height: number; children?: ReactNode; inset?: boolean }) {
  return <g transform={`translate(${x} ${y})`} className={inset ? "offer-inset" : "offer-card"}>
    <rect width={width} height={height} rx="18" fill={inset ? "#e7edf2" : "var(--offer-card-fill)"} stroke={inset ? "#dae3ea" : "#faffff"} />{children}
  </g>;
}

function Tick({ x, y, color = "#28715b" }: { x: number; y: number; color?: string }) {
  return <path d={`M${x} ${y + 7}l5 5 11-12`} stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />;
}

type FilmCharacter = "creator" | "editor" | "manager";

function Portrait({ x, y, size, character = "creator" }: { x: number; y: number; size: number; character?: FilmCharacter }) {
  return <image x={x} y={y} width={size} height={size} href={`/artwork/why-hire-us/${character}.svg`} preserveAspectRatio="xMidYMid meet" />;
}

function Logo({ x, y, width, height }: { x: number; y: number; width: number; height: number }) {
  return <image x={x} y={y} width={width} height={height} href="/icons/edicut-logo.svg" preserveAspectRatio="xMidYMid meet" />;
}

function Avatar({ x, y, manager = false, creator = false }: { x: number; y: number; manager?: boolean; creator?: boolean }) {
  return <g transform={`translate(${x} ${y})`}>
    <circle r="27" fill={manager ? "#dae8e1" : creator ? "#f0dde1" : "#dbe8e3"} />
    <Portrait x={-27} y={-27} size={54} character={manager ? "manager" : creator ? "creator" : "editor"} />
  </g>;
}

function Video({ x, y, width = 230, height = 130, captions = false }: { x: number; y: number; width?: number; height?: number; captions?: boolean }) {
  return <svg x={x} y={y} width={width} height={height} viewBox="0 0 230 130">
    <rect width="230" height="130" rx="12" fill="#dbe8e3" />
    <path d="M0 19h230M0 92h230" stroke="#c8dbd3" strokeWidth="1" opacity=".55" />
    <path d="M73 12h143v77H73z" fill="#e7f0ec" opacity=".48" />
    <rect x="13" y="16" width="49" height="73" rx="6" fill="#adccc0" />
    <path d="M25 36h25M25 47h25M25 58h18" stroke="#eaf3ef" strokeWidth="3" strokeLinecap="round" />
    <path d="M189 117V46m0 35-14-15m14-7 13-12" stroke="#9ab9aa" strokeWidth="3" strokeLinecap="round" />
    <path d="M180 119h19l-2 7h-15z" fill="#c8d9d2" />

    <Portrait x={53} y={0} size={130} />
    <path d="M160 108V87a5 5 0 0 1 10 0v21" fill="#344657" />
    <path d="M160 108v13m-8 0h16" stroke="#344657" strokeWidth="2" strokeLinecap="round" />
    {captions ? <g><rect x="38" y="99" width="158" height="22" rx="5" fill="#17202a" /><text x="117" y="114" textAnchor="middle" fill="white" fontSize="10" fontWeight="650">Your story, beautifully told.</text></g> : null}
  </svg>;
}

function Waveform({ x, y, width = 210 }: { x: number; y: number; width?: number }) {
  return <g transform={`translate(${x} ${y})`}>{Array.from({ length: 30 }, (_, i) => {
    const h = 5 + (i * 19 + 7) % 23;
    return <rect key={i} x={i * width / 30} y={16 - h / 2} width="3" height={h} rx="1.5" fill={i % 3 ? "#a0b4c2" : "#c91d37"} />;
  })}</g>;
}

function TeamScene() {
  return <>
    <Card x={145} y={76} width={376} height={271}>
      <text x="24" y="32" className="offer-label">Made for your channel</text><circle cx="350" cy="28" r="4" fill="#28715b" />
      <Video x={23} y={51} width={330} height={180} captions />
      <rect x="24" y="244" width="234" height="5" rx="2.5" fill="#d3dee6" /><rect x="24" y="244" width="160" height="5" rx="2.5" fill="#c91d37" />
    </Card>
    <Motion at={.65}><Card x={29} y={130} width={196} height={91}><Avatar x={39} y={43} /><text x="78" y="35" className="offer-label">Your editor</text><text x="78" y="54" className="offer-small">Knows your style</text><path d="M78 69h94" stroke="#d5dfe7" strokeWidth="3" strokeLinecap="round" /></Card></Motion>
    <Motion at={4.96}><Card x={328} y={295} width={242} height={88}><Avatar x={40} y={43} manager /><text x="79" y="35" className="offer-label">Your project manager</text><text x="79" y="55" className="offer-small">Keeps everything on track</text><Tick x={80} y={65} /></Card></Motion>
    <Motion at={2.4} kind="draw" duration={1.1}><path d="M82 103c9-39 48-53 98-40" stroke="#c91d37" strokeWidth="2" strokeLinecap="round" pathLength="1" /><path d="m170 55 10 8-12 4" stroke="#c91d37" strokeWidth="2" strokeLinecap="round" pathLength="1" /></Motion>
  </>;
}

function CraftScene() {
  return <>
    <Card x={65} y={65} width={469} height={291}>
      <text x="23" y="32" className="offer-label">The studio finish</text><Logo x={393} y={12} width={64} height={28} />
      <Video x={23} y={52} width={282} height={163} />
      <Motion at={1.75}><rect x="71" y="180" width="185" height="27" rx="6" fill="#17202a" /><text x="163" y="198" textAnchor="middle" fontSize="12" fontWeight="650" fill="white">Your story, beautifully told.</text></Motion>
      <Card x={324} y={52} width={122} height={163} inset>
        <text x="15" y="26" className="offer-small">Color + sound</text>
        <Motion at={2.45}>{["#c91d37", "#658f7b", "#344657"].map((fill, i) => <circle key={fill} cx={26 + i * 33} cy="51" r="11" fill={fill} />)}</Motion>
        <Motion at={3}>{[0, 1, 2].map((i) => <g key={i}><rect x={26 + i * 31} y="82" width="5" height="55" rx="2.5" fill="#c6d3de" /><rect x={19 + i * 31} y={110 - i * 12} width="19" height="10" rx="4" fill={i === 1 ? "#c91d37" : "#91a6b7"} /></g>)}</Motion>
      </Card>
      <Motion at={.4} kind="wipe" duration={1.2}><rect x="23" y="229" width="109" height="15" rx="4" fill="#d8b2bb" /><rect x="138" y="229" width="100" height="15" rx="4" fill="#c8d9e4" /><rect x="244" y="229" width="61" height="15" rx="4" fill="#b9d1c6" /></Motion>
      <Waveform x={24} y={251} width={278} />
      <text x="330" y="250" className="offer-small">Story • captions</text><text x="330" y="269" className="offer-small">Color • sound</text>
    </Card>
    <Motion at={4.2}><Card x={332} y={323} width={224} height={64}><circle cx="32" cy="32" r="17" fill="#e0ece6" /><Tick x={24} y={26} /><text x="61" y="28" className="offer-label">Reviewed by the studio</text><text x="61" y="46" className="offer-small">Before it reaches you</text></Card></Motion>
  </>;
}

function DashboardFrame({ children }: { children: ReactNode }) {
  return <Card x={54} y={56} width={492} height={310}>
    <path d="M0 49h492M106 49v261" stroke="#dce5ec" />
    <Logo x={17} y={8} width={72} height={31} />
    <text x="126" y="30" className="offer-label">Your dashboard</text>
    <circle cx="463" cy="25" r="13" fill="#e9d5db" /><Portrait x={450} y={12} size={26} />
    <rect x="12" y="72" width="83" height="29" rx="8" fill="#e9dce0" /><text x="25" y="91" className="offer-small" style={{ fill: "#9f1930", fontWeight: 650 }}>Projects</text>
    <text x="25" y="125" className="offer-small">Team</text><text x="25" y="158" className="offer-small">Files</text>
    <path d="M25 277h55" stroke="#c9d6e0" strokeWidth="3" strokeLinecap="round" />
    {children}
  </Card>;
}

function ProjectScene() {
  return <>
    <DashboardFrame>
      <text x="126" y="80" className="offer-label">Good morning, creator.</text>
      <Motion at={2.98}><rect x="350" y="62" width="122" height="30" rx="9" fill="#c91d37" /><path d="M364 77h10m-5-5v10" stroke="white" strokeWidth="1.5" strokeLinecap="round" /><text x="380" y="81" fontSize="10" fill="white" fontWeight="650">Start a project</text></Motion>
      <Card x={125} y={108} width={347} height={171} inset>
        <Video x={12} y={15} width={121} height={77} />
        <text x="147" y="35" className="offer-label">Your next video</text><text x="147" y="56" className="offer-small">Brief + footage attached</text>
        <Motion at={3.25}><rect x="147" y="69" width="108" height="23" rx="7" fill="#dbe8e1" /><text x="160" y="84" fontSize="10" fill="#28634c" fontWeight="650">Editing in progress</text></Motion>
        <path d="M19 118h307" stroke="#c7d4dd" strokeWidth="5" strokeLinecap="round" />
        <Motion at={5.25} kind="draw" duration={1.5}><path d="M19 118h182" stroke="#c91d37" strokeWidth="5" strokeLinecap="round" pathLength="1" /></Motion>
        {["Brief", "Editing", "Review", "Ready"].map((label, i) => <g key={label}><circle cx={19 + i * 102} cy="118" r="5" fill={i < 2 ? "#c91d37" : "#c7d4dd"} /><text x={19 + i * 102} y="143" textAnchor={i === 0 ? "start" : i === 3 ? "end" : "middle"} className="offer-small">{label}</text></g>)}
      </Card>
    </DashboardFrame>
    <Motion at={3.7}><Card x={18} y={309} width={211} height={73}><path d="M19 25h14l5 6h22v23H19V25Z" fill="#c9d9e4" /><text x="73" y="31" className="offer-label">Brief + footage</text><text x="73" y="51" className="offer-small">Everything in one place</text></Card></Motion>
  </>;
}

function ConnectScene() {
  return <>
    <DashboardFrame>
      <text x="126" y="80" className="offer-label">Your next video</text><text x="410" y="80" className="offer-small">Review</text>
      <Video x={126} y={100} width={214} height={130} captions />
      <Motion at={.2}><Card x={351} y={101} width={120} height={130} inset><text x="12" y="24" className="offer-small">Your team</text><Avatar x={36} y={65} /><text x="12" y="109" className="offer-small">Editor online</text><circle cx="99" cy="105" r="4" fill="#28715b" /></Card></Motion>
      <Motion at={1.1}><rect x="126" y="243" width="345" height="42" rx="11" fill="#e7edf2" /><path d="M143 256h14v11h-8l-6 4v-15Z" stroke="#6d8293" strokeWidth="1.4" /><text x="169" y="269" className="offer-small">Leave feedback on your edit…</text></Motion>
    </DashboardFrame>
    <Motion at={1.4}><Card x={17} y={193} width={230} height={68}><circle cx="24" cy="24" r="10" fill="#ead2d9" /><Portrait x={14} y={14} size={20} /><text x="43" y="28" className="offer-label">You · 00:12</text><text x="18" y="49" className="offer-small">Love this cut. Keep the pace!</text></Card></Motion>
    <Motion at={3.2}><Card x={339} y={323} width={225} height={64}><rect x="13" y="13" width="38" height="38" rx="12" fill="#e0ece6" /><path d="M32 20v18m-6-6 6 6 6-6m-15 5v9h18v-9" stroke="#28715b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><text x="63" y="28" className="offer-label">Download your video</text><text x="63" y="47" className="offer-small">Finished and ready to publish</text></Card></Motion>
  </>;
}

function PlansScene() {
  return <>
    <text x="300" y="62" textAnchor="middle" className="offer-label">Editing that fits the way you create</text>
    <Motion at={.15}><Card x={51} y={95} width={232} height={258}>
      <rect x="21" y="21" width="47" height="47" rx="15" fill="#e7edf2" /><path d="m39 34 16 10-16 10V34Z" fill="#c91d37" />
      <text x="22" y="101" className="offer-heading">Single video</text><text x="22" y="124" className="offer-small">One idea. A finished edit.</text>
      <path d="M22 146h187" stroke="#dce5ec" /><Tick x={23} y={167} /><text x="50" y="177" className="offer-small">Start with one project</text>
      <Tick x={23} y={194} /><text x="50" y="204" className="offer-small">Get to know your editor</text>
      <rect x="22" y="224" width="189" height="12" rx="6" fill="#dde6ed" />
    </Card></Motion>
    <Motion at={1.8}><Card x={305} y={95} width={242} height={258}>
      <rect x="21" y="21" width="47" height="47" rx="15" fill="#ead7dd" /><path d="M33 36h23v20H33zM33 42h23m-18-9v6m13-6v6" stroke="#c91d37" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <text x="22" y="101" className="offer-heading">Monthly plan</text><text x="22" y="124" className="offer-small">A team for your channel.</text>
      <path d="M22 146h197" stroke="#dce5ec" /><Tick x={23} y={167} /><text x="50" y="177" className="offer-small">Create consistently</text>
      <Tick x={23} y={194} /><text x="50" y="204" className="offer-small">Keep your edits together</text>
      <rect x="22" y="224" width="199" height="12" rx="6" fill="#c91d37" opacity=".6" />
    </Card></Motion>
  </>;
}

function ClosingScene() {
  return <>
    <Card x={120} y={63} width={365} height={279}>
      <Logo x={136} y={35} width={92} height={40} />
      <Video x={30} y={76} width={305} height={162} captions />
    </Card>
    <Motion at={1.02}><Card x={27} y={284} width={158} height={69}><Avatar x={36} y={34} creator /><text x="75" y="39" className="offer-label">You create.</text></Card></Motion>
    <Motion at={2.22}><Card x={348} y={306} width={222} height={64}><circle cx="31" cy="32" r="18" fill="#e0ece6" /><Tick x={23} y={26} /><text x="61" y="37" className="offer-label">We handle the edit.</text></Card></Motion>
  </>;
}

function MobileCard({ x, y, width, height, children, inset = false }: { x: number; y: number; width: number; height: number; children?: ReactNode; inset?: boolean }) {
  return <g>
    <rect x={x} y={y} width={width} height={height} rx="18" fill={inset ? "#e5edf2" : "#f5f8fa"} stroke={inset ? "#d5e0e7" : "#ffffff"} />
    {children}
  </g>;
}

function MobileText({ x, y, children, size = 18, color = "#344657", weight = 650, anchor = "start" }: { x: number; y: number; children: ReactNode; size?: number; color?: string; weight?: number; anchor?: "start" | "middle" | "end" }) {
  return <text x={x} y={y} textAnchor={anchor} fill={color} fontSize={size} fontWeight={weight} fontFamily="inherit">{children}</text>;
}

function MobilePortrait({ cx, cy, size, character = "creator", background = "#e0ece6" }: { cx: number; cy: number; size: number; character?: FilmCharacter; background?: string }) {
  return <g>
    <circle cx={cx} cy={cy} r={size / 2} fill={background} />
    <Portrait x={cx - size / 2} y={cy - size / 2} size={size} character={character} />
  </g>;
}

function MobileTeamScene() {
  return <>
    <MobileText x={160} y={34} size={20} anchor="middle">Made for your channel</MobileText>
    <MobileCard x={18} y={48} width={284} height={138} inset>
      <rect x="31" y="64" width="42" height="73" rx="8" fill="#adccc0" />
      <path d="M41 84h22M41 94h22M41 104h15" stroke="#f5fbf8" strokeWidth="3" strokeLinecap="round" />
      <path d="M266 137V90m0 25-12-13m12-7 11-11" stroke="#9ab9aa" strokeWidth="3" strokeLinecap="round" />
      <MobilePortrait cx={160} cy={107} size={102} character="creator" background="#dbe8e3" />
      <rect x="69" y="150" width="182" height="28" rx="8" fill="#17202a" />
      <MobileText x={160} y={170} size={17} color="#ffffff" anchor="middle">Your story, well told</MobileText>
    </MobileCard>
    <Motion at={.65}><g><MobilePortrait cx={48} cy={226} size={44} character="editor" background="#f0dde1" /><MobileText x={78} y={222} size={18}>Editor</MobileText><MobileText x={78} y={244} size={16} color="#526779" weight={500}>Your style</MobileText></g></Motion>
    <Motion at={4.96}><g><MobilePortrait cx={188} cy={226} size={44} character="manager" /><MobileText x={218} y={222} size={18}>Manager</MobileText><MobileText x={218} y={244} size={16} color="#526779" weight={500}>On track</MobileText></g></Motion>
  </>;
}

function MobileCraftScene() {
  return <>
    <Logo x={24} y={13} width={88} height={38} /><MobileText x={298} y={39} size={20} anchor="end">Studio finish</MobileText>
    <MobileCard x={18} y={53} width={284} height={123} inset>
      <rect x="31" y="66" width="258" height="96" rx="14" fill="#dbe8e3" />
      <rect x="43" y="83" width="33" height="63" rx="7" fill="#adccc0" />
      <path d="M51 99h17M51 108h17M51 117h12" stroke="#f5fbf8" strokeWidth="2.5" strokeLinecap="round" />
      <MobilePortrait cx={164} cy={113} size={88} character="creator" background="#d1e1da" />
      <rect x="88" y="145" width="154" height="27" rx="8" fill="#17202a" />
      <MobileText x={165} y={164} size={17} color="#ffffff" anchor="middle">Studio polish</MobileText>
    </MobileCard>
    <MobileText x={65} y={207} size={18} anchor="middle">Color</MobileText><MobileText x={157} y={207} size={18} anchor="middle">Sound</MobileText><MobileText x={252} y={207} size={18} anchor="middle">Captions</MobileText>
    <Motion at={.4} kind="wipe" duration={1.2}><g><rect x="24" y="221" width="82" height="12" rx="6" fill="#c91d37" /><rect x="116" y="221" width="82" height="12" rx="6" fill="#658f7b" /><rect x="208" y="221" width="88" height="12" rx="6" fill="#9fb2c0" /></g></Motion>
  </>;
}

function MobileProjectScene() {
  return <>
    <Logo x={22} y={13} width={90} height={39} /><MobileText x={298} y={39} size={19} anchor="end">Your dashboard</MobileText>
    <MobileCard x={17} y={84} width={286} height={130} inset>
      <MobilePortrait cx={77} cy={142} size={82} character="creator" />
      <MobileText x={132} y={127} size={20}>Your next video</MobileText>
      <Motion at={2.98}><g><circle cx="139" cy="158" r="6" fill="#28715b" /><MobileText x={153} y={164} size={17} color="#28634c">In progress</MobileText></g></Motion>
      <rect x="33" y="194" width="252" height="7" rx="3.5" fill="#c7d4dd" />
      <Motion at={5.25} kind="draw" duration={1.5}><path d="M37 197.5h151" stroke="#c91d37" strokeWidth="7" strokeLinecap="round" pathLength="1" /></Motion>
    </MobileCard>
    <MobileText x={27} y={244} size={17}>Brief</MobileText><MobileText x={160} y={244} size={17} anchor="middle">Editing</MobileText><MobileText x={293} y={244} size={17} anchor="end">Ready</MobileText>
  </>;
}

function MobileConnectScene() {
  return <>
    <MobileText x={160} y={36} size={21} anchor="middle">Your team, in sync</MobileText>
    <MobilePortrait cx={67} cy={91} size={62} character="creator" background="#f0dde1" />
    <MobilePortrait cx={160} cy={91} size={62} character="editor" />
    <MobilePortrait cx={253} cy={91} size={62} character="manager" />
    <MobileText x={67} y={137} size={16} anchor="middle">You</MobileText><MobileText x={160} y={137} size={16} anchor="middle">Editor</MobileText><MobileText x={253} y={137} size={16} anchor="middle">Manager</MobileText>
    <Motion at={1.4}><MobileCard x={22} y={155} width={276} height={72} inset>
      <path d="M42 176h15v14h-8l-7 5v-19Z" fill="none" stroke="#6d8293" strokeWidth="2" strokeLinejoin="round" />
      <MobileText x={75} y={183} size={18}>Clear notes on your cut</MobileText>
      <MobileText x={75} y={207} size={16} color="#526779" weight={500}>Your team stays in sync</MobileText>
    </MobileCard></Motion>
    <Motion at={3.2}><g><circle cx="47" cy="254" r="15" fill="#e0ece6" /><Tick x={36} y={247} /><MobileText x={73} y={260} size={18}>Ready to publish</MobileText></g></Motion>
  </>;
}

function MobilePlansScene() {
  return <>
    <MobileText x={160} y={37} size={21} anchor="middle">Choose your pace</MobileText>
    <Motion at={.15}><MobileCard x={14} y={54} width={140} height={207}>
      <rect x="27" y="68" width="39" height="39" rx="12" fill="#e7edf2" /><path d="m42 77 15 10-15 10V77Z" fill="#c91d37" />
      <MobileText x={27} y={132} size={18}>Single video</MobileText><MobileText x={27} y={158} size={16} color="#526779" weight={500}>One clear edit</MobileText>
      <path d="M27 177h113" stroke="#dce5ec" strokeWidth="1.5" /><Tick x={29} y={193} /><MobileText x={54} y={208} size={16}>One edit</MobileText>
    </MobileCard></Motion>
    <Motion at={1.8}><MobileCard x={166} y={54} width={140} height={207}>
      <rect x="179" y="68" width="39" height="39" rx="12" fill="#ead7dd" /><path d="M190 79h18v18h-18zM190 85h18m-13-9v6m9-6v6" stroke="#c91d37" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <MobileText x={179} y={132} size={18}>Monthly plan</MobileText><MobileText x={179} y={158} size={16} color="#526779" weight={500}>Regular edits</MobileText>
      <path d="M179 177h113" stroke="#dce5ec" strokeWidth="1.5" /><Tick x={181} y={193} /><MobileText x={208} y={208} size={16}>Ongoing</MobileText>
    </MobileCard></Motion>
  </>;
}

function MobileClosingScene() {
  return <>
    <Logo x={102} y={11} width={116} height={50} />
    <MobileCard x={18} y={65} width={284} height={121} inset>
      <rect x="30" y="76" width="260" height="96" rx="14" fill="#dbe8e3" />
      <MobilePortrait cx={160} cy={121} size={82} character="creator" background="#d1e1da" />
      <rect x="64" y="150" width="192" height="29" rx="8" fill="#17202a" />
      <MobileText x={160} y={171} size={18} color="#ffffff" anchor="middle">Your next great edit</MobileText>
    </MobileCard>
    <Motion at={1.02}><MobileCard x={16} y={202} width={140} height={57}>
      <MobilePortrait cx={44} cy={230} size={38} character="creator" background="#f0dde1" /><MobileText x={66} y={236} size={17}>You create.</MobileText>
    </MobileCard></Motion>
    <Motion at={2.22}><MobileCard x={164} y={202} width={140} height={57}>
      <MobilePortrait cx={192} cy={230} size={38} character="editor" /><MobileText x={214} y={236} size={17}>We edit.</MobileText>
    </MobileCard></Motion>
  </>;
}

const scenes = [TeamScene, CraftScene, ProjectScene, ConnectScene, PlansScene, ClosingScene];
const mobileScenes = [MobileTeamScene, MobileCraftScene, MobileProjectScene, MobileConnectScene, MobilePlansScene, MobileClosingScene];

export const WhyHireUsArtwork = memo(function WhyHireUsArtwork({ scene }: { scene: number }) {
  const id = useId().replace(/:/g, "");
  const gradientId = `offer-surface-${id}`;
  const Scene = scenes[scene] ?? TeamScene;
  const MobileScene = mobileScenes[scene] ?? MobileTeamScene;
  return <>
    <svg className="offer-artwork offer-artwork--desktop" viewBox="0 0 600 420" fill="none" aria-hidden="true" focusable="false" style={{ "--offer-card-fill": `url(#${gradientId})` } as CSSProperties}>
      <defs><linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f8fafc" /><stop offset="1" stopColor="#e9eef3" /></linearGradient></defs>
      <Scene />
    </svg>
    <svg className="offer-artwork offer-artwork--mobile" viewBox="0 0 320 280" fill="none" aria-hidden="true" focusable="false">
      <rect x="4" y="4" width="312" height="272" rx="26" fill="#e9eff3" stroke="#ffffff" />
      <MobileScene />
    </svg>
  </>;
});
