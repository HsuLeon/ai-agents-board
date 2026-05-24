import { NextResponse } from "next/server";
import { z } from "zod";
import { createTask, listTasks } from "@/lib/db";

const taskSchema = z.object({
  title: z.string().min(1),
  status: z.enum(["planning", "discussion", "development", "qa", "acceptance", "done", "blocked", "stalled"]).default("planning"),
  priority: z.number().int().min(0).max(100).default(50),
  currentOwnerAgentId: z.string().optional(),
  currentOwnerRole: z.enum(["pm", "engineer", "qa", "reviewer", "observer"]).optional(),
  goal: z.string().min(1),
  background: z.string().default(""),
  requirements: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
  handoffNotes: z.array(z.string()).default([]),
  acceptanceCriteria: z.array(z.string()).default([])
});

export async function GET() {
  return NextResponse.json({ tasks: await listTasks() });
}

export async function POST(request: Request) {
  const payload = taskSchema.safeParse(await request.json());
  if (!payload.success) {
    return NextResponse.json({ error: payload.error.flatten() }, { status: 400 });
  }

  const task = await createTask(payload.data);
  return NextResponse.json({ task }, { status: 201 });
}
