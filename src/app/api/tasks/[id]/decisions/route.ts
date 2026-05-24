import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateAgent } from "@/lib/agent-auth";
import { addTaskDecision } from "@/lib/db";

const decisionSchema = z.object({
  decision: z.string().min(1),
  decidedBy: z.string().optional(),
  source: z.string().optional()
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateAgent(request);
  if (auth.error) {
    return auth.error;
  }

  const body = await request.json().catch(() => ({}));
  const payload = decisionSchema.safeParse(body);
  if (!payload.success) {
    return NextResponse.json({ error: payload.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const decision = await addTaskDecision({
    taskId: id,
    decision: payload.data.decision,
    decidedBy: payload.data.decidedBy ?? auth.agent.id,
    source: payload.data.source
  });

  return NextResponse.json({ decision }, { status: 201 });
}
