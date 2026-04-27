export const runtime = "edge";

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    db: !!process.env.DATABASE_URL,
    urlLength: process.env.DATABASE_URL ? process.env.DATABASE_URL.length : 0,
    keys: Object.keys(process.env).join(','),
  });
}
