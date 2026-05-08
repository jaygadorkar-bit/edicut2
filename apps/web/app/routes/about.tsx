import type { MetaFunction } from "react-router";
import { PageShell, WorkflowSection } from "../components/site/Marketing.js";

export const meta: MetaFunction = () => [{ title: "About EdiCut | Creator-first post production" }];

export default function AboutPage() {
  return (
    <PageShell>
      <section className="px-5 pb-16 pt-32 text-center sm:px-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Creator-first post production</p>
        <h1 className="mx-auto mt-4 max-w-4xl text-5xl font-black tracking-tight sm:text-6xl">A focused editing team for channels that publish on schedule.</h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">YouTube-native pacing, retention-focused editing, and review workflows built to reduce bottlenecks.</p>
      </section>
      <section className="bg-secondary px-5 py-20 sm:px-6">
        <div className="mx-auto max-w-5xl text-center">
          <h2 className="text-4xl font-black">Our mission is to help creators publish better videos faster.</h2>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">We combine editors, project managers, motion designers, and thumbnail support into one reliable post-production lane.</p>
        </div>
        <div className="mx-auto mt-12 grid max-w-7xl gap-5 md:grid-cols-4">
          {["Editors", "Project Managers", "Motion Designers", "Thumbnail Support"].map((role) => <article key={role} className="rounded-2xl border border-gray-200 bg-white p-6 text-xl font-black">{role}</article>)}
        </div>
      </section>
      <WorkflowSection />
    </PageShell>
  );
}
