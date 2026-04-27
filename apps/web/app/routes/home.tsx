import { Link } from "react-router";

const workflowSteps = [
  {
    step: "01",
    title: "Pick The Video Style",
    description:
      "Choose the editing tier that matches your channel, from clean talking-head cuts to higher-energy YouTube packaging.",
  },
  {
    step: "02",
    title: "Upload Footage & Assets",
    description:
      "Send footage, references, brand assets, and direction through a clean intake so production starts without messy handoff gaps.",
  },
  {
    step: "03",
    title: "Review Before You Publish",
    description:
      "Leave timestamped notes, get fast revisions, and ship a final export that is ready for your release window.",
  },
];

const differentiators = [
  {
    title: "Dedicated Editing Team",
    description:
      "A lead editor and reviewer keep style, pacing, and polish consistent across recurring uploads.",
  },
  {
    title: "Fast, Predictable Turnaround",
    description:
      "First drafts land on a dependable cadence so your team can plan around real delivery windows.",
  },
  {
    title: "Built For Retention",
    description:
      "Hooks, captions, cut rhythm, and emphasis points are shaped for stronger audience watch time.",
  },
  {
    title: "Repurposing Ready",
    description:
      "One shoot can become a flagship video, short clips, promos, and social cutdowns without rebuilding the workflow.",
  },
];

