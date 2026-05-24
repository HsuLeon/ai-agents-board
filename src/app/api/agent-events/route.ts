import { NextResponse } from "next/server";
import { listAgentEvents } from "@/lib/db";

export async function GET() {
  return NextResponse.json({ events: await listAgentEvents({ limit: 100 }) });
}
