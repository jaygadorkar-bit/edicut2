import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "./index";
import { packages } from "./schema";

const seedPackages = [
  {
    name: "Basic Edit",
    slug: "basic-edit",
    description:
      "Perfect for simple cuts, color correction, and basic transitions. Ideal for vlogs and social media content.",
    tier: "basic",
    price: "2500.00",
    features: [
      "Basic cuts & transitions",
      "Color correction",
      "Background music",
      "Text overlays",
      "Export in 1080p",
    ],
    maxRawFootageGB: 10,
    maxVideoLengthMin: 10,
    revisions: 1,
    deliveryDays: 5,
    isActive: true,
  },
  {
    name: "Medium Edit",
    slug: "medium-edit",
    description:
      "Advanced editing with motion graphics, sound design, and multi-cam support. Great for YouTube and business videos.",
    tier: "medium",
    price: "5000.00",
    features: [
      "Everything in Basic",
      "Motion graphics",
      "Sound design & mixing",
      "Multi-cam editing",
      "Thumbnail design",
      "Export in 4K",
    ],
    maxRawFootageGB: 50,
    maxVideoLengthMin: 30,
    revisions: 2,
    deliveryDays: 7,
    isActive: true,
  },
  {
    name: "Pro Edit",
    slug: "pro-edit",
    description:
      "Full cinematic treatment with VFX, advanced color grading, and priority delivery. For professional productions.",
    tier: "pro",
    price: "12000.00",
    features: [
      "Everything in Medium",
      "Cinematic color grading",
      "Visual effects (VFX)",
      "Custom animations",
      "Priority delivery",
      "Dedicated editor",
      "Unlimited revisions",
      "Export in 4K HDR",
    ],
    maxRawFootageGB: 100,
    maxVideoLengthMin: 60,
    revisions: -1, // -1 = unlimited
    deliveryDays: 5,
    isActive: true,
  },
];

async function seed() {
  console.log("🌱 Seeding packages...");

  for (const pkg of seedPackages) {
    await db.insert(packages).values(pkg).onConflictDoNothing();
  }

  console.log("✅ Seeded 3 packages (Basic, Medium, Pro)");
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
