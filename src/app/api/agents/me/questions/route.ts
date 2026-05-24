import { NextRequest, NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { listQuestionsForAgent } from "@/lib/db";

export async function GET(request: NextRequest) {
  const auth = await authenticateAgent(request);
  if (auth.error) {
    return auth.error;
  }

  const questions = await listQuestionsForAgent(auth.agent.id);
  return NextResponse.json({ questions });
}
