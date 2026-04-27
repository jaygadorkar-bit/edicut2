export const runtime = "nodejs";

import { NextResponse } from "next/server";
import {
  createPackageMutation,
  requireAdminSession,
  type PackageInput,
} from "@edicut/platform-core/lib/admin-mutations";
import { getAdminPackagesData } from "@edicut/platform-core/lib/admin-queries";

export async function GET() {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const packages = await getAdminPackagesData();
  return NextResponse.json(packages);
}

export async function POST(request: Request) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json()) as PackageInput;
  const result = await createPackageMutation(body);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}

