export const runtime = "nodejs";

import { NextResponse } from "next/server";
import {
  deletePortfolioItemMutation,
  requireAdminSession,
  updatePortfolioItemMutation,
  type PortfolioInput,
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
  const body = (await request.json()) as PortfolioInput;
  const result = await updatePortfolioItemMutation(id, body);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await context.params;
  const result = await deletePortfolioItemMutation(id);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}

