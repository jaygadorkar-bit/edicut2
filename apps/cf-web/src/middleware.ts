import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

const ratelimit =
  upstashUrl && upstashToken
    ? new Ratelimit({
        redis: new Redis({
          url: upstashUrl,
          token: upstashToken,
        }),
        limiter: Ratelimit.slidingWindow(10, "10 s"),
        analytics: true,
        prefix: "@upstash/ratelimit",
      })
    : null;

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rate limiting
  if (
    ratelimit &&
    (
      pathname.startsWith("/api/auth") ||
      pathname.startsWith("/login") ||
      pathname.startsWith("/signup") ||
      pathname.startsWith("/forgot-password")
    )
  ) {
    const ip = request.headers.get("cf-connecting-ip") || "127.0.0.1";
    const { success, limit, reset, remaining } = await ratelimit.limit(
      `ratelimit_${ip}_${pathname}`
    );

    if (!success) {
      return new NextResponse("Too Many Requests", {
        status: 429,
        headers: {
          "X-Ratelimit-Limit": limit.toString(),
          "X-Ratelimit-Remaining": remaining.toString(),
          "X-Ratelimit-Reset": reset.toString(),
        },
      });
    }
  }

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: request.nextUrl.protocol === "https:",
  });
  const isLoggedIn = !!token;
  const isProtectedPath = pathname.startsWith("/dashboard") || pathname.startsWith("/admin");

  if (isProtectedPath && !isLoggedIn) {
    let from = pathname;
    if (request.nextUrl.search) {
      from += request.nextUrl.search;
    }

    return NextResponse.redirect(
      new URL(`/login?from=${encodeURIComponent(from)}`, request.url)
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

