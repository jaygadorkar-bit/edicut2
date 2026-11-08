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

export const faqs = [
  ["How does onboarding work?", "We collect your channel style, references, brand assets, and delivery preferences before the first edit starts."],
  ["What content types do you edit?", "Talking-head videos, podcasts, gaming, education, vlogs, product reviews, Shorts, Reels, and TikToks."],
  ["What is your revision policy?", "Single-video packages include the listed revision rounds. Monthly editing and revisions use your reserved editing hours. We agree the scope before production starts."],
  ["Can I change my editing package?", "Contact us to discuss a different package for your next project or billing period. We confirm any changes to scope, price, and timing before you pay."],
  ["Which payment methods can I use?", "Checkout uses Cryptomus for cryptocurrency payments. Choose a supported coin and network on its hosted payment page. Credit cards, debit cards, Apple Pay, and Google Pay are not currently offered at EdiCut checkout."],
];
