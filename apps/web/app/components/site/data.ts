export const navLinks = [
  { label: "Home", to: "/" },
  { label: "Portfolio", to: "/portfolio" },
  { label: "Pricing", to: "/pricing" },
  { label: "About", to: "/about" },
  { label: "Contact", to: "/contact" },
];

export const legalLinks = [
  { label: "Privacy", to: "/privacy" },
  { label: "Terms", to: "/terms" },
  { label: "FAQ", to: "/faq" },
];

export const plans = [
  {
    name: "Creator",
    slug: "creator",
    price: "$80",
    description: "Core creator editing with subtitles, color, sound, stock assets, proofing, reels, and thumbnail support.",
    features: ["60 min podcast: $160", "600 min raw vlog footage: $160", "Subtitles", "Color grading"],
  },
  {
    name: "Creator Plus",
    slug: "creator-plus",
    price: "$120",
    description: "Core creator editing with stronger coverage for longer podcast or vlog inputs.",
    features: ["60 min podcast: $240", "600 min raw vlog footage: $200", "Subtitles", "Thumbnail"],
    popular: true,
  },
  {
    name: "Creator Pro",
    slug: "creator-pro",
    price: "$300",
    description: "Full-stack creator editing with project files, motion graphics, VFX, and AI voice over.",
    features: ["60 min podcast: $600", "600 min raw vlog footage: $380", "Motion graphics", "AI voice over"],
  },
];

export const workflow = [
  ["01", "Choose your plan", "Pick the editing lane that matches your upload rhythm and content scope.", "sell"],
  ["02", "Send your footage", "Upload raw files, references, notes, and brand assets through your workspace.", "cloud_upload"],
  ["03", "Review and approve", "Leave timestamped notes, request revisions, and approve the final export.", "rate_review"],
];

export const portfolio = [
  { title: "The Ridge", type: "Cinematic Narrative", tag: "+18% retention", duration: "14:20", span: "lg:col-span-7 lg:row-span-2" },
  { title: "Neon Pulse", type: "Music Video", tag: "620K views", duration: "03:44", span: "lg:col-span-5" },
  { title: "Vogue Summer", type: "Fashion Story", tag: "32 shorts", duration: "08:12", span: "lg:col-span-5" },
  { title: "Apex Drive", type: "Commercial Launch", tag: "1.2M reach", duration: "01:10", span: "lg:col-span-4" },
  { title: "Podcast Clips", type: "Podcast", tag: "12 cuts", duration: "45:00", span: "lg:col-span-4" },
  { title: "Product Review", type: "Long-form", tag: "+9% CTR", duration: "16:08", span: "lg:col-span-4" },
];

export const faqs = [
  ["How does onboarding work?", "We collect your channel style, references, brand assets, and delivery preferences before the first edit starts."],
  ["What content types do you edit?", "Talking-head videos, podcasts, gaming, education, vlogs, product reviews, Shorts, Reels, and TikToks."],
  ["What is your revision policy?", "Every package includes revision rounds, and larger packages include a tighter team review lane."],
  ["Can I upgrade anytime?", "Yes. Start small, then move to a higher-volume package as your publishing cadence grows."],
];

export const testimonials = [
  ["EdiCut helped us publish twice as often without watering down the edits.", "Sarah Jenkins", "Tech reviewer, 1.2M subscribers"],
  ["The first draft is already close, and my team can leave notes fast.", "Mike Ross", "Creator and educator"],
  ["They turned our long podcast into clips that actually hold attention.", "Elena Martinez", "Interview channel producer"],
];
