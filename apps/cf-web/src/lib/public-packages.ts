export type PublicPackage = {
  slug: "basic" | "medium" | "pro";
  name: string;
  badge: string;
  price: string;
  shortDescription: string;
  heroDescription: string;
  delivery: string;
  revisions: string;
  footage: string;
  idealFor: string[];
  features: string[];
  includes: string[];
  gallery: {
    title: string;
    caption: string;
    image: string;
  }[];
  highlights: {
    label: string;
    value: string;
  }[];
  faqs: {
    q: string;
    a: string;
  }[];
  popular?: boolean;
};

export const publicPackages: PublicPackage[] = [
  {
    slug: "basic",
    name: "Basic",
    badge: "Starter Cut",
    price: "$49",
    shortDescription:
      "Clean edits for straightforward YouTube videos that need to go live fast.",
    heroDescription:
      "Dummy content: a lean package for creators who want reliable cleanup, tighter pacing, and a presentable final export without a heavyweight post-production process.",
    delivery: "72 Hours",
    revisions: "1 Revision Round",
    footage: "Up to 10GB",
    idealFor: [
      "Solo creators publishing commentary or tutorials",
      "Talking-head videos that need trimming and polish",
      "Weekly uploads with a predictable editing scope",
    ],
    features: [
      "Jump-cut cleanup and dead-space removal",
      "Basic color correction and audio balancing",
      "Intro/outro placement and music bed integration",
      "Simple captions, callouts, and branded lower thirds",
      "One structured revision pass with timestamped feedback",
    ],
    includes: [
      "16:9 YouTube export",
      "Upload-ready MP4 delivery",
      "Thumbnail direction placeholder notes",
      "Project handoff summary",
    ],
    gallery: [
      {
        title: "Talking-Head Cleanup",
        caption:
          "Dummy sample: a clean single-camera edit with tighter pacing and simple emphasis graphics.",
        image:
          "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&q=80&w=1600",
      },
      {
        title: "Tutorial Polish",
        caption:
          "Dummy sample: software walkthrough pacing with chapter cards and screen recording rhythm fixes.",
        image:
          "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&q=80&w=1600",
      },
      {
        title: "Creator Commentary",
        caption:
          "Dummy sample: simple editorial treatment designed for frequent publishing.",
        image:
          "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&q=80&w=1600",
      },
    ],
    highlights: [
      { label: "Turnaround", value: "72h" },
      { label: "Best For", value: "Weekly Basics" },
      { label: "Output", value: "1 Final Video" },
    ],
    faqs: [
      {
        q: "Is this enough for a standard talking-head video?",
        a: "Dummy answer: yes. The Basic package is positioned for edits that need clarity and pacing more than heavy graphics or complex story restructuring.",
      },
      {
        q: "Can I request captions and callouts?",
        a: "Dummy answer: simple captions and lightweight motion callouts fit within this package if the scope stays modest.",
      },
    ],
  },
  {
    slug: "medium",
    name: "Medium",
    badge: "Growth Package",
    price: "$149",
    shortDescription:
      "The best fit for active YouTubers who want stronger pacing, graphics, and watch-time polish.",
    heroDescription:
      "Dummy content: this is the flagship product page package, aimed at creators who need edits to feel intentionally produced instead of simply cleaned up.",
    delivery: "48 Hours",
    revisions: "3 Revision Rounds",
    footage: "Up to 50GB",
    idealFor: [
      "Active YouTube channels posting weekly or twice weekly",
      "Podcast, tech, and educational formats needing stronger retention",
      "Creators who want graphics, captions, and story shaping in one service",
    ],
    features: [
      "Advanced pacing, scene restructuring, and hook tightening",
      "Graphics, captions, motion callouts, and branded transitions",
      "Color balancing plus selective sound design polish",
      "B-roll integration, punch-ins, and emphasis moments",
      "Three revision rounds with timestamped feedback support",
    ],
    includes: [
      "16:9 long-form master export",
      "One vertical teaser or short-form cutdown",
      "Delivery notes and publishing checklist",
      "Repeatable style-profile placeholder",
    ],
    gallery: [
      {
        title: "Retention-Driven Edit",
        caption:
          "Dummy sample: stronger hook packaging, pattern interrupts, and graphic reinforcement throughout the timeline.",
        image:
          "https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&q=80&w=1600",
      },
      {
        title: "Podcast To Platform",
        caption:
          "Dummy sample: one source recording transformed into a polished episode and companion vertical cutdown.",
        image:
          "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&q=80&w=1600",
      },
      {
        title: "Tech Breakdown Flow",
        caption:
          "Dummy sample: screen graphics, pace resets, and structured information delivery.",
        image:
          "https://images.unsplash.com/photo-1516321165247-4aa89a48be28?auto=format&fit=crop&q=80&w=1600",
      },
    ],
    highlights: [
      { label: "Turnaround", value: "48h" },
      { label: "Best For", value: "Growth Channels" },
      { label: "Bonus", value: "1 Short Cutdown" },
    ],
    faqs: [
      {
        q: "Why is this the recommended package?",
        a: "Dummy answer: it covers the point where YouTube editing usually becomes strategic, with stronger pacing, graphics, and more revision flexibility.",
      },
      {
        q: "Can this package support repeat clients and channel consistency?",
        a: "Dummy answer: yes. It is structured for channels that need an editorial rhythm and a more defined recurring style.",
      },
    ],
    popular: true,
  },
  {
    slug: "pro",
    name: "Pro",
    badge: "Flagship Edit",
    price: "$499",
    shortDescription:
      "High-touch editing for established channels, launch videos, and flagship long-form releases.",
    heroDescription:
      "Dummy content: a premium package for launches, hero episodes, and channels that need a more cinematic layer of structure, sound, and visual finish.",
    delivery: "24 Hours",
    revisions: "Unlimited Revisions",
    footage: "Up to 100GB",
    idealFor: [
      "Established creators shipping hero episodes or launches",
      "Brand channels with heavier review expectations",
      "Projects needing more aggressive motion, sound, and packaging",
    ],
    features: [
      "Full YouTube packaging with deeper narrative restructuring",
      "Sound design, motion polish, and cinematic transitions",
      "Enhanced color treatment and layered visual cleanup",
      "Unlimited revision handling during the active edit cycle",
      "Priority queue placement and premium review support",
    ],
    includes: [
      "Long-form hero export",
      "Two vertical cutdowns",
      "Thumbnail concept placeholder notes",
      "Priority communication lane",
    ],
    gallery: [
      {
        title: "Launch Episode",
        caption:
          "Dummy sample: premium treatment for a flagship release with layered pacing and richer editorial dynamics.",
        image:
          "https://images.unsplash.com/photo-1601506521937-0121a7fc2a6b?auto=format&fit=crop&q=80&w=1600",
      },
      {
        title: "Brand Story Feature",
        caption:
          "Dummy sample: high-touch polish for a campaign or documentary-style piece.",
        image:
          "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&q=80&w=1600",
      },
      {
        title: "Channel Hero Video",
        caption:
          "Dummy sample: the product page treatment for creators who need their biggest videos to feel premium.",
        image:
          "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=1600",
      },
    ],
    highlights: [
      { label: "Turnaround", value: "24h" },
      { label: "Best For", value: "Flagship Releases" },
      { label: "Support", value: "Priority" },
    ],
    faqs: [
      {
        q: "When should a buyer choose Pro?",
        a: "Dummy answer: Pro fits launches, revenue-driving videos, and channels where the edit itself carries more strategic weight.",
      },
      {
        q: "Does unlimited revisions mean no boundaries?",
        a: "Dummy answer: unlimited revisions applies within the same approved project scope while the edit remains active in production.",
      },
    ],
  },
];

export function getPublicPackage(slug: string) {
  return publicPackages.find((item) => item.slug === slug);
}
