import { useId, useState, type ReactNode } from "react";
import { ChevronDown, CircleHelp } from "lucide-react";

export type FaqEntry = { question: string; answer: string };

function FaqItem({ item, expanded, onToggle, headingLevel: Heading }: { item: FaqEntry; expanded: boolean; onToggle: () => void; headingLevel: "h2" | "h3" }) {
  const id = useId();
  return (
    <article className="site-faq__item neo-card" data-open={expanded}>
      <Heading><button type="button" id={`${id}-question`} className="site-faq__question" aria-expanded={expanded} aria-controls={`${id}-answer`} onClick={onToggle}>
        <span>{item.question}</span><span className="site-faq__arrow" aria-hidden="true"><ChevronDown size={20} /></span>
      </button></Heading>
      <div id={`${id}-answer`} className="site-faq__answer" role="region" aria-labelledby={`${id}-question`} aria-hidden={!expanded} inert={!expanded}>
        <div className="site-faq__answer-inner"><p>{item.answer}</p></div>
      </div>
    </article>
  );
}

export function FaqSection({ items, title = <>Good questions.<br />Straight answers.</>, description = "Get to know your team, your edits, and how it all works.", id, headingLevel: Heading = "h2", introContent, emptyContent, className = "" }: {
  items: readonly FaqEntry[];
  title?: ReactNode;
  description?: string;
  id?: string;
  headingLevel?: "h1" | "h2";
  introContent?: ReactNode;
  emptyContent?: ReactNode;
  className?: string;
}) {
  const headingId = useId();
  const [openQuestion, setOpenQuestion] = useState<string | null>(null);
  // Filtering must not restore an answer that was removed from the visible list.
  const visibleOpenQuestion = items.some((item) => item.question === openQuestion) ? openQuestion : null;
  if (openQuestion !== visibleOpenQuestion) setOpenQuestion(null);
  return (
    <section id={id} className={`site-faq ${className}`} aria-labelledby={headingId}>
      <div className="site-faq__intro">
        <p className="site-faq__kicker neo-section-label"><CircleHelp size={15} aria-hidden="true" />FAQ</p>
        <Heading className="site-faq__title" id={headingId}>{title}</Heading>
        <p className="site-faq__description">{description}</p>
        {introContent}
      </div>
      <div className="site-faq__list">
        {items.map((item) => <FaqItem key={item.question} item={item} headingLevel={Heading === "h1" ? "h2" : "h3"} expanded={visibleOpenQuestion === item.question} onToggle={() => setOpenQuestion((current) => current === item.question ? null : item.question)} />)}
        {!items.length && emptyContent}
      </div>
    </section>
  );
}
