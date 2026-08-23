import { Avatar } from "./WorkspaceShell";

type Tone = "purple" | "blue" | "yellow" | "pink";

const toneClasses: Record<Tone, { gradient: string; border: string; soft: string; text: string; bar: string }> = {
  purple: { gradient: "from-[#a47bf4] to-[#7c62e9]", border: "border-[#9876ec]", soft: "bg-[#f0eaff]", text: "text-[#6448cc]", bar: "bg-[#6a50d8]" },
  blue: { gradient: "from-[#77a0f2] to-[#6284e7]", border: "border-[#7897ec]", soft: "bg-[#e9efff]", text: "text-[#4d6ac4]", bar: "bg-[#5274d6]" },
  yellow: { gradient: "from-[#ffd268] to-[#f7b735]", border: "border-[#f5c14a]", soft: "bg-[#fff6dd]", text: "text-[#a86d08]", bar: "bg-[#e5a827]" },
  pink: { gradient: "from-[#f56bbc] to-[#e957a3]", border: "border-[#ee62b0]", soft: "bg-[#ffebf7]", text: "text-[#c03a86]", bar: "bg-[#cf3e91]" },
};

export type WorkspaceProject = {
  title: string;
  description: string;
  tone: Tone;
  progress: number;
  members: string[];
  count: string;
};

export function WorkspaceProjectStrip({ projects }: { projects: WorkspaceProject[] }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.17em] text-[#9699ac]">Active workspaces</p>
          <h2 className="mt-1 text-lg font-black tracking-[-0.035em]">Your projects</h2>
        </div>
        <button type="button" className="hidden text-xs font-black text-[#6d55e8] sm:block">View all projects</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {projects.map((project) => {
          const colors = toneClasses[project.tone];
          return (
            <article key={project.title} className={`relative min-h-[126px] overflow-hidden rounded-[17px] border ${colors.border} bg-gradient-to-br ${colors.gradient} p-4 text-white shadow-[0_12px_26px_rgba(83,70,180,0.12)]`}>
              <div className="absolute -right-6 -top-8 h-24 w-24 rounded-full border-[13px] border-white/10" />
              <div className="relative flex items-start justify-between gap-2">
                <div className="flex -space-x-1.5">
                  {project.members.map((member) => <Avatar key={member} name={member} size="sm" />)}
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/30 text-[9px] font-black">{project.count}</span>
                </div>
                <span className="material-symbols-outlined text-[18px] text-white/80">more_vert</span>
              </div>
              <h3 className="relative mt-3 text-sm font-black">{project.title}</h3>
              <p className="relative mt-0.5 truncate text-[10px] font-bold text-white/80">{project.description}</p>
              <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-black/10">
                <div className="h-full rounded-full bg-white/85" style={{ width: `${project.progress}%` }} />
              </div>
            </article>
          );
        })}
      </div>
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
          <section key={column.title} className="min-h-[178px] rounded-[17px] bg-white/80 p-3 shadow-[0_7px_24px_rgba(44,49,100,0.045)] ring-1 ring-white">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-black">{column.title}</h3>
              <button type="button" className="text-[#878a9d]" aria-label={`${column.title} options`}><span className="material-symbols-outlined text-[17px]">more_vert</span></button>
            </div>
            <div className="mt-3 grid gap-2">
              {column.tasks.map((task) => {
                const colors = toneClasses[task.tone];
                return (
                  <article key={task.title} className={`rounded-xl border ${task.done ? "border-[#e5e8f1] bg-[#fbfbfe]" : "border-transparent bg-[#f8f8fc]"} p-2.5`}>
                    <div className="flex items-start gap-2">
                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${colors.soft} ${colors.text}`}>
                        <span className="material-symbols-outlined text-[13px]">{task.done ? "check" : "description"}</span>
                      </span>
                      <p className={`min-w-0 flex-1 text-[11px] font-bold leading-4 ${task.done ? "text-[#9b9dae] line-through" : "text-[#4d4e62]"}`}>{task.title}</p>
                      {task.done ? <span className="material-symbols-outlined text-[15px] text-[#62b78f]">check_circle</span> : null}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 pl-7">
                      <span className="truncate text-[9px] font-bold text-[#a2a4b3]">{task.meta}</span>
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
    <section className="overflow-hidden rounded-[20px] bg-white p-4 shadow-[0_9px_30px_rgba(44,49,100,0.05)] sm:p-5">
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
