import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateAgent } from "@/lib/agent-auth";
import { submitQaReport } from "@/lib/db";

const qaReportSchema = z.object({
  summary: z.string().min(1),
  checkedItems: z.array(z.string()).default([]),
  commandsRun: z.array(z.string()).default([]),
  issuesFound: z.array(z.string()).default([]),
  recommendation: z.enum(["pass", "fail", "needs_human_review"])
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateAgent(request);
  if (auth.error) {
    return auth.error;
  }

  const body = await request.json().catch(() => ({}));
  const payload = qaReportSchema.safeParse(body);
  if (!payload.success) {
    return NextResponse.json({ error: payload.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  try {
    const report = await submitQaReport({
      taskId: id,
      agentId: auth.agent.id,
      actorType: "agent",
      ...payload.data
    });
    return NextResponse.json({ report }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "QA report failed" }, { status: 400 });
  }
}
