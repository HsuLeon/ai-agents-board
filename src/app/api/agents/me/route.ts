import { NextRequest, NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";

export async function GET(request: NextRequest) {
  const auth = await authenticateAgent(request);
  if (auth.error) {
    return auth.error;
  }

  return NextResponse.json({ agent: auth.agent });
}
