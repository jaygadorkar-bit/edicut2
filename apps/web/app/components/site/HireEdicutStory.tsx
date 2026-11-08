import { ArrowLeft, ArrowRight, ArrowUpRight, Lightbulb } from "lucide-react";
import { Link } from "react-router";
import type { BlogPost } from "../../lib/blog";
import { BlogDate, BlogReadTime, BlogText } from "./Blog";
import { HireEdicutArtwork } from "./HireEdicutArtwork";
import { WhyHireUsFilm } from "./WhyHireUsFilm";
import { hireEdicutStoryContent as content } from "./hire-edicut-story-content";
import "../../styles/why-hire-us-film.css";
import "../../styles/hire-edicut-story.css";

const artworkBySection = {
  "one-managed-service": "managed",
  "editorial-craft": "craft",
  "clear-pricing": "plans",
} as const;

/** Custom article body. The route owns the shared PageShell and structured data. */
export function HireEdicutStory({ post }: { post: BlogPost }) {
  return <div className="hire-story">
    <nav className="hire-story__breadcrumb" aria-label="Breadcrumb">
      <ol><li><Link to="/">Home</Link></li><li><Link to="/blog">Blog</Link></li><li aria-current="page">Why hire EdiCut</li></ol>
    </nav>
    <article aria-labelledby="hire-story-title">
      <header className="hire-story__heading">
        <h1 id="hire-story-title">{post.title}</h1>
        <div className="hire-story__byline"><Link to="/blog">By {post.author}</Link><BlogDate date={post.publishedAt} /><BlogReadTime post={post} /></div>
      </header>

      <div className="hire-story__film"><WhyHireUsFilm showPlanButton={false} /></div>

      <div className="hire-story__introduction"><p>{content.lede}</p></div>

      <div className="hire-story__reasons">
        {content.sections.map(section => <section className={`hire-story__reason hire-story__reason--${artworkBySection[section.id]}`} id={section.id} key={section.id} aria-labelledby={`${section.id}-title`}>
          <div className="hire-story__reason-copy">
            <p className="hire-story__kicker">{section.kicker}</p>
            <h2 id={`${section.id}-title`}>{section.title.replace(/^\d+\.\s*/, "")}</h2>
            <p className="hire-story__reason-intro"><BlogText>{section.intro}</BlogText></p>
            {section.paragraphs.map(paragraph => <p key={paragraph}><BlogText>{paragraph}</BlogText></p>)}
            {section.link ? <Link className="hire-story__text-link" to={section.link.to}>{section.link.label}<ArrowUpRight size={17} aria-hidden="true" /></Link> : null}
          </div>
          <div className="hire-story__illustration"><HireEdicutArtwork kind={artworkBySection[section.id]} /></div>
        </section>)}
      </div>

      <aside className="hire-story__tooling" aria-labelledby="hire-story-tooling-title">
        <span className="hire-story__tooling-icon"><Lightbulb size={23} aria-hidden="true" /></span>
        <div><h2 id="hire-story-tooling-title">{content.toolingNote.title}</h2><p>{content.toolingNote.copy}</p></div>
      </aside>

      <footer className="hire-story__closing">
        <p className="hire-story__closing-signoff">You create. We handle the edit.</p>
        <h2>{content.closing.title}</h2>
        <p>{content.closing.copy}</p>
        <div className="hire-story__closing-actions">
          <Link className="neo-button neo-button--primary" to={content.closing.primary.to}>{content.closing.primary.label}<ArrowRight size={18} aria-hidden="true" /></Link>
          <Link className="hire-story__text-link" to={content.closing.secondary.to}>{content.closing.secondary.label}<ArrowUpRight size={17} aria-hidden="true" /></Link>
        </div>
      </footer>
    </article>
    <nav className="hire-story__further-reading" aria-label="Related editing guides">
      <p>Prepare for your first edit</p>
      <Link to="/blog/youtube-video-editing-brief-checklist">Put together your editing brief<ArrowUpRight size={17} aria-hidden="true" /></Link>
      <Link to="/blog/how-to-choose-youtube-video-editing-service">Compare video editing services<ArrowUpRight size={17} aria-hidden="true" /></Link>
    </nav>
    <div className="hire-story__back"><Link to="/blog"><ArrowLeft size={17} aria-hidden="true" />All EdiCut guides</Link></div>
  </div>;
}
