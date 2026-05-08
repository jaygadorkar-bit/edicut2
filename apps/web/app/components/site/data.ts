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
    name: "Basic",
    slug: "basic",
    price: "$499",
    description: "For new creators who need clean, consistent edits.",
    features: ["4 videos monthly", "48h turnaround", "Color and audio cleanup", "2 revision rounds"],
  },
  {
    name: "Medium",
    slug: "medium",
    price: "$999",
    description: "For weekly channels that need retention polish and repurposing.",
    features: ["8 videos monthly", "24-36h turnaround", "Motion graphics", "Shorts repurposing", "Thumbnail support"],
    popular: true,
  },
  {
    name: "Pro",
    slug: "pro",
    price: "$1,899",
    description: "For teams that need a full editing pipeline.",
    features: ["12+ videos monthly", "Priority queue", "Premium thumbnails", "Dedicated project manager"],
  },
];

export const workflow = [
  ["01", "Choose package", "Pick the lane that matches your upload cadence and scope."],
  ["02", "Upload footage", "Send files, references, notes, and brand assets through the portal."],
  ["03", "Review and approve", "Leave timestamped notes, request revisions, and approve final exports."],
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
