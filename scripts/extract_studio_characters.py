#!/usr/bin/env python3
"""Extract three transparent, vector avatars from the supplied Vecteezy EPS.

Source: media/vector files/vecteezy_set-of-diverse-people-avatars-colorful-cartoon-portraits_85710058.eps
Source grid is two rows by five columns, read left-to-right and top-to-bottom.
Targets: top row 2 (creator), bottom row 5 (editor), top row 3 (manager).

This deliberately handles the page's line-based Illustrator PostScript path
operators (mo/li/cv/cp/cmyk/f). It checks the three selected bounds for effects
or paint operations that need a full PostScript interpreter and aborts rather
than silently dropping them. The source circle and sheet backgrounds are omitted.
All portrait geometry is preserved; CMYK fills convert to RGB, and the explicit
clothing palette below adapts jackets to the EdiCut page colors.
"""

from __future__ import annotations

import argparse
import re
import struct
from dataclasses import dataclass, field
from pathlib import Path


SOURCE_RELATIVE = Path("media") / "vector files" / (
    "vecteezy_set-of-diverse-people-avatars-colorful-cartoon-portraits_85710058.eps"
)
ROOT = next((parent for parent in Path(__file__).resolve().parents if (parent / SOURCE_RELATIVE).is_file()), Path.cwd())
DEFAULT_EPS = ROOT / "media" / "vector files" / (
    "vecteezy_set-of-diverse-people-avatars-colorful-cartoon-portraits_85710058.eps"
)
DEFAULT_OUTPUT = ROOT / "apps" / "web" / "public" / "artwork" / "why-hire-us"

# Adapt clothing only; retain every original portrait path and facial feature.
CLOTHING_PALETTE = {
    "creator": {"#ffae00": "#c91d37", "#ed7f00": "#a81730", "#a14e00": "#891326"},
    "editor": {"#1e9e47": "#527969", "#0c301d": "#345747"},
    "manager": {"#126a3c": "#527969", "#0c3e21": "#345747"},
}

DOS_EPS_MAGIC = bytes.fromhex("C5 D0 D3 C6")
NUMBER = re.compile(r"^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$")


@dataclass
class Shape:
    commands: list[str]
    points: list[tuple[float, float]]
    color: tuple[float, float, float, float]
    index: int

    @property
    def bounds(self) -> tuple[float, float, float, float]:
        xs = [point[0] for point in self.points]
        ys = [point[1] for point in self.points]
        return min(xs), min(ys), max(xs), max(ys)

    @property
    def center(self) -> tuple[float, float]:
        x0, y0, x1, y1 = self.bounds
        return (x0 + x1) / 2, (y0 + y1) / 2

    @property
    def width(self) -> float:
        x0, _, x1, _ = self.bounds
        return x1 - x0

    @property
    def height(self) -> float:
        _, y0, _, y1 = self.bounds
        return y1 - y0


@dataclass
class PathState:
    commands: list[str] = field(default_factory=list)
    points: list[tuple[float, float]] = field(default_factory=list)

    def clear(self) -> None:
        self.commands.clear()
        self.points.clear()


def read_postscript(eps_path: Path) -> str:
    data = eps_path.read_bytes()
    if data.startswith(DOS_EPS_MAGIC):
        ps_offset, ps_length = struct.unpack_from("<II", data, 4)
        if ps_offset + ps_length > len(data):
            raise ValueError("Invalid DOS EPS header: PostScript section exceeds file size.")
        data = data[ps_offset : ps_offset + ps_length]

    text = data.decode("latin1", errors="strict")
    page_start = text.find("%%EndPageSetup")
    page_end = text.find("%%Trailer", page_start + 1)
    if page_start < 0 or page_end < 0:
        raise ValueError("EPS page drawing section is missing %%EndPageSetup or %%Trailer.")
    return text[page_start + len("%%EndPageSetup") : page_end]


