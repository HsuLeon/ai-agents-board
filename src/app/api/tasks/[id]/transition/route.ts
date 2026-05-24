import { NextResponse } from "next/server";
import { z } from "zod";
import { transitionTask } from "@/lib/db";

const transitionSchema = z.object({
  toStatus: z.enum(["planning", "discussion", "development", "qa", "acceptance", "done", "blocked", "stalled"]),
  reason: z.string().optional(),
  requestedChanges: z.array(z.string()).optional(),
  actorType: z.enum(["human", "agent", "system"]).optional(),
  actorAgentId: z.string().optional()
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = transitionSchema.safeParse(await request.json());
  if (!payload.success) {
    return NextResponse.json({ error: payload.error.flatten() }, { status: 400 });
  }

  try {
    const task = await transitionTask({
      taskId: id,
      ...payload.data
    });

    return NextResponse.json({ task });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Transition failed" }, { status: 400 });
  }
}
