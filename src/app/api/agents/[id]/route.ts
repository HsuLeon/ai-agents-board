import { NextResponse } from "next/server";
import { deleteAgent, getAgent, getAgentDeletionBlockers } from "@/lib/db";
import { deprovisionRabbitMqForAgent } from "@/lib/rabbitmq";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = await getAgent(id);
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const deletionBlockers = await getAgentDeletionBlockers(id);
  return NextResponse.json({ agent, deletionBlockers });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = await getAgent(id);
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const deletionBlockers = await getAgentDeletionBlockers(id);
  if (deletionBlockers.length > 0) {
    return NextResponse.json(
      {
        error: "Agent has active task leases. Release or reassign work before deleting.",
        deletionBlockers
      },
      { status: 409 }
    );
  }

  try {
    const rabbitmq = await deprovisionRabbitMqForAgent(agent);
    await deleteAgent(id);
    return NextResponse.json({ deleted: true, rabbitmq });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Delete agent failed" }, { status: 400 });
  }
}
