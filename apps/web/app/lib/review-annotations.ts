export type ReviewPoint = { x: number; y: number };
export type AnnotationTool = "pin" | "rectangle" | "ellipse" | "arrow" | "pen";
export const ANNOTATION_COLORS = [
  "#a78bfa",
  "#f97316",
  "#38bdf8",
  "#4ade80",
  "#facc15",
  "#ffffff",
] as const;
export type AnnotationShape = {
  x: number;
  y: number;
  width: number;
  height: number;
  kind?: AnnotationTool;
  color?: string;
  start?: ReviewPoint;
  end?: ReviewPoint;
  points?: ReviewPoint[];
};
export type FrameAnnotation = AnnotationShape & { shapes?: AnnotationShape[] };
const unit = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;
const validPoint = (p: unknown): p is ReviewPoint =>
  Boolean(
    p &&
    typeof p === "object" &&
    unit((p as ReviewPoint).x) &&
    unit((p as ReviewPoint).y),
  );
function parseShape(raw: unknown): AnnotationShape | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
  const s = raw as AnnotationShape;
  if (
    ![s.x, s.y, s.width, s.height].every(unit) ||
    s.width < 0.005 ||
    s.height < 0.005 ||
    s.x + s.width > 1.000001 ||
    s.y + s.height > 1.000001
  )
    return;
  const shape: AnnotationShape = {
    x: s.x,
    y: s.y,
    width: s.width,
    height: s.height,
  };
  if (s.kind !== undefined) {
    if (!["pin", "rectangle", "ellipse", "arrow", "pen"].includes(s.kind))
      return;
    shape.kind = s.kind;
  }
  if (s.color !== undefined) {
    if (!(ANNOTATION_COLORS as readonly string[]).includes(s.color)) return;
    shape.color = s.color;
  }
  if (s.kind === "arrow") {
    if (!validPoint(s.start) || !validPoint(s.end)) return;
    shape.start = { x: s.start.x, y: s.start.y };
    shape.end = { x: s.end.x, y: s.end.y };
  }
  if (s.kind === "pen") {
    if (
      !Array.isArray(s.points) ||
      s.points.length < 2 ||
      s.points.length > 200 ||
      !s.points.every(validPoint)
    )
      return;
    shape.points = s.points.map((p) => ({ x: p.x, y: p.y }));
  }
  return shape;
}
export function parseAnnotation(
  value: string,
): FrameAnnotation | null | undefined {
  if (!value) return null;
  if (value.length > 64_000) return;
  try {
    const raw = JSON.parse(value);
    const shape = parseShape(raw);
    if (!shape) return;
    if (raw.shapes !== undefined) {
      if (
        !Array.isArray(raw.shapes) ||
        !raw.shapes.length ||
        raw.shapes.length > 20
      )
        return;
      const shapes = raw.shapes.map(parseShape);
      if (shapes.some((s: AnnotationShape | undefined) => !s)) return;
      return { ...shape, shapes };
    }
    return shape;
  } catch {
    return;
  }
}
export const annotationShapes = (
  annotation: FrameAnnotation | null | undefined,
) => (annotation ? (annotation.shapes ?? [annotation]) : []);
export function combineAnnotations(
  shapes: AnnotationShape[],
): FrameAnnotation | null {
  if (!shapes.length) return null;
  return shapes.length === 1
    ? shapes[0]
    : { ...shapes[0], shapes: shapes.slice(0, 20) };
}
export function makeAnnotation(
  tool: AnnotationTool,
  start: ReviewPoint,
  end: ReviewPoint,
  color: string,
  points: ReviewPoint[] = [],
): AnnotationShape {
  const path = tool === "pen" ? points : [start, end];
  const x = Math.min(...path.map((p) => p.x)),
    y = Math.min(...path.map((p) => p.y));
  const width = Math.max(0.005, Math.max(...path.map((p) => p.x)) - x),
    height = Math.max(0.005, Math.max(...path.map((p) => p.y)) - y);
  return {
    kind: tool,
    color,
    x: Math.min(x, 1 - width),
    y: Math.min(y, 1 - height),
    width,
    height,
    ...(tool === "arrow" ? { start, end } : {}),
    ...(tool === "pen" ? { points } : {}),
  };
}
export function stepReviewFrame(
  timeMs: number,
  fps: number,
  direction: -1 | 1,
  durationMs: number,
) {
  const frame = Math.round((timeMs * fps) / 1000) + direction;
  return Math.max(0, Math.min(durationMs, (frame * 1000) / fps + 0.001));
}
export function reviewFrameTimecode(timeMs: number, fps: number) {
  const rate = Math.round(fps),
    frame = Math.max(0, Math.round((timeMs * fps) / 1000));
  return [
    Math.floor(frame / rate / 3600),
    Math.floor(frame / rate / 60) % 60,
    Math.floor(frame / rate) % 60,
    frame % rate,
  ]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}
