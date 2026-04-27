export const runtime = "nodejs";

import { NextResponse } from "next/server";
import {
  createPortfolioItemMutation,
  requireAdminSession,
  type PortfolioInput,
} from "@edicut/platform-core/lib/admin-mutations";
import { getAdminPortfolioData } from "@edicut/platform-core/lib/admin-queries";

export async function GET() {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const items = await getAdminPortfolioData();
  return NextResponse.json(items);
}

export async function POST(request: Request) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json()) as PortfolioInput;
  const result = await createPortfolioItemMutation(body);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}

