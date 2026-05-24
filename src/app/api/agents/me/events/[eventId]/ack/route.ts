import { NextRequest, NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { acknowledgeAgentEvent, listEventsForAgent } from "@/lib/db";

export async function POST(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await authenticateAgent(request);
  if (auth.error) {
    return auth.error;
  }

  const { eventId } = await params;
  const visibleEvents = await listEventsForAgent(auth.agent.id, 1000);
  if (!visibleEvents.some((event) => event.id === eventId)) {
    return NextResponse.json({ error: "Event not found for this agent" }, { status: 404 });
  }

  const event = await acknowledgeAgentEvent(eventId);
  return NextResponse.json({ event });
}
