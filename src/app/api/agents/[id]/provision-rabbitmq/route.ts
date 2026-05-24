import { NextResponse } from "next/server";
import { getAgent } from "@/lib/db";
import { provisionRabbitMqForAgent } from "@/lib/rabbitmq";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = await getAgent(id);
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  try {
    const rabbitmq = await provisionRabbitMqForAgent(agent);
    return NextResponse.json({ rabbitmq });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "RabbitMQ provisioning failed" },
      { status: 502 }
    );
  }
}
