export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requestPasswordResetAction } from "@edicut/platform-core/lib/auth-flows";

export async function POST(request: Request) {
  const body = (await request.json()) as { email?: string };
  const result = await requestPasswordResetAction({ email: body.email ?? "" });
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}

