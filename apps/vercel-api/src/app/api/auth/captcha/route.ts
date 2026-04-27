export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { verifyCaptchaToken } from "@edicut/platform-core/lib/auth-flows";

export async function POST(request: Request) {
  const body = (await request.json()) as { token?: string | null };
  const result = await verifyCaptchaToken(body.token ?? null);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}

