import type { ProjectStatus } from "../contracts/index.js";

export const demoPricingPackages = [
  {
    id: "launch-cut",
    name: "Launch Cut",
    price: "$280",
    detail: "Fast-turnaround edit for creators, promos, and simple branded deliverables.",
    status: "published" as ProjectStatus,
  },
  {
    id: "story-package",
    name: "Story Package",
    price: "$640",
    detail: "Narrative edit with revisions, pacing design, and social cutdowns for campaigns or weddings.",
    status: "published" as ProjectStatus,
  },
  {
    id: "studio-retainer",
    name: "Studio Retainer",
    price: "Custom",
    detail: "Ongoing post-production support for agencies, production teams, and recurring content systems.",
    status: "draft" as ProjectStatus,
  },
] as const;

export const demoSecuritySettings = {
  loginAlerts: true,
  passwordRotationDays: 90,
  mfaRollout: "planned",
  sessionPolicy: "7-day signed cookie",
} as const;

export const demoDashboardMetrics = [
  { label: "Active briefs", value: "12" },
  { label: "Awaiting review", value: "4" },
  { label: "Avg. turnaround", value: "3.1 days" },
  { label: "Pending invoices", value: "2" },
] as const;

export const demoTestimonials = [
  {
    name: "Nadia Rahman",
    role: "Creative Producer",
    quote: "Edicut gave our campaign footage structure, urgency, and a finish that actually felt premium.",
  },
  {
    name: "Imran Sayeed",
    role: "Wedding Filmmaker",
    quote: "The pacing, audio shaping, and final polish made the whole delivery feel far above our usual edit pipeline.",
  },
] as const;
