import { createNodeDb, createProject, listFeaturedProjects } from "@edicut/db";
import { users } from "@edicut/db/schema";
import {
  contactIntakeSchema,
  logEvent,
  operationResultSchema,
  passwordResetConsumeSchema,
  passwordResetRequestSchema,
  securitySettingsSchema,
} from "@edicut/shared";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

export const operationalRoutes = new Hono();

operationalRoutes.post(
  "/ops/homepage-demo-seed",
  async (c) => {
    const env = c.get("env");
    const db = createNodeDb(env);
    const featuredProjects = await listFeaturedProjects(db).catch(() => []);

    if (!featuredProjects.length) {
      const [owner] = await db
        .insert(users)
        .values({
          email: "demo-homepage@edicut.com",
        })
        .returning();

      await createProject(db, {
        ownerId: owner.id,
        slug: "youtube-retention-lab",
        title: "YouTube Retention Lab",
        category: "Dummy Demo",
        summary: "Seeded homepage demo row stored in Neon for production verification.",
        status: "published",
        featured: true,
      }).catch(() => null);

      await createProject(db, {
        ownerId: owner.id,
        slug: "podcast-clips-engine",
        title: "Podcast Clips Engine",
        category: "Dummy Demo",
        summary: "Second seeded homepage demo row stored in Neon for production verification.",
        status: "published",
        featured: true,
      }).catch(() => null);
    }

    const refreshedProjects = await listFeaturedProjects(db).catch(() => []);

    logEvent("info", "homepage_demo_seeded", {
      runtime: "vercel-node",
      requestClass: "node-op-homepage-demo-seed",
      projectCount: refreshedProjects.length,
    });

    return c.json(
      operationResultSchema.parse({
        ok: true,
        message: `Homepage demo seed checked. Featured Neon rows available: ${refreshedProjects.length}.`,
        runtime: "vercel-node",
        requestClass: "node-op-homepage-demo-seed",
      })
    );
  }
);

operationalRoutes.post(
  "/ops/contact-intake",
  zValidator("json", contactIntakeSchema),
  async (c) => {
    const body = c.req.valid("json");

    logEvent("info", "contact_intake_queued", {
      runtime: "vercel-node",
      requestClass: "node-op-contact-intake",
      email: body.email,
    });

    return c.json(
      operationResultSchema.parse({
        ok: true,
        message: `Demo intake accepted for ${body.name}. In production this would dispatch email and CRM work.`,
        runtime: "vercel-node",
        requestClass: "node-op-contact-intake",
      })
    );
  }
);

operationalRoutes.post(
  "/ops/password-reset/request",
  zValidator("json", passwordResetRequestSchema),
  async (c) => {
    const body = c.req.valid("json");

    logEvent("info", "password_reset_requested", {
      runtime: "vercel-node",
      requestClass: "node-op-password-reset-request",
      email: body.email,
    });

    return c.json(
      operationResultSchema.parse({
        ok: true,
        message: `Demo password reset queued for ${body.email}. In production this would send an email.`,
        runtime: "vercel-node",
        requestClass: "node-op-password-reset-request",
      })
    );
  }
);

operationalRoutes.post(
  "/ops/password-reset/consume",
  zValidator("json", passwordResetConsumeSchema),
  async (c) => {
    c.req.valid("json");

    logEvent("info", "password_reset_consumed", {
      runtime: "vercel-node",
      requestClass: "node-op-password-reset-consume",
    });

    return c.json(
      operationResultSchema.parse({
        ok: true,
        message:
          "Demo password reset completed. In production this would update the user password and invalidate active sessions.",
        runtime: "vercel-node",
        requestClass: "node-op-password-reset-consume",
      })
    );
  }
);

operationalRoutes.post(
  "/ops/security-settings",
  zValidator("json", securitySettingsSchema),
  async (c) => {
    const body = c.req.valid("json");

    logEvent("info", "security_settings_saved", {
      runtime: "vercel-node",
      requestClass: "node-op-security-settings",
      mfaRollout: body.mfaRollout,
      passwordRotationDays: body.passwordRotationDays,
    });

    return c.json(
      operationResultSchema.parse({
        ok: true,
        message:
          "Demo security settings accepted by the bounded Node API. In production this would persist to Neon or a config store.",
        runtime: "vercel-node",
        requestClass: "node-op-security-settings",
      })
    );
  }
);
