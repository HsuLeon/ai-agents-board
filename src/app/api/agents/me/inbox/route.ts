import { NextRequest, NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { getAgentInbox } from "@/lib/db";

export async function GET(request: NextRequest) {
  const auth = await authenticateAgent(request);
  if (auth.error) {
    return auth.error;
  }

  const inbox = await getAgentInbox(auth.agent.id);
  if (!inbox) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  return NextResponse.json({ inbox });
}
