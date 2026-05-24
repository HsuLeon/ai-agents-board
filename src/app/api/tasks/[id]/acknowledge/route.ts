import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateAgent } from "@/lib/agent-auth";
import { acknowledgeTask } from "@/lib/db";

const acknowledgeSchema = z.object({
  understanding: z.string().optional(),
  plan: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1).optional(),
  blockers: z.array(z.string()).optional()
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateAgent(request);
  if (auth.error) {
    return auth.error;
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const payload = acknowledgeSchema.safeParse(body);
  if (!payload.success) {
    return NextResponse.json({ error: payload.error.flatten() }, { status: 400 });
  }

  const lease = await acknowledgeTask({ taskId: id, agentId: auth.agent.id, ...payload.data });
  return NextResponse.json({ lease });
}
