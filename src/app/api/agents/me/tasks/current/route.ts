import { NextRequest, NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { listCurrentTasksForAgent } from "@/lib/db";

export async function GET(request: NextRequest) {
  const auth = await authenticateAgent(request);
  if (auth.error) {
    return auth.error;
  }

  const tasks = await listCurrentTasksForAgent(auth.agent.id);
  return NextResponse.json({ tasks });
}
