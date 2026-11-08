import { Select } from "./Select";
import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import {
  Circle,
  Grid3X3,
  MapPin,
  MessageSquare,
  Pencil,
  Ruler,
  Send,
  Square,
  Undo2,
  X,
} from "lucide-react";
import {
  ANNOTATION_COLORS,
  annotationShapes,
  combineAnnotations,
  makeAnnotation,
  type AnnotationShape,
  type AnnotationTool,
  type FrameAnnotation,
  type ReviewPoint,
} from "../lib/review-annotations";
import { formatReviewTime } from "../lib/project-review";

function Shape({
  shape,
  marker,
  frameWidth,
  frameHeight,
}: {
  shape: AnnotationShape;
  marker: string;
  frameWidth: number;
  frameHeight: number;
}) {
  const color = shape.color ?? "#a78bfa";
  const common = {
    stroke: color,
    strokeWidth: 2.5,
    fill: "none",
    vectorEffect: "non-scaling-stroke" as const,
  };
  const x = shape.x * frameWidth,
    y = shape.y * frameHeight,
    w = shape.width * frameWidth,
    h = shape.height * frameHeight;
  if (shape.kind === "pin") {
    const cx = x + w / 2;
    const cy = y + h / 2;
    return (
      <g>
        <path
          d={`M ${cx} ${cy + 13} C ${cx + 9} ${cy + 1}, ${cx + 11} ${cy - 2}, ${cx + 11} ${cy - 7} A 11 11 0 1 0 ${cx - 11} ${cy - 7} C ${cx - 11} ${cy - 2}, ${cx - 9} ${cy + 1}, ${cx} ${cy + 13} Z`}
          fill={color}
          stroke="#17191f"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={cx} cy={cy - 7} r={3.5} fill="#17191f" />
      </g>
    );
  }
  if (shape.kind === "ellipse")
    return (
      <ellipse
        {...common}
        cx={x + w / 2}
        cy={y + h / 2}
        rx={w / 2}
        ry={h / 2}
      />
    );
  if (shape.kind === "arrow" && shape.start && shape.end)
    return (
      <g>
        <defs>
          <marker
            id={marker}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            markerUnits="userSpaceOnUse"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
          </marker>
        </defs>
        <line
          {...common}
          x1={shape.start.x * frameWidth}
          y1={shape.start.y * frameHeight}
          x2={shape.end.x * frameWidth}
          y2={shape.end.y * frameHeight}
          markerEnd={`url(#${marker})`}
        />
      </g>
    );
  if (shape.kind === "pen" && shape.points)
    return (
      <polyline
        {...common}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={shape.points
          .map((p) => `${p.x * frameWidth},${p.y * frameHeight}`)
          .join(" ")}
      />
    );
  return <rect {...common} x={x} y={y} width={w} height={h} rx={2} />;
}

