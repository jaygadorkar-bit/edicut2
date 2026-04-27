export const runtime = "nodejs";

import { NextResponse } from "next/server";
import {
  createUserMutation,
  requireAdminSession,
  type AppRole,
} from "@edicut/platform-core/lib/admin-mutations";
import { getAdminUsersPageData } from "@edicut/platform-core/lib/admin-queries";

export async function GET(request: Request) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const data = await getAdminUsersPageData({
    page: Number(searchParams.get("page") || "1") || 1,
    q: searchParams.get("q") || "",
    sort: searchParams.get("sort") === "role" ? "role" : "createdAt",
    direction: searchParams.get("direction") === "asc" ? "asc" : "desc",
  });

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json()) as { name?: string; email?: string; role?: AppRole };
  const result = await createUserMutation({
    name: body.name ?? "",
    email: body.email ?? "",
    role: body.role ?? "customer",
  });

  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}

