export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { bulkDeleteUsersMutation, requireAdminSession } from "@edicut/platform-core/lib/admin-mutations";

export async function POST(request: Request) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json()) as { userIds?: string[] };
  const result = await bulkDeleteUsersMutation(body.userIds ?? [], session.user?.id);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}

