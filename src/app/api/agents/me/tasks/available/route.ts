import { NextRequest, NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { listAvailableTasks } from "@/lib/db";

export async function GET(request: NextRequest) {
  const auth = await authenticateAgent(request);
  if (auth.error) {
    return auth.error;
  }

  return NextResponse.json({ tasks: await listAvailableTasks(auth.agent.id) });
}