export default function HomeRoute() {
  return (
    <main className="cinema-home">
      <section className="cinema-hero">
        <img
          className="cinema-hero-image"
          src="https://images.unsplash.com/photo-1744686959591-eaaec00c999c?auto=format&fit=crop&w=2400&q=80"
          alt="Cinematic editing suite workspace"
        />
        <div className="cinema-hero-overlay" />
        <div className="cinema-hero-content">
          <p className="cinema-badge">Trusted Editing Workflow For Growing Channels</p>
          <h1>
            YouTube Editing
            <br />
            Built for Channels That Need to Grow
          </h1>
          <p className="cinema-subtext">
            We edit talking-head videos, vlogs, tech breakdowns, podcasts, and retention-focused
            content built for cleaner approvals and dependable weekly output.
          </p>
          <div className="cinema-hero-cta">
            <Link className="primary-button" to="/pricing">
              Book Your Editor
            </Link>
            <Link className="ghost-button" to="/portfolio">
              Watch Sample Cuts
            </Link>
          </div>
          <div className="cinema-stat-grid">
            <article className="cinema-stat-card">
              <p>Channels Supported</p>
              <strong>120+</strong>
            </article>
            <article className="cinema-stat-card">
              <p>Videos Delivered</p>
              <strong>2,400+</strong>
            </article>
            <article className="cinema-stat-card">
              <p>Average First Draft</p>
              <strong>48 Hours</strong>
            </article>
            <article className="cinema-stat-card">
              <p>Client Rating</p>
              <strong>4.9/5</strong>
            </article>
          </div>
        </div>
      </section>

      <section className="cinema-strip panel">
        <p>Trusted by high-output teams and ambitious creators</p>
        <div className="cinema-logo-row">
          <span>Aura Media</span>
          <span>Northframe</span>
          <span>CreatorLab</span>
          <span>MonoCast</span>
          <span>Pixel Post</span>
          <span>Studio 28</span>
        </div>
      </section>

      <section className="cinema-section panel">
        <p className="eyebrow">Workflow</p>
        <h2>Choose Package, Upload, Review</h2>
        <p className="section-copy">
          The workflow is shaped around how YouTube teams actually work: fast handoff, clear
          notes, and a repeatable delivery rhythm.
        </p>
        <div className="cinema-inline-stats">
          <article>
            <p>Channel-ready intake</p>
            <strong>Up to 100GB</strong>
          </article>
          <article>
            <p>Feedback loops</p>
            <strong>Timestamped notes</strong>
          </article>
          <article>
            <p>Upload rhythm</p>
            <strong>Weekly-friendly</strong>
          </article>
        </div>
        <div className="cinema-process-grid">
          {workflowSteps.map((item) => (
            <article key={item.step}>
              <span>Step {item.step}</span>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="cinema-section panel">
        <p className="eyebrow">Differentiators</p>
        <h2>Built for reliable output, not one-off edits</h2>
        <div className="cinema-feature-grid">
          {differentiators.map((item) => (
            <article key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="cinema-section panel">
        <p className="eyebrow">Portfolio Showcase</p>
        <h2>Proof from real production workflows</h2>
        <div className="cinema-bento">
          <article className="big" style={{ backgroundImage: "url(https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=1200&q=80)" }}>
            <span>Long-form</span>
            <h3>Channel Documentary Cut</h3>
          </article>
          <article style={{ backgroundImage: "url(https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&w=900&q=80)" }}>
            <span>Commentary</span>
            <h3>Retention-Focused Cuts</h3>
          </article>
          <article style={{ backgroundImage: "url(https://images.unsplash.com/photo-1601506521937-0121a7fc2a6b?auto=format&fit=crop&w=900&q=80)" }}>
            <span>Product</span>
            <h3>Feature Breakdown Episode</h3>
          </article>
        </div>
        <div className="cinema-proof-grid">
          <article>
            <p>Case Study</p>
            <h3>Aura Media</h3>
            <strong>+45% Audience Retention</strong>
          </article>
          <article>
            <p>Case Study</p>
            <h3>MonoCast</h3>
            <strong>12 Short Clips Per Recording</strong>
          </article>
          <article>
            <p>Case Study</p>
            <h3>Northframe</h3>
            <strong>2x Publishing Consistency</strong>
          </article>
        </div>
      </section>

      <section className="cinema-section panel">
        <p className="eyebrow">Testimonials & Results</p>
        <h2>Proof from teams shipping every week</h2>
        <div className="cinema-inline-stats">
          <article>
            <p>Avg. Retention Lift</p>
            <strong>+45%</strong>
          </article>
          <article>
            <p>Clips Per Shoot</p>
            <strong>12</strong>
          </article>
          <article>
            <p>Publishing Consistency</p>
            <strong>2x</strong>
          </article>
        </div>
        <div className="cinema-testimonial-grid">
          <article>
            <p className="stars">★★★★★</p>
            <p>
              The quality jump was immediate. Revisions got cleaner and our episodes started
              landing on schedule again.
            </p>
            <strong>Ariana Cole</strong>
            <span>YouTube Educator</span>
          </article>
          <article>
            <p className="stars">★★★★★</p>
            <p>
              Our team stopped juggling random freelancers. It finally feels like one coherent
              post-production pipeline.
            </p>
            <strong>Marcus Vale</strong>
            <span>Podcast Host</span>
          </article>
          <article>
            <p className="stars">★★★★★</p>
            <p>
              We hand off footage and get focused edits back fast. The retention improvements were
              obvious in weeks.
            </p>
            <strong>Nina Hart</strong>
            <span>Brand Channel Lead</span>
          </article>
        </div>
      </section>

      <section className="cinema-section panel">
        <p className="eyebrow">Pricing</p>
        <h2>Choose your editing tier</h2>
        <div className="cinema-pricing-grid">
          <article>
            <h3>Basic</h3>
            <p className="price">$49</p>
            <p>Clean edits for straightforward uploads.</p>
            <Link className="primary-button" to="/pricing">Buy Basic</Link>
          </article>
          <article className="featured">
            <h3>Medium</h3>
            <p className="price">$149</p>
            <p>Best for active channels optimizing retention.</p>
            <Link className="primary-button" to="/pricing">Buy Medium</Link>
          </article>
          <article>
            <h3>Pro</h3>
            <p className="price">$499</p>
            <p>High-touch editing for flagship content.</p>
            <Link className="primary-button" to="/pricing">Buy Pro</Link>
          </article>
        </div>
      </section>

      <section className="cinema-section panel cinema-faq">
        <div>
          <p className="eyebrow">FAQ</p>
          <h2>Common questions before kickoff</h2>
          <p className="section-copy">
            Answers around onboarding, revisions, content types, and custom workflows.
          </p>
        </div>
        <div className="cinema-faq-list">
          <article>
            <h3>How does onboarding work?</h3>
            <p>Choose a package, complete intake, and share footage plus references.</p>
          </article>
          <article>
            <h3>Do you support short-form and long-form editing?</h3>
            <p>Yes. We handle flagship edits and generate short-form versions from source content.</p>
          </article>
          <article>
            <h3>How do revisions get handled?</h3>
            <p>Feedback is submitted with timestamps so editors can apply precise updates quickly.</p>
          </article>
          <article>
            <h3>Can we use a custom workflow?</h3>
            <p>Yes. Teams can add custom checkpoints, cadence, and graphics intensity.</p>
          </article>
        </div>
      </section>

      <section className="cinema-final-cta panel">
        <h2>Ready to ship your next release?</h2>
        <p>
          Move from raw footage to publish-ready edits with a team built for consistent weekly
          momentum.
        </p>
        <div className="cinema-hero-cta">
          <Link className="primary-button" to="/pricing">
            See Pricing
          </Link>
          <Link className="ghost-button" to="/contact">
            Book a Call
          </Link>
        </div>
      </section>
    </main>
  );
}
