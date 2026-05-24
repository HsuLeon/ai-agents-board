import { NextResponse } from "next/server";
import { scanWatchdog } from "@/lib/db";

export async function POST() {
  const results = await scanWatchdog();
  return NextResponse.json({ scannedAt: new Date().toISOString(), results });
}
