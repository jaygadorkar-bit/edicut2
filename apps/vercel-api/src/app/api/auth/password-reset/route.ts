export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { resetPasswordAction } from "@edicut/platform-core/lib/auth-flows";

export async function POST(request: Request) {
  const body = (await request.json()) as { token?: string; password?: string };
  const result = await resetPasswordAction({
    token: body.token ?? "",
    password: body.password ?? "",
  });

  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}

