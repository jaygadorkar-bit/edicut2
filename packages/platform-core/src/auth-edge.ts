import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";

const edgeAuthConfig = {
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string; role?: string }).id = token.id as string | undefined;
        (session.user as { id?: string; role?: string }).role = token.role as
          | string
          | undefined;
      }

      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;

export const { auth } = NextAuth(edgeAuthConfig);
