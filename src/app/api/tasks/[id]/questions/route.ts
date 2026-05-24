import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateAgent } from "@/lib/agent-auth";
import { addTaskQuestion } from "@/lib/db";

const questionSchema = z.object({
  question: z.string().min(1),
  askedByAgentId: z.string().optional(),
  targetRole: z.enum(["pm", "engineer", "qa", "reviewer", "observer"]).optional(),
  targetAgentId: z.string().optional()
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateAgent(request);
  if (auth.error) {
    return auth.error;
  }

  const body = await request.json().catch(() => ({}));
  const payload = questionSchema.safeParse(body);
  if (!payload.success) {
    return NextResponse.json({ error: payload.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const question = await addTaskQuestion({
    taskId: id,
    question: payload.data.question,
    askedByAgentId: payload.data.askedByAgentId ?? auth.agent.id,
    targetRole: payload.data.targetRole,
    targetAgentId: payload.data.targetAgentId
  });

  return NextResponse.json({ question }, { status: 201 });
}
