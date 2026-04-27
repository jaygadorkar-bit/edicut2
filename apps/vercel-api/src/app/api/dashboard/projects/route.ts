export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth } from "@edicut/platform-core/auth";
import { getDashboardProjectsData } from "@edicut/platform-core/lib/dashboard-queries";

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const projects = await getDashboardProjectsData(session.user.id);
  return NextResponse.json(projects);
}
