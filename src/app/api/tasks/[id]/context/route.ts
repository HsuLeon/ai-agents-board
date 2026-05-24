import { NextResponse } from "next/server";
import { getTask } from "@/lib/db";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = await getTask(id);
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json({
    task: {
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      currentOwnerAgentId: task.currentOwnerAgentId,
      currentOwnerRole: task.currentOwnerRole,
      context: task.context,
      acceptanceCriteria: task.acceptanceCriteria,
      openQuestions: task.questions.filter((question) => question.status === "open"),
      decisions: task.decisions,
      latestLease: task.leases[0] ?? null
    }
  });
}
