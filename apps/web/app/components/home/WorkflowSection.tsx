import { workflowSteps } from "./data";

export function WorkflowSection() {
  return (
    <section id="workflow" className="bg-[#F9F9F9] px-5 py-20 sm:px-6 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#FF0000]">Workflow</p>
          <h2 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">A simple path from raw footage to final upload.</h2>
          <p className="mt-5 text-lg leading-8 text-[#717171]">
            Every public package follows the same clean operating rhythm: choose, upload, review.
          </p>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {workflowSteps.map((item) => (
            <article key={item.step} className="rounded-2xl border border-gray-200 bg-white p-7 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-sm font-black text-[#717171]">{item.step}</span>
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-[#FF0000]">
                  <span className="material-symbols-outlined">{item.icon}</span>
                </span>
              </div>
              <h3 className="mt-8 text-2xl font-black">{item.title}</h3>
              <p className="mt-3 leading-7 text-[#717171]">{item.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
