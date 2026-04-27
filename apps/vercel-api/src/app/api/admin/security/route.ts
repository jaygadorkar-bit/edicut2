export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAdminSession, updateSecuritySettingMutation } from "@edicut/platform-core/lib/admin-mutations";

export async function PATCH(request: Request) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json()) as { key?: string; value?: unknown };
  const result = await updateSecuritySettingMutation(body.key ?? "", body.value);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}

