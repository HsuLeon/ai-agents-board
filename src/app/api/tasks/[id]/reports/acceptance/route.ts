import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateAgent } from "@/lib/agent-auth";
import { submitAcceptanceReport } from "@/lib/db";

const acceptanceReportSchema = z.object({
  summary: z.string().min(1),
  decision: z.enum(["accepted", "rejected", "needs_more_qa"]),
  reason: z.string().optional()
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateAgent(request);
  if (auth.error) {
    return auth.error;
  }

  const body = await request.json().catch(() => ({}));
  const payload = acceptanceReportSchema.safeParse(body);
  if (!payload.success) {
    return NextResponse.json({ error: payload.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  try {
    const report = await submitAcceptanceReport({
      taskId: id,
      agentId: auth.agent.id,
      actorType: "agent",
      ...payload.data
    });
    return NextResponse.json({ report }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Acceptance report failed" },
      { status: 400 }
    );
  }
}
