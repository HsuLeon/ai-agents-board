import { NextRequest, NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { listEventsForAgent } from "@/lib/db";

export async function GET(request: NextRequest) {
  const auth = await authenticateAgent(request);
  if (auth.error) {
    return auth.error;
  }

  const events = await listEventsForAgent(auth.agent.id, 100);
  return NextResponse.json({ events });
}
