import { NextResponse } from "next/server";
import { dispatchTasks } from "@/lib/db";

export async function POST() {
  const results = await dispatchTasks();
  return NextResponse.json({ dispatchedAt: new Date().toISOString(), results });
}