export function ReviewCanvas({
  width,
  height,
  annotation,
  draftAnnotation,
  onAnnotation,
  onMark,
  onPause,
  time,
  draftTime,
  readOnly,
  disabled,
  draftBody,
  setDraftBody,
  onPost,
  busy,
  zoom,
  onZoom,
  onToolChange,
  toolbarTarget,
}: {
  width: number;
  height: number;
  annotation: FrameAnnotation | null;
  draftAnnotation?: FrameAnnotation | null;
  onAnnotation: (value: FrameAnnotation | null) => void;
  onMark: () => void;
  onPause: () => void;
  time: number;
  draftTime: number | null;
  readOnly: boolean;
  disabled: boolean;
  draftBody: string;
  setDraftBody: (value: string) => void;
  onPost: () => void;
  busy: boolean;
  zoom: number;
  onZoom: (value: number) => void;
  onToolChange: (active: boolean) => void;
  toolbarTarget: HTMLElement | null;
}) {
  const id = useId().replace(/:/g, "");
  const [tool, setTool] = useState<AnnotationTool | "ruler" | "comment" | null>(
    null,
  );
  const [color, setColor] = useState<string>(ANNOTATION_COLORS[0]);
  const [grid, setGrid] = useState(false);
  const [preview, setPreview] = useState<AnnotationShape | null>(null);
  const [rulerGuides, setRulerGuides] = useState<
    {
      start: ReviewPoint;
      end: ReviewPoint;
    }[]
  >([]);
  const [rulerPreview, setRulerPreview] = useState<{
    start: ReviewPoint;
    end: ReviewPoint;
  } | null>(null);
  const [inline, setInline] = useState<ReviewPoint | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => onToolChange(tool !== null), [tool, onToolChange]);
  const drag = useRef<{
    start: ReviewPoint;
    points: ReviewPoint[];
    pointerId: number;
  } | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const pointerFrame = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (pointerFrame.current !== null)
        cancelAnimationFrame(pointerFrame.current);
    },
    [],
  );
  useEffect(() => {
    if (!draftAnnotation && !busy) setInline(null);
  }, [draftAnnotation, busy]);
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      // Document listeners may run before delegated React menu handlers.
      // Escape belongs to a focused dropdown, not the canvas draft behind it.
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        (event.target instanceof Element &&
          event.target.closest("[role='combobox'], [role='listbox'], select"))
      )
        return;
      setTool(null);
      setPreview(null);
      setRulerGuides([]);
      setRulerPreview(null);
      setInline(null);
      drag.current = null;
    };
    document.addEventListener("keydown", cancel);
    return () => document.removeEventListener("keydown", cancel);
  }, []);
  const shapeList = annotationShapes(annotation);
  const draftShapes =
    draftTime !== null && Math.abs(time - draftTime) < 1
      ? annotationShapes(draftAnnotation)
      : [];
  function point(event: PointerEvent<HTMLDivElement>): ReviewPoint {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
  }
  function commit(shape: AnnotationShape, at: ReviewPoint) {
    if (draftShapes.length >= 20) {
      setNotice(
        "Use up to 20 marks per comment. Post this note before adding more.",
      );
      return;
    }
    const next = combineAnnotations([...draftShapes, shape]);
    if (JSON.stringify(next).length > 50000) {
      setNotice(
        "This drawing is detailed. Post this note before adding more marks.",
      );
      setPreview(null);
      return;
    }
    onMark();
    onAnnotation(next);
    setPreview(null);
    setTool(null);
    setInline(at);
    requestAnimationFrame(() => input.current?.focus({ preventScroll: true }));
  }
  const canDraw = !disabled && !readOnly && !busy;
  const frameWidth = width || 1000;
  const frameHeight = height || 1000;
  function selectDrawingTool(nextTool: AnnotationTool | "comment") {
    setRulerGuides([]);
    setRulerPreview(null);
    onPause();
    setTool((current) => (current === nextTool ? null : nextTool));
    setInline(null);
    setNotice("");
    if (nextTool === "comment")
      requestAnimationFrame(() =>
        canvas.current?.focus({ preventScroll: true }),
      );
  }
  function toggleRuler() {
    setRulerGuides([]);
    setRulerPreview(null);
    onPause();
    setTool((current) => (current === "ruler" ? null : "ruler"));
    setInline(null);
  }
  const toolbar = (
    <div
      className="review-canvas__toolbar"
      role="toolbar"
      aria-label="Video annotation tools"
    >
      <div
        className="review-canvas__tool-list"
        role="group"
        aria-label="Annotation tools"
      >
        <button
          type="button"
          aria-label="Place a comment"
          title="Place a comment anywhere on the frame"
          aria-pressed={tool === "comment"}
          disabled={!canDraw}
          onClick={() => selectDrawingTool("comment")}
        >
          <MessageSquare size={17} />
        </button>
        {(
          [
            ["pin", "Pin a comment", MapPin],
            ["rectangle", "Draw rectangle", Square],
            ["ellipse", "Draw ellipse", Circle],
            ["pen", "Draw freehand", Pencil],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            aria-label={label}
            title={label}
            disabled={!canDraw}
            aria-pressed={tool === value}
            onClick={() => selectDrawingTool(value)}
          >
            <Icon size={17} />
          </button>
        ))}
        <span className="review-canvas__separator" />
        <button
          type="button"
          aria-label="Toggle 5 by 4 composition grid"
          title="5 by 4 composition grid with center guides"
          aria-pressed={grid}
          onClick={() => setGrid(!grid)}
        >
          <Grid3X3 size={17} />
        </button>
        <button
          type="button"
          aria-label="Toggle ruler guides"
          title="Ruler guides — drag to add lines; toggle off to clear"
          disabled={disabled}
          aria-pressed={tool === "ruler"}
          onClick={toggleRuler}
        >
          <Ruler size={17} />
        </button>
        {tool && tool !== "ruler" && tool !== "comment" ? (
          <div
            className="review-canvas__colors"
            role="group"
            aria-label="Annotation color"
          >
            {ANNOTATION_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Annotation color ${c}`}
                aria-pressed={color === c}
                style={{ background: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        ) : null}
        {draftShapes.length > 0 ? (
          <div className="review-canvas__draft-tools">
            <span>
              {draftShapes.length} {draftShapes.length === 1 ? "mark" : "marks"}
            </span>
            <button
              type="button"
              aria-label="Undo annotation"
              disabled={busy}
              onClick={() =>
                onAnnotation(combineAnnotations(draftShapes.slice(0, -1)))
              }
            >
              <Undo2 size={14} />
            </button>
            <button
              type="button"
              aria-label="Clear draft annotations"
              disabled={busy}
              onClick={() => {
                onAnnotation(null);
                setInline(null);
              }}
            >
              <X size={14} />
            </button>
          </div>
        ) : null}
        {rulerGuides.length > 0 && tool === "ruler" ? (
          <div className="review-canvas__ruler-status" role="status">
            <Ruler size={14} />
            {rulerGuides.length} {rulerGuides.length === 1 ? "guide" : "guides"}
            <button
              type="button"
              aria-label="Clear ruler guides"
              onClick={() => {
                setRulerGuides([]);
                setRulerPreview(null);
              }}
            >
              <X size={14} />
            </button>
          </div>
        ) : null}
        {tool ? (
          <div className="review-canvas__hint" role="status">
            {tool === "pin" || tool === "comment"
              ? "Click the frame to pin your comment"
              : tool === "ruler"
                ? "Drag to add a guide line; toggle the ruler off to clear all lines"
                : "Drag on the frame to draw"}
            <button
              type="button"
              aria-label="Cancel drawing"
              onClick={() => {
                setTool(null);
                setPreview(null);
                setRulerGuides([]);
                setRulerPreview(null);
                drag.current = null;
              }}
            >
              <X size={14} />
            </button>
          </div>
        ) : null}
      </div>
      <label className="review-canvas__zoom">
        <span className="sr-only">Video zoom</span>
        <Select
          aria-label="Video zoom"
          value={zoom}
          onChange={(e) => onZoom(Number(e.target.value))}
        >
          {[0.5, 0.75, 1, 1.5, 2].map((z) => (
            <option key={z} value={z}>
              {z === 1 ? "Fit" : `${z * 100}%`}
            </option>
          ))}
        </Select>
      </label>
    </div>
  );
  return (
    <>
      {toolbarTarget ? createPortal(toolbar, toolbarTarget) : toolbar}
      <div
        ref={canvas}
        className={`review-canvas ${tool ? "is-drawing" : ""}`}
        role="group"
        tabIndex={tool === "comment" ? 0 : undefined}
        aria-label="On-video annotations"
        onKeyDown={(event) => {
          if (tool !== "comment" || !canDraw || event.key !== "Enter") return;
          event.preventDefault();
          event.stopPropagation();
          commit(
            { kind: "pin", color, x: 0.49, y: 0.49, width: 0.02, height: 0.02 },
            { x: 0.5, y: 0.5 },
          );
        }}
        style={{
          width: width || "100%",
          height: height || "100%",
          transform: `scale(${zoom})`,
        }}
        onPointerDown={(event) => {
          if (
            !tool ||
            disabled ||
            (tool !== "ruler" && !canDraw) ||
            event.button !== 0
          )
            return;
          event.preventDefault();
          onPause();
          event.currentTarget.setPointerCapture(event.pointerId);
          const start = point(event);
          drag.current = { start, points: [start], pointerId: event.pointerId };
          if (tool === "pin" || tool === "comment") {
            commit(
              {
                kind: "pin",
                color,
                x: Math.max(0, Math.min(0.98, start.x - 0.01)),
                y: Math.max(0, Math.min(0.98, start.y - 0.01)),
                width: 0.02,
                height: 0.02,
              },
              start,
            );
            drag.current = null;
          }
        }}
        onPointerMove={(event) => {
          const active = drag.current;
          if (!active || active.pointerId !== event.pointerId || !tool) return;
          const end = point(event);
          if (tool === "comment") return;
          if (tool === "pen" && active.points.length < 199)
            active.points.push(end);
          if (pointerFrame.current !== null)
            cancelAnimationFrame(pointerFrame.current);
          pointerFrame.current = requestAnimationFrame(() => {
            pointerFrame.current = null;
            if (drag.current !== active) return;
            if (tool === "ruler") setRulerPreview({ start: active.start, end });
            else
              setPreview(
                makeAnnotation(tool, active.start, end, color, [
                  ...active.points,
                  end,
                ]),
              );
          });
        }}
        onPointerUp={(event) => {
          const active = drag.current;
          if (
            !active ||
            active.pointerId !== event.pointerId ||
            !tool ||
            tool === "comment"
          )
            return;
          drag.current = null;
          const end = point(event);
          if (tool === "ruler") {
            if (
              Math.hypot(end.x - active.start.x, end.y - active.start.y) >=
              0.005
            )
              setRulerGuides((current) => [
                ...current,
                { start: active.start, end },
              ]);
            setRulerPreview(null);
            return;
          }
          if (
            Math.hypot(end.x - active.start.x, end.y - active.start.y) <
              0.005 &&
            tool !== "pen"
          ) {
            setPreview(null);
            return;
          }
          commit(
            makeAnnotation(tool, active.start, end, color, [
              ...active.points,
              end,
            ]),
            end,
          );
        }}
        onPointerCancel={() => {
          drag.current = null;
          setPreview(null);
          if (tool === "ruler") {
            setRulerGuides([]);
            setRulerPreview(null);
          }
          setTool(null);
        }}
      >
        <svg
          viewBox={`0 0 ${frameWidth} ${frameHeight}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {grid ? (
            <g
              stroke="#ffffff85"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            >
              {[1, 2, 3, 4].map((n) => (
                <line
                  key={`column-${n}`}
                  x1={(n * frameWidth) / 5}
                  y1="0"
                  x2={(n * frameWidth) / 5}
                  y2={frameHeight}
                />
              ))}
              {[1, 3].map((n) => (
                <line
                  key={`row-${n}`}
                  x1="0"
                  y1={(n * frameHeight) / 4}
                  x2={frameWidth}
                  y2={(n * frameHeight) / 4}
                />
              ))}
            </g>
          ) : null}
          {grid ? (
            <g
              stroke="#a78bfa"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            >
              <line
                x1={frameWidth / 2}
                y1="0"
                x2={frameWidth / 2}
                y2={frameHeight}
              />
              <line
                x1="0"
                y1={frameHeight / 2}
                x2={frameWidth}
                y2={frameHeight / 2}
              />
            </g>
          ) : null}
          {shapeList.map((shape, index) => (
            <Shape
              key={index}
              shape={shape}
              marker={`${id}-shape-${index}`}
              frameWidth={frameWidth}
              frameHeight={frameHeight}
            />
          ))}
          {preview ? (
            <Shape
              shape={preview}
              marker={`${id}-preview`}
              frameWidth={frameWidth}
              frameHeight={frameHeight}
            />
          ) : null}
          {rulerGuides.map((guide, index) => (
            <line
              key={`ruler-guide-${index}`}
              x1={guide.start.x * frameWidth}
              y1={guide.start.y * frameHeight}
              x2={guide.end.x * frameWidth}
              y2={guide.end.y * frameHeight}
              stroke="#38bdf8"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {rulerPreview ? (
            <g
              stroke="#38bdf8"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            >
              <line
                x1={rulerPreview.start.x * frameWidth}
                y1={rulerPreview.start.y * frameHeight}
                x2={rulerPreview.end.x * frameWidth}
                y2={rulerPreview.end.y * frameHeight}
              />
            </g>
          ) : null}
        </svg>
      </div>
      {inline && draftShapes.length > 0 && !readOnly ? (
        <div
          className="review-canvas__composer"
          style={{
            left: `clamp(8px, calc(50% + ${(inline.x - 0.5) * width * zoom}px), calc(100% - min(300px, 100% - 16px) - 8px))`,
            top: `clamp(8px, calc(50% + ${(inline.y - 0.5) * height * zoom}px), calc(100% - 120px))`,
          }}
          role="group"
          aria-label="Floating comment composer"
        >
          <div className="review-canvas__composer-heading">
            <span>
              {busy
                ? "Saving comment…"
                : `Comment at ${formatReviewTime(draftTime ?? time)}`}
            </span>
            <button
              type="button"
              aria-label="Close on-video comment"
              onClick={() => setInline(null)}
            >
              <X size={14} />
            </button>
          </div>
          <div className="review-canvas__composer-input">
            <textarea
              ref={input}
              aria-label="On-video comment"
              placeholder="Add a comment…"
              value={draftBody}
              readOnly={busy}
              maxLength={4000}
              rows={1}
              onChange={(e) => setDraftBody(e.target.value)}
              onKeyDown={(e) => {
                if (
                  !e.nativeEvent.isComposing &&
                  !e.shiftKey &&
                  e.key === "Enter"
                ) {
                  e.preventDefault();
                  onPost();
                }
                if (e.key === "Escape") setInline(null);
              }}
            />
            <button
              type="button"
              className="review-canvas__send"
              aria-label={busy ? "Saving comment" : "Send on-video comment"}
              disabled={busy || !draftBody.trim()}
              onClick={onPost}
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      ) : null}
      {notice ? (
        <span className="review-canvas__hint" role="status">
          {notice}
          <button
            type="button"
            aria-label="Dismiss drawing notice"
            onClick={() => setNotice("")}
          >
            <X size={14} />
          </button>
        </span>
      ) : null}
    </>
  );
}
