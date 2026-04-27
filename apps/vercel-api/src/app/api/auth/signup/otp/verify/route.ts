export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getClientIp, verifySignupOtpAction } from "@edicut/platform-core/lib/auth-flows";

export async function POST(request: Request) {
  const body = (await request.json()) as { email?: string; password?: string; otp?: string };
  const ip = getClientIp(request.headers.get("x-forwarded-for"));
  const result = await verifySignupOtpAction(
    {
      email: body.email ?? "",
      password: body.password ?? "",
      otp: body.otp ?? "",
    },
    ip
  );

  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}

