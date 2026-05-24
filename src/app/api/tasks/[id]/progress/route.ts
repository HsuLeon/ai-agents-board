import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateAgent } from "@/lib/agent-auth";
import { reportProgress } from "@/lib/db";

const progressSchema = z.object({
  workerStatus: z.enum([
    "in_progress",
    "progress_reported",
    "waiting_for_pm",
    "waiting_for_engineer",
    "waiting_for_human",
    "waiting_for_qa",
    "blocked",
    "completed",
    "failed"
  ]),
  summary: z.string().min(1),
  nextAction: z.string().optional(),
  needsResponse: z.boolean().default(false),
  expectedResponderRole: z.enum(["pm", "engineer", "qa", "reviewer", "observer"]).optional(),
  handoffReady: z.boolean().default(false),
  continuationPrompt: z.string().optional()
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateAgent(request);
  if (auth.error) {
    return auth.error;
  }

  const body = await request.json().catch(() => ({}));
  const payload = progressSchema.safeParse(body);
  if (!payload.success) {
    return NextResponse.json({ error: payload.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const report = await reportProgress({ taskId: id, agentId: auth.agent.id, ...payload.data });
  return NextResponse.json({ report }, { status: 201 });
}
