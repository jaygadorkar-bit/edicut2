import { formatPackagePrice, SUBSCRIPTION_PACKAGES } from "../../lib/subscriptions";

export const navLinks = [
  { label: "Home", to: "/" },
  { label: "Pricing", to: "/pricing" },
  { label: "Portfolio", to: "/portfolio" },
  { label: "Contact", to: "/contact" },
];

export const legalLinks = [
  { label: "Privacy", to: "/privacy" },
  { label: "Terms", to: "/terms" },
  { label: "FAQ", to: "/faq" },
];

export const plans = SUBSCRIPTION_PACKAGES.map((plan) => ({
  name: plan.name,
  slug: plan.slug,
  price: formatPackagePrice(plan.basePrice),
  description: plan.description,
  features: plan.features,
  popular: plan.slug === "creator-plus",
}));

export const workflow = [
  ["01", "Choose your plan", "Pick the editing lane that matches your upload rhythm and content scope.", "sell"],
  ["02", "Share your footage", "Keep large files in your own storage and add private sharing links, references, and notes to the project.", "cloud_upload"],
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
  ["Our weekly uploads finally feel consistent, polished, and easy to review.", "Aisha Rahman", "Lifestyle creator, 780K subscribers"],
  ["The short-form cutdowns gave our best moments a second life across every platform.", "Jordan Lee", "Podcast host and producer"],
  ["EdiCut understood the tone immediately and made every revision round feel simple.", "Nina Patel", "Wellness channel founder"],
];
