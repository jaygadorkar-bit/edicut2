export const runtime = "nodejs";

import { NextResponse } from "next/server";
import {
  requireAdminSession,
  updateUserRoleMutation,
  type AppRole,
} from "@edicut/platform-core/lib/admin-mutations";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json()) as { role?: AppRole };
  const result = await updateUserRoleMutation(id, body.role ?? "customer");
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}

