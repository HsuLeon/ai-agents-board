import { NextRequest, NextResponse } from "next/server";
import { getAgent, getAgentByToken } from "./db";

export async function authenticateAgent(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const bearerPrefix = "Bearer ";

  if (authorization?.startsWith(bearerPrefix)) {
    const token = authorization.slice(bearerPrefix.length).trim();
    const agent = token ? await getAgentByToken(token) : undefined;

    if (!agent) {
      return {
        error: NextResponse.json({ error: "Invalid agent token" }, { status: 401 })
      };
    }

    if (agent.status !== "active") {
      return {
        error: NextResponse.json({ error: "Agent is not active" }, { status: 403 })
      };
    }

    return { agent };
  }

  const agentId = request.headers.get("x-agent-id");
  if (!agentId) {
    return {
      error: NextResponse.json({ error: "Missing Authorization bearer token or X-Agent-Id header" }, { status: 401 })
    };
  }

  const agent = await getAgent(agentId);
  if (!agent) {
    return {
      error: NextResponse.json({ error: "Unknown agent" }, { status: 401 })
    };
  }

  return { agent };
}
