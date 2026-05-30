import { Link } from "react-router";
import { workflowSteps } from "./data";

const workflowSummary = [
  ["Fast start", "Pick the right package and lock the scope before editing begins."],
  ["Shared context", "Upload references, notes, and assets in one place."],
  ["Review-ready output", "Iterate on the cut, then publish with fewer bottlenecks."],
] as const;

export function WorkflowSection() {
  return (
    <section
      id="workflow"
      className="bg-[radial-gradient(circle_at_top,rgba(255,0,0,0.08),transparent_40%),linear-gradient(180deg,#fff7f7_0%,#fdfdfd_46%,#ffffff_100%)] px-5 py-20 sm:px-6 lg:py-24"
    >
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-primary">Workflow</p>
          <h2 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">A simple path from raw footage to final upload.</h2>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">
            Every public package follows the same clean operating rhythm: choose, upload, review.
          </p>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-[0.92fr_1.08fr] lg:items-start lg:gap-8">
          <aside className="rounded-[2rem] border border-gray-200 bg-white p-7 shadow-sm sm:p-8 lg:sticky lg:top-28">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-primary">What the workflow removes</p>
            <h3 className="mt-4 text-3xl font-black tracking-tight text-foreground">Less back-and-forth. More publishable output.</h3>
            <p className="mt-4 max-w-xl leading-7 text-muted-foreground">
              The process is designed to make each handoff obvious, so creators spend less time clarifying the brief and more time shipping videos.
            </p>

            <dl className="mt-8 grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
              {workflowSummary.map(([title, description]) => (
                <div key={title} className="rounded-2xl border border-gray-200 bg-secondary/40 p-4">
                  <dt className="text-sm font-black uppercase tracking-[0.18em] text-foreground">{title}</dt>
                  <dd className="mt-2 text-sm leading-6 text-muted-foreground">{description}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
              <Link
                to="/pricing"
                className="inline-flex items-center justify-center rounded-2xl bg-primary px-6 py-3.5 text-sm font-black uppercase tracking-wider text-white shadow-lg shadow-primary/20 transition-transform hover:-translate-y-0.5 active:translate-y-0"
              >
                Compare packages
              </Link>
              <a
                href="#portfolio"
                className="inline-flex items-center justify-center rounded-2xl border border-gray-200 bg-white px-6 py-3.5 text-sm font-black uppercase tracking-wider text-foreground transition-colors hover:bg-secondary"
              >
                See the edits
              </a>
            </div>
          </aside>

          <div className="relative">
            <div className="absolute left-7 top-6 hidden h-[calc(100%-3rem)] w-px bg-gradient-to-b from-primary/40 via-primary/20 to-transparent lg:block" />
            <div className="grid gap-5">
              {workflowSteps.map((item, index) => (
                <article
                  key={item.step}
                  className="relative overflow-hidden rounded-[2rem] border border-gray-200 bg-white p-6 shadow-sm sm:p-7 lg:pl-8"
                >
                  <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,rgba(255,0,0,0.35),rgba(255,0,0,0.08))]" />
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                    <div className="flex items-center gap-4 sm:w-56 sm:shrink-0 sm:flex-col sm:items-start lg:w-64">
                      <div className="relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/20">
                        <span className="material-symbols-outlined text-[26px]">{item.icon}</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-3">
                          <span className="rounded-full bg-muted px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">
                            Step {Number(item.step)}
                          </span>
                          {index === 0 ? (
                            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-primary">
                              Start here
                            </span>
                          ) : null}
                        </div>
                        <h3 className="mt-3 text-2xl font-black tracking-tight text-foreground">{item.title}</h3>
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="max-w-2xl leading-7 text-muted-foreground">{item.description}</p>

                      <div className="mt-5 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border border-gray-200 bg-secondary/50 p-4">
                          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">You send</p>
                          <p className="mt-2 text-sm font-bold leading-6 text-foreground">{item.input}</p>
                        </div>
                        <div className="rounded-2xl border border-gray-200 bg-secondary/50 p-4">
                          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">We do</p>
                          <p className="mt-2 text-sm font-bold leading-6 text-foreground">{item.action}</p>
                        </div>
                        <div className="rounded-2xl border border-gray-200 bg-secondary/50 p-4">
                          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">You get</p>
                          <p className="mt-2 text-sm font-bold leading-6 text-foreground">{item.output}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
