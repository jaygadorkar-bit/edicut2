import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent, type UIEvent } from "react";
import { Avatar } from "./WorkspaceShell";

type Tone = "purple" | "blue" | "yellow" | "pink";

const toneClasses: Record<Tone, { gradient: string; border: string; soft: string; text: string; bar: string }> = {
  purple: { gradient: "from-[#f4effb] to-[#e7e0f3]", border: "border-[#ded3ec]", soft: "bg-[#eee7f7]", text: "text-[#665678]", bar: "bg-[#8a73a9]" },
  blue: { gradient: "from-[#eef4fb] to-[#dfeaf2]", border: "border-[#d5e2ed]", soft: "bg-[#e5eef6]", text: "text-[#526b7e]", bar: "bg-[#6d8da5]" },
  yellow: { gradient: "from-[#fbf5e7] to-[#f2e8ca]", border: "border-[#eee0bd]", soft: "bg-[#f7efd8]", text: "text-[#8b7241]", bar: "bg-[#b89b5d]" },
  pink: { gradient: "from-[#faeef3] to-[#f1dfe7]", border: "border-[#edd6e1]", soft: "bg-[#f7e7ee]", text: "text-[#8d6072]", bar: "bg-[#b77b92]" },
};

export type WorkspaceProject = {
  title: string;
  description: string;
  tone: Tone;
  progress: number;
  members: string[];
  count: string;
};

