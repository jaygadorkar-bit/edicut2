export const runtime = "nodejs";

import { NextResponse } from "next/server";
import {
  bulkUpdateUserRolesMutation,
  requireAdminSession,
  type AppRole,
} from "@edicut/platform-core/lib/admin-mutations";

export async function PATCH(request: Request) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json()) as { userIds?: string[]; role?: AppRole };
  const result = await bulkUpdateUserRolesMutation(body.userIds ?? [], body.role ?? "customer");
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}

