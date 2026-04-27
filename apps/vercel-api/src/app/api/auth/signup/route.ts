export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getClientIp, signUpWithCredentialsAction } from "@edicut/platform-core/lib/auth-flows";

export async function POST(request: Request) {
  const body = (await request.json()) as { name?: string; email?: string; password?: string };
  const ip = getClientIp(request.headers.get("x-forwarded-for"));
  const result = await signUpWithCredentialsAction(
    {
      name: body.name ?? "",
      email: body.email ?? "",
      password: body.password ?? "",
    },
    ip
  );

  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}

