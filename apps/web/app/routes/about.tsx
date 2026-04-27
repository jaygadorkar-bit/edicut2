import { demoTestimonials } from "@edicut/shared";
import { Link } from "react-router";

export default function AboutRoute() {
  return (
    <main className="public-page">
      <section className="panel public-hero">
        <p className="eyebrow">About EdiCut</p>
        <h1 className="public-title">
          Crafting stronger publishing
          <br />
          systems for modern video teams
        </h1>
        <p className="public-copy">
          The earlier EdiCut experience was built around a cinematic studio feel: bold
          presentation, premium editing language, and a workflow-first story for creators who ship
          every week.
        </p>
      </section>

      <section className="public-two-up">
        <article className="panel public-story-card">
          <p className="eyebrow">The Studio Philosophy</p>
          <h2>Editorial systems should feel premium before the first revision even starts.</h2>
          <p>
            EdiCut was positioned as a partner for YouTubers, brands, and campaign teams that need
            cleaner handoff, sharper storytelling, and delivery that does not collapse under weekly
            publishing pressure.
          </p>
          <p>
            The older UI reflected that directly: darker mood, stronger contrast, and messaging
            centered on retention, consistency, and post-production discipline.
          </p>
        </article>

        <article className="panel public-visual-card public-about-visual">
          <div>
            <p className="eyebrow">Inside The Edit Suite</p>
            <h2>Built for clear approvals, not endless back-and-forth.</h2>
            <p>
              Strategy, pacing, graphics, review loops, and export delivery are treated as one
              coherent production system.
            </p>
          </div>
        </article>
      </section>

      <section className="public-testimonials">
        {demoTestimonials.map((testimonial) => (
          <article className="panel testimonial-card testimonial-card-dark" key={testimonial.name}>
            <p className="testimonial-quote">“{testimonial.quote}”</p>
            <p className="meta-value">{testimonial.name}</p>
            <p className="meta-label">{testimonial.role}</p>
          </article>
        ))}
      </section>

      <section className="public-cta panel">
        <p className="eyebrow">Next Step</p>
        <h2>Bring the old studio experience back into your workflow.</h2>
        <p>
          Explore the package tiers or send a brief if you need a more tailored editing pipeline.
        </p>
        <div className="cinema-hero-cta">
          <Link className="primary-button" to="/pricing">
            Explore Services
          </Link>
          <Link className="ghost-button" to="/contact">
            Contact Us
          </Link>
        </div>
      </section>
    </main>
  );
}
