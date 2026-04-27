export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAdminSession } from "@edicut/platform-core/lib/admin-mutations";
import { getAdminOverviewData } from "@edicut/platform-core/lib/admin-queries";

export async function GET() {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const data = await getAdminOverviewData();
  return NextResponse.json(data);
}