export function WorkspaceProjectStrip({ projects, mobileCarousel = false }: { projects: WorkspaceProject[]; mobileCarousel?: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const carouselId = useId();
  const [activeProject, setActiveProject] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ pointerId: -1, startX: 0, lastX: 0, lastTime: 0, velocity: 0, dragging: false });
  const momentumFrameRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (momentumFrameRef.current !== null) cancelAnimationFrame(momentumFrameRef.current);
  }, []);

  function handleTrackScroll(event: UIEvent<HTMLDivElement>) {
    const track = event.currentTarget;
    const center = track.scrollLeft + track.clientWidth / 2;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    Array.from(track.children).forEach((child, index) => {
      const slide = child as HTMLElement;
      const slideCenter = slide.offsetLeft + slide.offsetWidth / 2;
      const distance = Math.abs(center - slideCenter);
      if (distance < nearestDistance) {
        nearestIndex = index;
        nearestDistance = distance;
      }
    });

    setActiveProject((current) => current === nearestIndex ? current : nearestIndex);
  }

  function scrollToProject(index: number) {
    const track = trackRef.current;
    const slide = track?.children[index] as HTMLElement | undefined;
    if (!track || !slide) return;
    if (momentumFrameRef.current !== null) cancelAnimationFrame(momentumFrameRef.current);
    momentumFrameRef.current = null;
    setIsDragging(false);

    const trackPadding = Number.parseFloat(window.getComputedStyle(track).paddingLeft) || 0;
    const behavior: ScrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    track.scrollTo({ left: Math.max(0, slide.offsetLeft - trackPadding), behavior });
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    const track = event.currentTarget;
    if (track.scrollWidth <= track.clientWidth) return;
    if (momentumFrameRef.current !== null) cancelAnimationFrame(momentumFrameRef.current);
    momentumFrameRef.current = null;
    setIsDragging(false);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      lastX: event.clientX,
      lastTime: performance.now(),
      velocity: 0,
      dragging: false,
    };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const track = event.currentTarget;
    const drag = dragRef.current;
    if (drag.pointerId !== event.pointerId) return;
    if (!drag.dragging && Math.abs(event.clientX - drag.startX) < 6) return;

    if (!drag.dragging) {
      track.setPointerCapture(event.pointerId);
      drag.dragging = true;
      setIsDragging(true);
    }

    event.preventDefault();
    const now = performance.now();
    const elapsed = Math.max(now - drag.lastTime, 1);
    const deltaX = event.clientX - drag.lastX;
    track.scrollLeft -= deltaX;
    drag.velocity = Math.max(-2.5, Math.min(2.5, -deltaX / elapsed));
    drag.lastX = event.clientX;
    drag.lastTime = now;
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const track = event.currentTarget;
    const drag = dragRef.current;
    if (drag.pointerId !== event.pointerId) return;
    if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId);
    drag.pointerId = -1;
    if (!drag.dragging || event.type === "pointercancel" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setIsDragging(false);
      return;
    }

    let velocity = drag.velocity * 16;
    const coast = () => {
      track.scrollLeft += velocity;
      velocity *= 0.94;
      if (Math.abs(velocity) < 0.15) {
        momentumFrameRef.current = null;
        setIsDragging(false);
        return;
      }
      momentumFrameRef.current = requestAnimationFrame(coast);
    };
    if (Math.abs(velocity) >= 0.15) momentumFrameRef.current = requestAnimationFrame(coast);
    else setIsDragging(false);
  }

  return (
    <section className={mobileCarousel ? "neo-workspace__project-section" : undefined} aria-labelledby={`${carouselId}-heading`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.17em] text-[#9699ac]">Active workspaces</p>
          <h2 id={`${carouselId}-heading`} className="mt-1 text-lg font-black tracking-[-0.035em]">Your projects</h2>
        </div>
        <button type="button" className="hidden text-xs font-black text-[#6d55e8] sm:block">View all projects</button>
      </div>
      <div
        ref={trackRef}
        id={mobileCarousel ? `${carouselId}-slides` : undefined}
        className={mobileCarousel ? `neo-workspace__project-track neo-workspace__project-track--carousel ${isDragging ? "is-dragging" : ""}` : "grid gap-3 sm:grid-cols-2 xl:grid-cols-4"}
        role={mobileCarousel ? "region" : undefined}
        aria-label={mobileCarousel ? "Your active projects" : undefined}
        aria-roledescription={mobileCarousel ? "carousel" : undefined}
        onScroll={mobileCarousel ? handleTrackScroll : undefined}
        onPointerDown={mobileCarousel ? handlePointerDown : undefined}
        onPointerMove={mobileCarousel ? handlePointerMove : undefined}
        onPointerUp={mobileCarousel ? handlePointerUp : undefined}
        onPointerCancel={mobileCarousel ? handlePointerUp : undefined}
      >
        {projects.map((project, index) => {
          const colors = toneClasses[project.tone];
          return (
            <article
              key={project.title}
              className={`neo-workspace__project-card neo-workspace__project-slide relative min-h-[126px] overflow-hidden rounded-[17px] border ${colors.border} bg-gradient-to-br ${colors.gradient} p-4 text-[#17202a]`}
              role={mobileCarousel ? "group" : undefined}
              aria-roledescription={mobileCarousel ? "slide" : undefined}
              aria-label={mobileCarousel ? `${index + 1} of ${projects.length}: ${project.title}` : undefined}
            >
              <div className="absolute -right-6 -top-8 h-24 w-24 rounded-full border-[13px] border-white/45" />
              <div className="relative flex items-start justify-between gap-2">
                <div className="flex -space-x-1.5">
                  {project.members.map((member) => <Avatar key={member} name={member} size="sm" />)}
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/60 text-[9px] font-black text-[#53606b]">{project.count}</span>
                </div>
                <span className="material-symbols-outlined text-[18px] text-[#687583]">more_vert</span>
              </div>
              <h3 className="relative mt-3 text-sm font-black">{project.title}</h3>
              <p className="relative mt-0.5 truncate text-[10px] font-bold text-[#687583]">{project.description}</p>
              <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-black/10">
                <div className={`h-full rounded-full ${colors.bar}`} style={{ width: `${project.progress}%` }} />
              </div>
            </article>
          );
        })}
      </div>
      {mobileCarousel && projects.length > 1 ? (
        <div className="neo-workspace__project-controls" role="group" aria-label="Project slider controls">
          <button
            type="button"
            className="neo-workspace__carousel-arrow"
            aria-label="Previous project"
            onClick={() => scrollToProject(Math.max(0, activeProject - 1))}
            disabled={activeProject === 0}
          >
            <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
          </button>
          <div className="neo-workspace__carousel-pagination" aria-label="Choose a project">
            {projects.map((project, index) => (
              <button
                key={`${project.title}-pagination`}
                type="button"
                className={`neo-workspace__carousel-dot ${activeProject === index ? "is-active" : ""}`}
                aria-label={`Show project ${index + 1}: ${project.title}`}
                aria-pressed={activeProject === index}
                onClick={() => scrollToProject(index)}
              />
            ))}
          </div>
          <span className="neo-workspace__carousel-count" aria-live="polite">
            {String(activeProject + 1).padStart(2, "0")} <span aria-hidden="true">/</span> {String(projects.length).padStart(2, "0")}
          </span>
          <button
            type="button"
            className="neo-workspace__carousel-arrow"
            aria-label="Next project"
            onClick={() => scrollToProject(Math.min(projects.length - 1, activeProject + 1))}
            disabled={activeProject === projects.length - 1}
          >
            <span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
          </button>
        </div>
      ) : null}
    </section>
  );
}

export type WorkspaceTask = {
  title: string;
  meta: string;
  tone: Tone;
  members?: string[];
  done?: boolean;
};

export type WorkspaceColumn = {
  title: string;
  tasks: WorkspaceTask[];
};

export function WorkspaceBoard({ columns }: { columns: WorkspaceColumn[] }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.17em] text-[#9699ac]">Project flow</p>
          <h2 className="mt-1 text-lg font-black tracking-[-0.035em]">Task board</h2>
        </div>
        <button type="button" className="inline-flex h-8 items-center gap-1 rounded-full bg-white px-3 text-[10px] font-black text-[#6d55e8] shadow-[0_5px_16px_rgba(44,49,100,0.06)]">
          <span className="material-symbols-outlined text-[15px]">add</span>
          Add task
        </button>
      </div>
      <div className="grid gap-3 lg:grid-cols-4">
        {columns.map((column) => (
          <section key={column.title} className="neo-workspace__panel min-h-[178px] rounded-[17px] p-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-black">{column.title}</h3>
              <button type="button" className="text-[#878a9d]" aria-label={`${column.title} options`}><span className="material-symbols-outlined text-[17px]">more_vert</span></button>
            </div>
            <div className="mt-3 grid gap-2">
              {column.tasks.map((task) => {
                const colors = toneClasses[task.tone];
                return (
                  <article key={task.title} className={`neo-workspace__task rounded-xl border ${task.done ? "border-[#e2e6eb] bg-[#f6f8f9]" : "border-transparent bg-[#e9eef2]"} p-2.5`}>
                    <div className="flex items-start gap-2">
                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${colors.soft} ${colors.text}`}>
                        <span className="material-symbols-outlined text-[13px]">{task.done ? "check" : "description"}</span>
                      </span>
                      <p className={`min-w-0 flex-1 text-[11px] font-bold leading-4 ${task.done ? "text-[#9099a2] line-through" : "text-[#34414b]"}`}>{task.title}</p>
                      {task.done ? <span className="material-symbols-outlined text-[15px] text-[#5a9b7b]">check_circle</span> : null}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 pl-7">
                      <span className="truncate text-[9px] font-bold text-[#7b8790]">{task.meta}</span>
                      {task.members?.length ? <div className="flex -space-x-1.5">{task.members.map((member) => <Avatar key={member} name={member} size="sm" />)}</div> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

export function WorkspaceSchedule({ accent = "purple" }: { accent?: Tone }) {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const cards = [
    { day: 0, row: 1, title: "Creating a seamless mobile app...", tone: "blue" as Tone },
    { day: 1, row: 3, title: "The exciting world of API integrations...", tone: "pink" as Tone },
    { day: 2, row: 3, title: "Enhance your skills and knowledge...", tone: "yellow" as Tone },
    { day: 3, row: 1, title: "Designs intuitive and engaging...", tone: "purple" as Tone },
    { day: 4, row: 3, title: "Test with real users to ensure...", tone: "yellow" as Tone },
    { day: 5, row: 3, title: "Prototyping and create world of API...", tone: "purple" as Tone },
    { day: 6, row: 2, title: "Provide a short explanation...", tone: "pink" as Tone },
  ];
  const accentColor = toneClasses[accent].bar;

  return (
    <section className="neo-workspace__panel overflow-hidden rounded-[20px] p-4 sm:p-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.17em] text-[#9699ac]">Weekly plan</p>
          <h2 className="mt-1 text-lg font-black tracking-[-0.035em]">Task management</h2>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-[#f4f5fb] p-1 text-[10px] font-black">
          {(["Month", "Day", "Week"] as const).map((view) => <button key={view} type="button" className={`rounded-full px-3 py-1.5 ${view === "Week" ? "bg-[#6d55e8] text-white shadow-[0_4px_12px_rgba(109,85,232,0.25)]" : "text-[#9295a6]"}`}>{view}</button>)}
          <button type="button" className="px-2 text-[#9295a6]" aria-label="More calendar options"><span className="material-symbols-outlined text-[15px]">more_horiz</span></button>
        </div>
      </div>
      <div className="mt-5 overflow-x-auto pb-1">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[58px_repeat(7,minmax(84px,1fr))] border-b border-[#eef0f7] pb-3 text-center">
            <span />
            {days.map((day, index) => <div key={day} className={`text-[9px] font-bold ${index === 1 ? "text-[#5d4bd0]" : "text-[#a4a6b3]"}`}><span className="block">{day}</span><span className="mt-1 block text-[8px] font-medium">{String(8 + index).padStart(2, "0")}.08.2025</span></div>)}
          </div>
          <div className="relative grid grid-cols-[58px_repeat(7,minmax(84px,1fr))] grid-rows-6">
            <div className="pointer-events-none absolute left-[58px] right-0 top-[154px] z-10 h-0.5 bg-[#6d55e8]" style={{ backgroundColor: accentColor }}><span className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full border-2 border-white bg-[#6d55e8]" style={{ backgroundColor: accentColor }} /></div>
            {Array.from({ length: 6 }, (_, row) => <div key={`time-${row}`} className="contents"><div className="border-b border-[#f0f1f7] py-4 text-[9px] font-black text-[#54566a]">{["08:30", "09:00", "09:30", "09:45", "10:30", "11:00"][row]}</div>{days.map((day) => <div key={`${day}-${row}`} className="border-b border-l border-[#f0f1f7] py-3" />)}</div>)}
            {cards.map((card) => { const colors = toneClasses[card.tone]; return <article key={`${card.day}-${card.title}`} className={`pointer-events-none absolute z-20 w-[82px] rounded-xl border ${colors.border} bg-gradient-to-br ${colors.gradient} p-2 text-white shadow-[0_6px_14px_rgba(77,62,160,0.12)]`} style={{ left: `calc(58px + ${(card.day + 0.15) * (100 / 7)}%)`, top: `${card.row * 51 + 10}px` }}><div className="flex items-center justify-between"><span className="material-symbols-outlined text-[13px]">description</span><span className="text-[8px] font-black">3</span></div><p className="mt-2 line-clamp-2 text-[9px] font-black leading-3">{card.title}</p><div className="mt-3 h-1 rounded-full bg-black/10"><div className="h-full w-2/3 rounded-full bg-white/80" /></div></article>; })}
          </div>
        </div>
      </div>
    </section>
  );
}
