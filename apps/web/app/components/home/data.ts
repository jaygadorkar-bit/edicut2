import type { NavItem, WorkflowStep, Differentiator, PortfolioItem, Testimonial, PricingPlan, FAQItem } from "./types";

export const navItems: NavItem[] = [
  { label: "Portfolio", href: "#portfolio" },
  { label: "Pricing", href: "#pricing" },
];

export const trustLogos = ["TECHRIVA", "VOGUE", "APEX", "LUXE", "NEON"];

export const workflowSteps: WorkflowStep[] = [
  {
    step: "01",
    title: "Choose",
    description:
      "Pick the package that matches your publishing rhythm, video length, and edit style.",
    icon: "sell",
  },
  {
    step: "02",
    title: "Upload",
    description:
      "Send raw footage, references, notes, and brand assets through a simple project portal.",
    icon: "cloud_upload",
  },
  {
    step: "03",
    title: "Review",
    description:
      "Comment on the cut, request revisions, and approve files ready for YouTube upload.",
    icon: "rate_review",
  },
];

export const differentiators: Differentiator[] = [
  {
    title: "Creator-aware team",
    description:
      "Editors who understand hooks, pacing, chapters, intros, and retention curves.",
    icon: "groups",
  },
  {
    title: "Reliable turnaround",
    description:
      "A predictable 24-48 hour editing lane keeps your upload calendar moving.",
    icon: "timer",
  },
  {
    title: "Retention polish",
    description:
      "Pattern interrupts, captions, audio cleanup, and motion accents where they matter.",
    icon: "monitoring",
  },
  {
    title: "Repurposing ready",
    description:
      "Turn long-form episodes into Shorts, TikToks, and Reels without starting over.",
    icon: "auto_awesome_mosaic",
  },
];

export const portfolioItems: PortfolioItem[] = [
  {
    title: "The Ridge",
    type: "Cinematic narrative",
    image: "/images/the-ridge.png",
    className: "md:col-span-8 md:row-span-2",
  },
  {
    title: "Neon Pulse",
    type: "Music video",
    image: "/images/neon-pulse.png",
    className: "md:col-span-4",
  },
  {
    title: "Vogue Summer",
    type: "Fashion story",
    image: "/images/vogue.png",
    className: "md:col-span-4",
  },
  {
    title: "Apex Drive",
    type: "Commercial launch",
    image: "/images/apex-drive.png",
    className: "md:col-span-12",
  },
];

export const testimonials: Testimonial[] = [
  {
    quote:
      "EdiCut helped us publish twice as often without watering down the edits. The pacing finally feels built for YouTube.",
    name: "Sarah Jenkins",
    role: "Tech reviewer, 1.2M subscribers",
  },
  {
    quote:
      "The first draft is already close. My team can leave notes, approve changes, and move straight into thumbnail work.",
    name: "Mike Ross",
    role: "Creator and educator",
  },
  {
    quote:
      "They turned our long podcast into clips that actually hold attention. It feels like having a post-production partner.",
    name: "Elena Martinez",
    role: "Interview channel producer",
  },
];

export const pricingPlans: PricingPlan[] = [
  {
    name: "Basic",
    price: "$499",
    description: "For new creators who need clean, consistent edits.",
    features: ["4 videos monthly", "48h turnaround", "Color and audio cleanup", "2 revision rounds"],
  },
  {
    name: "Medium",
    price: "$999",
    description: "For channels publishing every week with stronger retention needs.",
    features: ["8 videos monthly", "36h turnaround", "Motion graphics", "Shorts repurposing"],
    popular: true,
  },
  {
    name: "Pro",
    price: "$1,899",
    description: "For teams that need a full editing pipeline.",
    features: ["12+ videos monthly", "Priority queue", "Thumbnail support", "Dedicated project manager"],
  },
];

export const faqs: FAQItem[] = [
  {
    question: "How does onboarding work?",
    answer:
      "We collect your channel style, references, brand assets, and delivery preferences before the first edit starts.",
  },
  {
    question: "What content types can you edit?",
    answer:
      "YouTube talking-head videos, podcasts, gaming, education, vlogs, product videos, Shorts, Reels, and TikToks.",
  },
  {
    question: "Are revisions included?",
    answer:
      "Yes. Every package includes revision rounds, and larger packages include a tighter review workflow for teams.",
  },
  {
    question: "Can I start with one package and upgrade?",
    answer:
      "Yes. Start small, then move into a higher-volume package as your publishing cadence grows.",
  },
];
