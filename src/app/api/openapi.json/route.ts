import { NextResponse } from "next/server";
import { openApiSpec } from "@/lib/openapi";

export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json(openApiSpec);
}
