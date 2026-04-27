export const runtime = "edge";

import { db } from "@edicut/platform-core/db";
import { systemSettings } from "@edicut/platform-core/db/schema";
import { readEnv } from "@edicut/platform-core/lib/env";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export async function GET() {
  const sql = neon(readEnv("DATABASE_URL")!);

  try {
    console.log("Initializing advanced security tables via API...");

    await sql`
      DO $$
      BEGIN
        ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'affiliate';
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `;

    await sql`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "failed_attempts" integer DEFAULT 0 NOT NULL,
      ADD COLUMN IF NOT EXISTS "locked_until" timestamp;
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS "login_attempts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "ip" varchar(45) NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS "signup_otps" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" text NOT NULL UNIQUE,
        "name" text NOT NULL,
        "password_hash" text NOT NULL,
        "otp_hash" text NOT NULL,
        "attempts" integer DEFAULT 0 NOT NULL,
        "expires_at" timestamp NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
    `;

    const settings = [
      { key: "registration_locked", value: false },
      { key: "strict_password_policy", value: false },
      { key: "account_lockout_enabled", value: true },
      { key: "rate_limiting_enabled", value: true },
      { key: "signup_otp_enabled", value: false },
    ];

    for (const setting of settings) {
      const [existing] = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, setting.key))
        .limit(1);

      if (!existing) {
        await db.insert(systemSettings).values({
          key: setting.key,
          value: setting.value,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: "Advanced security tables and settings initialized.",
    });
  } catch (error: unknown) {
    console.error("Initialization failed:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

