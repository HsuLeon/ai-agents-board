import { NextResponse } from "next/server";
import { z } from "zod";
import { createAgent, listAgents } from "@/lib/db";
import { provisionRabbitMqForAgent } from "@/lib/rabbitmq";

const agentSchema = z.object({
  name: z.string().min(1),
  provider: z.enum(["codex", "claude", "openclaw", "manual", "other"]),
  status: z.enum(["active", "paused", "disabled"]).default("active"),
  roles: z.array(z.enum(["pm", "engineer", "qa", "reviewer", "observer"])).min(1),
  capabilities: z.array(z.string()).default([]),
  maxConcurrentTasks: z.number().int().min(1).default(1),
  notes: z.string().optional()
});

export async function GET() {
  return NextResponse.json({ agents: await listAgents() });
}

export async function POST(request: Request) {
  const payload = agentSchema.safeParse(await request.json());
  if (!payload.success) {
    return NextResponse.json({ error: payload.error.flatten() }, { status: 400 });
  }

  const agent = await createAgent(payload.data);
  try {
    const rabbitmq = await provisionRabbitMqForAgent(agent);
    return NextResponse.json({ agent, rabbitmq }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        agent,
        rabbitmq: {
          status: "error",
          message: error instanceof Error ? error.message : "RabbitMQ provisioning failed"
        }
      },
      { status: 201 }
    );
  }
}
