export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { deleteUserMutation, requireAdminSession } from "@edicut/platform-core/lib/admin-mutations";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await context.params;
  const result = await deleteUserMutation(id, session.user?.id);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}

