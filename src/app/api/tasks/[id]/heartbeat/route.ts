import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateAgent } from "@/lib/agent-auth";
import { heartbeatTask } from "@/lib/db";

const heartbeatSchema = z.object({
  note: z.string().optional()
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateAgent(request);
  if (auth.error) {
    return auth.error;
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const payload = heartbeatSchema.safeParse(body);
  if (!payload.success) {
    return NextResponse.json({ error: payload.error.flatten() }, { status: 400 });
  }

  const lease = await heartbeatTask({ taskId: id, agentId: auth.agent.id, ...payload.data });
  return NextResponse.json({ lease });
}
