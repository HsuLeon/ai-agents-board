import Link from "next/link";
import { BellRing } from "lucide-react";
import { listAgentEvents } from "@/lib/db";
import { formatDateTime } from "@/lib/activity";

export const dynamic = "force-dynamic";

export default async function AgentEventsPage() {
  const events = await listAgentEvents({ limit: 100 });

  return (
    <>
      <section className="page-heading">
        <div>
          <h1>Agent Events</h1>
          <p>RabbitMQ wake events are recorded here before or after publish, so adapters and PM can inspect delivery.</p>
        </div>
        <Link className="button" href="/api-docs">
          API Docs
        </Link>
      </section>

      <section className="panel">
        <h2>
          <BellRing size={16} /> Event Outbox
        </h2>
        <div className="stack">
          {events.length === 0 ? <p className="muted">No agent events yet.</p> : null}
          {events.map((event) => (
            <article className="report-card" key={event.id}>
              <div className="inline-list">
                <span className="pill">{event.type}</span>
                <span className={event.publishStatus === "failed" ? "pill status-blocked" : "pill"}>
                  {event.publishStatus}
                </span>
                {event.targetAgentId ? <span className="pill">agent {event.targetAgentId}</span> : null}
                {event.targetRole ? <span className="pill">role {event.targetRole}</span> : null}
                {event.taskId ? <span className="pill">task {event.taskId}</span> : null}
                {event.questionId ? <span className="pill">question {event.questionId}</span> : null}
              </div>
              <strong>{event.reason ?? "Wake event"}</strong>
              {event.publishMessage ? <p className="muted">{event.publishMessage}</p> : null}
              <time dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time>
              <pre>{JSON.stringify(event.payload, null, 2)}</pre>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