def parse_path_section(page: str) -> tuple[list[Shape], list[tuple[list[str], list[tuple[float, float]], str]]]:
    shapes: list[Shape] = []
    pending_effects: list[tuple[list[str], list[tuple[float, float]], str]] = []
    state = PathState()
    current_color: tuple[float, float, float, float] | None = None
    fill_count = 0
    in_gradient_block = False

    def operands(tokens: list[str], count: int, operator: str) -> list[float]:
        if len(tokens) < count + 1 or tokens[-1] != operator:
            raise ValueError(f"Malformed {operator} operator: {' '.join(tokens)}")
        raw = tokens[-count - 1 : -1]
        if not all(NUMBER.fullmatch(value) for value in raw):
            raise ValueError(f"Non-numeric operands for {operator}: {' '.join(tokens)}")
        return [float(value) for value in raw]

    for line_number, raw_line in enumerate(page.splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("%"):
            continue
        tokens = line.split()
        op = tokens[-1]

        # Illustrator's two alternate shading branches contain dictionary data
        # and encoded samples. Their path remains active as the clip outline.
        # Record the paint op's bounds and let the selection check below reject
        # any chosen avatar that would need this unsupported shading.
        if "level3{" in tokens or "not{" in tokens:
            in_gradient_block = True
        if "shfill" in tokens or "GenStrips" in tokens:
            pending_effects.append((list(state.commands), list(state.points), "gradient paint"))
        if in_gradient_block and op not in {"shfill", "GenStrips"}:
            if "}if" in tokens:
                in_gradient_block = False
            continue

        if op == "mo":
            x, y = operands(tokens, 2, op)
            state.commands.append(f"M {x:g} {y:g}")
            state.points.append((x, y))
        elif op == "li":
            x, y = operands(tokens, 2, op)
            state.commands.append(f"L {x:g} {y:g}")
            state.points.append((x, y))
        elif op == "cv":
            x1, y1, x2, y2, x3, y3 = operands(tokens, 6, op)
            state.commands.append(f"C {x1:g} {y1:g} {x2:g} {y2:g} {x3:g} {y3:g}")
            state.points.extend(((x1, y1), (x2, y2), (x3, y3)))
        elif op == "cp":
            state.commands.append("Z")
        elif op == "cmyk":
            c, m, y, k = operands(tokens, 4, op)
            current_color = tuple(max(0.0, min(1.0, value)) for value in (c, m, y, k))  # type: ignore[assignment]
        elif op == "f":
            fill_count += 1
            if state.commands:
                if current_color is None:
                    raise ValueError(f"Fill at page line {line_number} has no preceding CMYK color.")
                shapes.append(Shape(list(state.commands), list(state.points), current_color, fill_count))
            state.clear()
        elif op in {"shfill", "GenStrips", "stroke", "S", "s", "eofill", "image", "colorimage", "imagemask"}:
            pending_effects.append((list(state.commands), list(state.points), op))
        elif op == "np":
            state.clear()
        elif op == "clp":
            if in_gradient_block and state.points:
                pending_effects.append((list(state.commands), list(state.points), "gradient clip"))
            # Illustrator's clp helper ends the current path after clipping.
            state.clear()
        elif op in {"gsave", "grestore", "ct", "]ct", "translate", "scale", "pgsv", "pgrs", "sop"}:
            # These affect clipping, graphics state, or the gradient-only page
            # setup. The selected artwork is encoded in direct page coordinates.
            continue
        elif op in {"<<", ">>", "[", "]", "{", "}", "level3{", "not{", "}if", "if", "ifelse", "true", "false", "exec", "gx", "add_res", "get_res", "clonedict", "del_res", "setcolorspace", "GenStrips", "shfill", "AI11_PDFMark5", "0", "1", "2", "3", "4", "8", "256", "/0", "/Function", "/ShadingType", "/ColorSpace", "/Coords", "/Domain", "/Extend", "/FunctionType", "/Functions", "/Range", "/DataSource", "/BitsPerSample", "/Encode", "/Decode", "/Size", "/Bounds", "/NumSamples", "/NumComp", "/Scaling[[.00392157", "/Samples[", "/DeviceCMYK", "[]true", "true]"}:
            continue
        else:
            # Reject unknown operators only if a path is currently being built;
            # unrelated operands inside Illustrator's gradient dictionaries are
            # ignored above via their known ending tokens.
            if state.commands:
                raise ValueError(
                    f"Unsupported operator {op!r} while a vector path is active at page line {line_number}."
                )

    if state.commands:
        pending_effects.append((list(state.commands), list(state.points), "unpainted path"))
    return shapes, pending_effects


def approx_rgb(cmyk: tuple[float, float, float, float]) -> str:
    c, m, y, k = cmyk
    channels = tuple(round(255 * (1 - component) * (1 - k)) for component in (c, m, y))
    return "#" + "".join(f"{channel:02x}" for channel in channels)


def overlaps(bounds: tuple[float, float, float, float], circle: Shape, pad: float = 0.0) -> bool:
    x0, y0, x1, y1 = bounds
    cx, cy = circle.center
    radius = max(circle.width, circle.height) / 2 + pad
    # Bounding-box overlap is deliberate: pieces touching the portrait frame
    # must remain included even when their geometric center lies near an edge.
    return not (x1 < cx - radius or x0 > cx + radius or y1 < cy - radius or y0 > cy + radius)


def select_circles(shapes: list[Shape]) -> list[Shape]:
    circles = [
        shape
        for shape in shapes
        if 620 <= shape.width <= 660
        and 620 <= shape.height <= 660
        and abs(shape.width - shape.height) <= 5
    ]
    if len(circles) != 10:
        raise ValueError(f"Expected 10 circular avatar backgrounds; found {len(circles)}.")
    circles.sort(key=lambda shape: shape.center[1])
    rows: list[list[Shape]] = []
    for circle in circles:
        if not rows or circle.center[1] - rows[-1][-1].center[1] > 200:
            rows.append([])
        rows[-1].append(circle)
    if len(rows) != 2 or any(len(row) != 5 for row in rows):
        raise ValueError("Expected exactly two rows of five circular avatar backgrounds.")
    return [circle for row in rows for circle in sorted(row, key=lambda shape: shape.center[0])]


def svg_for_avatar(name: str, circle: Shape, shapes: list[Shape]) -> str:
    cx, cy = circle.center
    size = max(circle.width, circle.height)
    view_x, view_y = cx - size / 2, cy - size / 2
    selected = [
        shape
        for shape in shapes
        if shape.index != circle.index
        and shape.width < size * 1.25
        and shape.height < size * 1.25
        and overlaps(shape.bounds, circle)
    ]
    if len(selected) < 8:
        raise ValueError(f"Only {len(selected)} non-background fills selected for {name}; extraction looks incomplete.")

    elements = []
    for shape in selected:
        d = " ".join(shape.commands)
        source_fill = approx_rgb(shape.color)
        fill = CLOTHING_PALETTE[name].get(source_fill, source_fill)
        elements.append(
            f'  <path data-source-shape="{shape.index}" data-source-fill="{source_fill}" d="{d}" fill="{fill}"/>'
        )

    return "\n".join(
        [
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="%.6f %.6f %.6f %.6f" role="img" aria-labelledby="title">'
            % (view_x, view_y, size, size),
            f"  <title id=\"title\">{name.title()} avatar from the supplied Vecteezy EPS</title>",
            *elements,
            "</svg>",
            "",
        ]
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--eps", type=Path, default=DEFAULT_EPS, help="Source EPS path")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Output directory for SVGs")
    args = parser.parse_args()

    page = read_postscript(args.eps)
    shapes, effects = parse_path_section(page)
    circles = select_circles(shapes)
    targets = {"creator": circles[1], "editor": circles[9], "manager": circles[2]}

    for name, circle in targets.items():
        for commands, points, operator in effects:
            if points:
                effect_bounds = (
                    min(point[0] for point in points),
                    min(point[1] for point in points),
                    max(point[0] for point in points),
                    max(point[1] for point in points),
                )
                if overlaps(effect_bounds, circle):
                    raise ValueError(
                        f"Unsupported {operator} paint/effect overlaps selected {name}; refusing incomplete SVG."
                    )

    args.output.mkdir(parents=True, exist_ok=True)
    for name, circle in targets.items():
        svg = svg_for_avatar(name, circle, shapes)
        output_path = args.output / f"{name}.svg"
        output_path.write_text(svg, encoding="utf-8")
        included = svg.count("<path ")
        print(f"{output_path}: {included} vector fills; source center={circle.center}; square viewBox={max(circle.width, circle.height):.3f}")


if __name__ == "__main__":
    main()
