import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "./db";
import { users, accounts, sessions, verificationTokens, loginAttempts } from "./db/schema";
import { authConfig } from "./auth.config";
import { eq, and, sql, gt } from "drizzle-orm";
import { verifyPassword } from "./lib/crypto";
import { headers } from "next/headers";
import { getSecuritySettings } from "./lib/security-settings";

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MINS = 15;
const RATE_LIMIT_THRESHOLD = 5;
const RATE_LIMIT_WINDOW_MINS = 1;

export const { 
  handlers, 
  auth, 
  signIn, 
  signOut 
} = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "jwt" },
  providers: [
    ...authConfig.providers,
    CredentialsProvider({
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const settings = await getSecuritySettings();
        
        // Rate limiting check
        if (settings.rate_limiting_enabled) {
          const headerList = await headers();
          const ip = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
          const oneMinuteAgo = new Date(Date.now() - RATE_LIMIT_WINDOW_MINS * 60 * 1000);
          
          const [attempts] = await db
            .select({ count: sql<number>`count(*)` })
            .from(loginAttempts)
            .where(and(eq(loginAttempts.ip, ip), gt(loginAttempts.createdAt, oneMinuteAgo)));

          if (attempts.count >= RATE_LIMIT_THRESHOLD) {
            throw new Error("Too many attempts. Please wait a minute.");
          }
          await db.insert(loginAttempts).values({ ip });
        }

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, credentials.email as string))
          .limit(1);

        if (!user || !user.password) {
          return null;
        }

        // Account lockout check
        if (settings.account_lockout_enabled && user.lockedUntil && user.lockedUntil > new Date()) {
          const waitMins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
          throw new Error(`Account locked. Try again in ${waitMins} minutes.`);
        }

        const isPasswordValid = await verifyPassword(
          credentials.password as string,
          user.password
        );

        if (!isPasswordValid) {
          if (settings.account_lockout_enabled) {
            const newAttempts = user.failedAttempts + 1;
            if (newAttempts >= LOCKOUT_THRESHOLD) {
              const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MINS * 60 * 1000);
              await db
                .update(users)
                .set({ failedAttempts: newAttempts, lockedUntil })
                .where(eq(users.id, user.id));
              throw new Error(`Too many attempts. Account locked for ${LOCKOUT_DURATION_MINS} minutes.`);
            } else {
              await db
                .update(users)
                .set({ failedAttempts: newAttempts })
                .where(eq(users.id, user.id));
              throw new Error(`Invalid password. ${LOCKOUT_THRESHOLD - newAttempts} attempts remaining.`);
            }
          }
          return null;
        }

        // Success - reset attempts
        await db
          .update(users)
          .set({ failedAttempts: 0, lockedUntil: null })
          .where(eq(users.id, user.id));

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
});
