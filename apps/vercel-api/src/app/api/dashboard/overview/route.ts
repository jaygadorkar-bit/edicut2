export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth } from "@edicut/platform-core/auth";
import { getDashboardOverviewData } from "@edicut/platform-core/lib/dashboard-queries";

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const data = await getDashboardOverviewData(session.user.id);
  return NextResponse.json(data);
}
