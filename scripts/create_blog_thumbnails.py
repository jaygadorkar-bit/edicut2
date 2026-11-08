"""Create EdiCut's native SVG blog covers and matching WebP social previews.

Uses local DM Sans outlines, vector shapes, and the official local logo.
No raster images, remote fonts, external services, or generated photos are used.
Run from the repository root; requires fontTools/Brotli and the installed Sharp.
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path
from xml.sax.saxutils import escape

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "apps/web/public"
OUT = PUBLIC / "images/blog"
font = TTFont(PUBLIC / "fonts/dm-sans-latin-normal.woff2")
axes = {axis.axisTag for axis in font["fvar"].axes}
font = instantiateVariableFont(font, {key: value for key, value in {"wght": 700, "opsz": 14}.items() if key in axes})
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()
UPM = font["head"].unitsPerEm
INK, MUTED, RED, PAPER = "#192631", "#586C7C", "#CA1833", "#F7FAFC"


def label(copy: str, x: float, y: float, size: float, fill: str = INK) -> str:
    """Outline local typography so browser SVGs and social previews look identical."""
    pen = SVGPathPen(glyphs, ntos=lambda value: f"{value:.2f}".rstrip("0").rstrip("."))
    scale, cursor = size / UPM, x
    for char in copy:
        name = cmap[ord(char)]
        glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, cursor, y)))
        cursor += glyphs[name].width * scale
    return f'<path fill="{fill}" d="{pen.getCommands()}"/>'


def card(x: int, y: int, w: int, h: int, radius: int = 34, fill: str = PAPER) -> str:
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{fill}" stroke="#FFFFFF" stroke-width="3" filter="url(#raised)"/>'


def check(x: int, y: int, scale: float = 1, color: str = "#27765F") -> str:
    return f'<path d="m{x-19*scale} {y} {13*scale} {14*scale} {29*scale} {-32*scale}" fill="none" stroke="{color}" stroke-width="{9*scale}" stroke-linecap="round" stroke-linejoin="round"/>'


def portrait(x: float, y: float, scale: float, shirt: str = RED) -> str:
    return f'''<g transform="translate({x} {y}) scale({scale})">
      <path d="M17 225v-35c0-38 29-59 83-59s83 21 83 59v35Z" fill="{shirt}"/>
      <path d="m78 132 22 20 22-20v-27H78Z" fill="#C88D6B"/>
      <path d="m75 131 25 21-14 21-20-35m59-7-25 21 14 21 20-35" fill="#FFFFFF" fill-opacity=".9"/>
      <ellipse cx="100" cy="76" rx="45" ry="53" fill="#DEAA86"/>
      <path d="M55 78C34 17 87-4 123 16c34-3 42 31 23 67l-10-31c-24 5-41-4-50-13-3 20-19 27-31 29Z" fill="#233442"/>
      <path d="m62 74 1 25m75-25-1 25" stroke="#C88D6B" stroke-width="7" stroke-linecap="round"/>
      <path d="M76 70h12m24 0h12" stroke="#233442" stroke-width="4" stroke-linecap="round"/>
      <ellipse cx="83" cy="81" rx="3" ry="4" fill="#233442"/><ellipse cx="118" cy="81" rx="3" ry="4" fill="#233442"/>
      <path d="m101 84-3 12h7" fill="none" stroke="#BC7D61" stroke-width="3" stroke-linecap="round"/>
      <path d="M89 108q11 9 22-1" fill="none" stroke="#8B4D41" stroke-width="3" stroke-linecap="round"/>
    </g>'''


def play(x: int, y: int, radius: int = 42) -> str:
    return f'<circle cx="{x}" cy="{y}" r="{radius}" fill="{RED}"/><path d="m{x-radius*.22} {y-radius*.4} {radius*.66} {radius*.4}-{radius*.66} {radius*.4}Z" fill="white"/>'


def bars(x: int, y: int, widths: tuple[int, ...], gap: int = 20, color: str = "#BCCDD7", height: int = 12) -> str:
    return ''.join(f'<rect x="{x}" y="{y+i*gap}" width="{w}" height="{height}" rx="{height/2}" fill="{color}"/>' for i, w in enumerate(widths))


def backdrop(title: str, tint: str, content: str, heading: str = "") -> str:
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024" viewBox="0 0 1536 1024" fill="none" role="img" aria-labelledby="cover-title">
    <title id="cover-title">{escape(title)}</title>
    <defs>
      <linearGradient id="base" x1="200" y1="0" x2="1300" y2="1024" gradientUnits="userSpaceOnUse"><stop stop-color="#EFF5F8"/><stop offset="1" stop-color="#DCE8EF"/></linearGradient>
      <linearGradient id="studio" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#C1D8DD"/><stop offset="1" stop-color="#E5EEF0"/></linearGradient>
      <filter id="raised" x="-30%" y="-35%" width="170%" height="180%" color-interpolation-filters="sRGB"><feDropShadow dx="12" dy="22" stdDeviation="18" flood-color="#6A8195" flood-opacity=".2"/><feDropShadow dx="-8" dy="-8" stdDeviation="10" flood-color="#FFFFFF" flood-opacity=".85"/></filter>
      <clipPath id="wide"><rect x="200" y="300" width="668" height="310" rx="24"/></clipPath>
      <clipPath id="short-wide"><rect x="130" y="330" width="710" height="350" rx="24"/></clipPath>
      <clipPath id="phone"><rect x="14" y="16" width="216" height="310" rx="24"/></clipPath>
    </defs>
    <rect width="1536" height="1024" fill="url(#base)"/>
    <circle cx="1410" cy="60" r="320" fill="{tint}" fill-opacity=".55"/>
    <ellipse cx="754" cy="906" rx="580" ry="51" fill="#A8BCC9" fill-opacity=".13"/>
    {label(heading,108,156,58) if heading else ''}
    {content}
    </svg>'''


def editor_cover() -> str:
    scene = card(164, 258, 740, 514)
    scene += '<rect x="192" y="292" width="684" height="328" rx="28" fill="#263946"/>'
    scene += f'''<g clip-path="url(#wide)"><rect x="200" y="300" width="668" height="310" fill="url(#studio)"/>
      <path d="M700 300v310m-16-207h184" stroke="#A2C3C5" stroke-width="10"/>
      <path d="M216 610v-68q0-72 75-90v158" fill="#91B5AE"/>
      {portrait(369,323,1.42)}
      <rect x="672" y="516" width="132" height="12" rx="6" fill="#263946"/><path d="M737 533v77" stroke="#263946" stroke-width="10"/>
      </g>'''
    scene += play(264, 558, 36)
    scene += '<rect x="205" y="658" width="658" height="65" rx="14" fill="#E1EAF0"/>'
    for x, w, color in ((222,170,"#B7CDD6"),(402,190,"#DFA4AB"),(602,243,"#BCCFD5")):
        scene += f'<rect x="{x}" y="674" width="{w}" height="32" rx="7" fill="{color}"/>'
    scene += f'<path d="M575 645v94" stroke="{RED}" stroke-width="7" stroke-linecap="round"/>'
    scene += f'<g transform="rotate(-5 1144 285)">{card(1000,237,340,110,28)}<circle cx="1056" cy="292" r="26" fill="#DBE6EC"/>{bars(1112,280,(166,113),22)}</g>'
    scene += card(944, 366, 422, 353)
    scene += '<circle cx="1062" cy="470" r="75" fill="#DFEAE4"/>' + portrait(1007,412,.55,"#426D67")
    scene += label("Your editor",985,599,43) + bars(986,626,(300,220),26)
    scene += '<circle cx="1327" cy="375" r="58" fill="#F7FAFC" stroke="white" stroke-width="3" filter="url(#raised)"/>' + check(1327,375,1.1)
    scene += f'<path d="m1303 646 34 130 23-47 48-14Z" fill="{RED}" stroke="#EFF5F8" stroke-width="8" stroke-linejoin="round"/>'
    scene += f'<path d="M957 798c-86 72-238 82-331 42m13-28-25 23 31 13" stroke="{RED}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>'
    return backdrop("Choosing a video editing partner: a creator's edit, a selected editor, and a clear review process", "#DDE8E4",scene,"Find your editing partner.")


def brief_cover() -> str:
    scene = f'<g transform="rotate(-10 775 557)">{card(354,280,716,614,36,"#E5EDF3")}</g>'
    page = card(414,247,716,614,36)
    page += label("Video brief",478,347,52)
    page += '<rect x="478" y="371" width="579" height="3" rx="1.5" fill="#D7E2E9"/>'
    for y, copy in ((420,"Goal"),(554,"Footage"),(688,"Deliverables")):
        page += f'<rect x="478" y="{y}" width="70" height="70" rx="20" fill="#F0DFE3"/>' + check(513,y+35,.8,RED)
        page += label(copy,582,y+44,42) + bars(583,y+64,(353,),20,height=10)
    scene += f'<g transform="rotate(-4 772 557)">{page}</g>'
    scene += f'''<g transform="rotate(17 288 655)">
      <path d="M256 440a32 32 0 0 1 64 0v308h-64Z" fill="#263D4E"/><path d="M256 440a32 32 0 0 1 64 0v51h-64Z" fill="{RED}"/>
      <path d="m256 748 32 92 32-92Z" fill="#D1AE88"/><path d="m280 817 8 23 8-23Z" fill="#263D4E"/>
      <path d="M271 503v216" stroke="#597386" stroke-width="8" stroke-linecap="round"/>
    </g>'''
    scene += f'<g transform="rotate(9 1190 702)">{card(1070,592,253,244,30)}<path d="M1100 632h190v48h-190Z" fill="#263D4E"/><path d="m1120 632 34 48m27-48 34 48m28-48 34 48" stroke="#F7FAFC" stroke-width="12"/>{play(1194,748,41)}</g>'
    scene += '<circle cx="1235" cy="330" r="83" fill="#F7FAFC" stroke="white" stroke-width="3" filter="url(#raised)"/>' + check(1235,330,1.5)
    return backdrop("A video editing brief with a clear goal, footage list, deliverables, and checked review items", "#E9DFE8",scene,"Start with a clearer brief.")


def phone(x: int, y: int, angle: int, shirt: str, caption: str) -> str:
    body = card(0,0,244,454,34)
    body += f'<g clip-path="url(#phone)"><rect x="14" y="16" width="216" height="310" fill="url(#studio)"/>{portrait(15,60,1.1,shirt)}<rect x="39" y="258" width="166" height="40" rx="12" fill="#263946"/>{bars(58,274,(128,),height=7)}</g>'
    body += '<rect x="24" y="345" width="196" height="4" rx="2" fill="#D4E1E8"/>' + label(caption,27,395,27)
    body += bars(27,415,(156,),height=8)
    return f'<g transform="translate({x} {y}) rotate({angle} 122 227)">{body}</g>'


def shorts_cover() -> str:
    scene = card(100,293,770,455)
    scene += '<rect x="122" y="320" width="726" height="370" rx="28" fill="#263946"/>'
    scene += f'<g clip-path="url(#short-wide)"><rect x="130" y="330" width="710" height="350" fill="url(#studio)"/>{portrait(305,352,1.5)}<path d="M690 330v350" stroke="#A1C4C6" stroke-width="12"/></g>'
    scene += f'<path d="M357 373v-28h28m237 28v-28h-28M357 633v28h28m237-28v28h-28" stroke="{RED}" stroke-width="11" stroke-linecap="round"/>'
    scene += '<rect x="141" y="708" width="686" height="12" rx="6" fill="#D1DFE7"/><rect x="141" y="708" width="424" height="12" rx="6" fill="#CA1833"/>'
    scene += play(203,620,37)
    scene += phone(955,259,-7,RED,"A focused cut")
    scene += phone(1185,422,6,RED,"A fresh angle")
    scene += f'<path d="M743 442c81-123 143-131 210-78m-27-37 32 39-48 7" stroke="{RED}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>'
    scene += f'<path d="M496 808c169 88 328 45 417-8" stroke="#9BB3C2" stroke-width="5" stroke-linecap="round" stroke-dasharray="10 18"/>'
    return backdrop("A horizontal creator video reframed into two vertical Shorts with individual crops and captions", "#D7E7EB",scene,"One video. Fresh stories.")


def studio_cover() -> str:
    logo = (PUBLIC / "icons/edicut-logo.svg").read_text(encoding="utf-8")
    logo = logo[logo.index('<g transform='):logo.rindex('</svg>')]
    scene = f'<g transform="translate(106 64) scale(.245)">{logo}</g>'
    scene += label("Your next editing team.",467,153,51)
    scene += card(338,289,848,466)
    scene += '<rect x="373" y="325" width="500" height="284" rx="25" fill="url(#studio)"/>'
    scene += portrait(504,335,1.2)
    scene += '<rect x="373" y="632" width="775" height="68" rx="15" fill="#E5EDF2"/>'
    for x,w,color in ((390,170,"#BED2D9"),(572,250,"#DFA4AB"),(834,296,"#BDD0D9")):
        scene += f'<rect x="{x}" y="649" width="{w}" height="33" rx="6" fill="{color}"/>'
    scene += '<path d="M766 619v95" stroke="#CA1833" stroke-width="6" stroke-linecap="round"/>'
    scene += '<circle cx="1020" cy="421" r="64" fill="#DFEAE4"/>' + check(1020,421,1.2)
    scene += label("Studio",929,544,43) + bars(930,567,(174,),height=10)
    scene += f'<g transform="rotate(-6 287 496)">{card(120,365,330,269,30)}<circle cx="285" cy="455" r="64" fill="#DCE7EA"/>{portrait(238,405,.47,"#426D67")}{label("Your manager",161,581,34)}</g>'
    for x,copy,color in ((152,"Managed","#DCE8ED"),(566,"Reviewed","#DFEAE4"),(980,"Clear scope","#F0DFE3")):
        scene += card(x,810,382,104,27)
        scene += f'<circle cx="{x+46}" cy="862" r="18" fill="{color}"/>'
        scene += check(x+46,862,.45,RED if x==980 else "#27765F")
        scene += label(copy,x+85,877,39)
    return backdrop("EdiCut's editing team: a project manager, studio quality review, and clearly scoped packages", "#EEDFE4",scene)


def retention_cover() -> str:
    scene = card(116, 288, 982, 488)
    scene += label("Audience review", 157, 351, 34)
    scene += label("Illustrative timeline", 157, 389, 23, MUTED)
    for y in (442, 520, 598):
        scene += f'<path d="M165 {y}h868" stroke="#C7D8E1" stroke-width="3" stroke-dasharray="6 12"/>'
    scene += '<path d="M167 429C242 436 248 466 322 475S402 484 456 528 505 579 550 571 599 515 638 537 697 586 755 596 855 604 913 629 988 642 1035 653V693H167Z" fill="#BED4D9" fill-opacity=".55"/>'
    scene += '<path d="M167 429C242 436 248 466 322 475S402 484 456 528 505 579 550 571 599 515 638 537 697 586 755 596 855 604 913 629 988 642 1035 653" stroke="#467D7B" stroke-width="10" stroke-linecap="round"/>'
    scene += '<path d="M535 421v278" stroke="#CA1833" stroke-width="4" stroke-dasharray="9 11"/><circle cx="535" cy="574" r="19" fill="#CA1833" stroke="#F7FAFC" stroke-width="7"/>'
    scene += '<rect x="158" y="722" width="895" height="15" rx="7.5" fill="#D3DFE7"/><rect x="158" y="722" width="378" height="15" rx="7.5" fill="#D99BA5"/>'
    scene += '<path d="m534 711-12-14h24Z" fill="#CA1833"/>'
    scene += f'<g transform="rotate(5 1193 402)">{card(1020,244,360,300,30)}<rect x="1043" y="269" width="314" height="224" rx="20" fill="url(#studio)"/>{portrait(1119,277,.96)}{play(1087,450,29)}</g>'
    scene += f'<path d="M594 590c68 2 133 39 165 82" stroke="{RED}" stroke-width="7" stroke-linecap="round"/>'
    scene += card(720, 696, 609, 164, 29)
    scene += '<circle cx="775" cy="755" r="21" fill="#EBD4DA"/>' + check(775,755,.5,RED)
    scene += label("Trim the repeat",815,769,39)
    scene += label("Keep the meaning.",763,817,27,MUTED)
    return backdrop("An illustrative retention curve, a creator preview, and a focused editing note", "#D7E7E4", scene, "Make every moment clear.")


def microphone(x: int, y: int, flip: bool = False) -> str:
    return f'''<g transform="translate({x} {y}) scale({-1 if flip else 1} 1)">
      <path d="M-50 113h100M0 110V70m0 0 40-33" stroke="#344D5C" stroke-width="9" stroke-linecap="round"/>
      <g transform="rotate(28 40 0)"><rect x="22" y="-42" width="36" height="84" rx="18" fill="#344D5C"/><path d="M31-17h18m-18 12h18m-18 12h18" stroke="#8EA9B7" stroke-width="4" stroke-linecap="round"/></g>
    </g>'''


def podcast_cover() -> str:
    scene = '<defs><clipPath id="podcast-stage"><rect x="204" y="271" width="1128" height="371" rx="24"/></clipPath></defs>'
    scene += card(175,241,1186,448)
    scene += f'<g clip-path="url(#podcast-stage)"><rect x="204" y="271" width="1128" height="371" fill="url(#studio)"/><path d="M768 271v371" stroke="#F7FAFC" stroke-width="9"/>{portrait(356,304,1.5)}{portrait(876,304,1.5,"#426D67")}<path d="M204 614h1128" stroke="#AB8A79" stroke-width="55"/>{microphone(616,483,True)}{microphone(920,483)}</g>'
    scene += '<circle cx="242" cy="304" r="8" fill="#CA1833"/>' + label("The conversation",264,313,25)
    scene += card(270,736,996,181,30)
    for y,copy,color in ((779,"Picture","#B7CCD6"),(848,"Dialogue","#A9CBC2")):
        scene += label(copy,301,y+18,27,MUTED)
        scene += f'<rect x="476" y="{y-14}" width="751" height="45" rx="10" fill="#E3ECF1"/>'
        if copy == "Picture":
            for x,w,c in ((485,206,color),(702,183,"#D9A4AD"),(896,322,color)):
                scene += f'<rect x="{x}" y="{y-6}" width="{w}" height="29" rx="5" fill="{c}"/>'
        else:
            for i in range(67):
                h = 7 + (i*13 % 25)
                scene += f'<rect x="{486+i*11}" y="{y+8-h/2}" width="5" height="{h}" rx="2.5" fill="#467D7B"/>'
    scene += '<path d="M819 748v155" stroke="#CA1833" stroke-width="5"/><path d="m819 752-12-14h24Z" fill="#CA1833"/>'
    return backdrop("Two podcast speakers with microphones above synchronized picture and dialogue tracks", "#EBDFE5",scene,"Let the conversation lead.")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    covers = {
        "choose-editing-partner": editor_cover(),
        "video-brief-checklist": brief_cover(),
        "creator-video-to-shorts": shorts_cover(),
        "edicut-editing-team": studio_cover(),
        "audience-retention-editing": retention_cover(),
        "video-podcast-workflow": podcast_cover(),
    }
    # Preserve the draft URL observed by the running Vite asset graph.
    # Published cards use creator-video-to-shorts; no existing URL is removed.
    covers["long-video-to-shorts"] = covers["creator-video-to-shorts"]
    paths = []
    for name, markup in covers.items():
        path = OUT / f"{name}.svg"
        path.write_text(markup + "\n", encoding="utf-8")
        paths.append(str(path))
    sharp_paths = list((ROOT / "node_modules/.pnpm").glob("sharp@*/node_modules/sharp/dist/index.mjs"))
    if not sharp_paths:
        raise RuntimeError("The installed Sharp runtime is missing; install repository dependencies first.")
    js = '''
      const { default: sharp } = await import(process.argv[1]);
      let input=''; for await (const chunk of process.stdin) input+=chunk;
      for (const path of JSON.parse(input)) {
        const output=path.replace(/\\.svg$/,'.webp');
        await sharp(path).webp({quality:90,effort:6}).toFile(output);
        process.stdout.write(output+'\\n');
      }
    '''
    subprocess.run(["node", "--input-type=module", "-e", js, sharp_paths[0].as_uri()], input=json.dumps(paths), text=True, check=True)
    print("Created 6 SVG covers and one compatibility alias, with matching 1536x1024 WebP previews.")


if __name__ == "__main__":
    main()
