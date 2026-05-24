import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateAgent } from "@/lib/agent-auth";
import { answerTaskQuestion, resolveTaskQuestion } from "@/lib/db";

const answerSchema = z.object({
  answer: z.string().min(1).optional(),
  resolved: z.boolean().optional(),
  createDecision: z.boolean().default(false),
  decidedBy: z.string().optional(),
  source: z.string().optional()
}).refine((value) => value.answer || typeof value.resolved === "boolean", {
  message: "Provide answer or resolved."
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; questionId: string }> }
) {
  const auth = await authenticateAgent(request);
  if (auth.error) {
    return auth.error;
  }

  const body = await request.json().catch(() => ({}));
  const payload = answerSchema.safeParse(body);
  if (!payload.success) {
    return NextResponse.json({ error: payload.error.flatten() }, { status: 400 });
  }

  const { questionId } = await params;
  if (!payload.data.answer && typeof payload.data.resolved === "boolean") {
    const question = await resolveTaskQuestion({ id: questionId, resolved: payload.data.resolved });
    return NextResponse.json({ question });
  }

  const question = await answerTaskQuestion({
    id: questionId,
    answer: payload.data.answer ?? "",
    answeredByAgentId: auth.agent.id,
    resolve: payload.data.resolved,
    createDecision: payload.data.createDecision,
    decidedBy: payload.data.decidedBy ?? auth.agent.id,
    source: payload.data.source
  });
  return NextResponse.json({ question });
}
