import Link from "next/link";
import { StatusPill } from "@/components/status-pill";
import { listAgents, listTasks } from "@/lib/db";
import { formatDateTime } from "@/lib/activity";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const [tasks, agents] = await Promise.all([listTasks(), listAgents()]);
  const qaReports = tasks.flatMap((task) =>
    task.qaReports.map((report) => ({
      task,
      report,
      agent: agents.find((agent) => agent.id === report.agentId)
    }))
  );
  const acceptanceReports = tasks.flatMap((task) =>
    task.acceptanceReports.map((report) => ({
      task,
      report,
      agent: agents.find((agent) => agent.id === report.agentId)
    }))
  );

  return (
    <>
      <section className="page-heading">
        <div>
          <h1>Reports</h1>
          <p>Review QA and PM acceptance reports across every task.</p>
        </div>
      </section>

      <section className="grid-two">
        <div className="panel">
          <h2>QA Reports</h2>
          <div className="stack">
            {qaReports.length === 0 ? <p className="muted">No QA reports yet.</p> : null}
            {qaReports.map(({ task, report, agent }) => (
              <Link className="task-card" href={`/tasks/${task.id}`} key={report.id}>
                <h3>{task.title}</h3>
                <div className="task-card-meta">
                  <StatusPill status={task.status} />
                  <span className="pill">{report.recommendation}</span>
                  {agent ? <span className="pill">{agent.name}</span> : null}
                  <span className="pill">{formatDateTime(report.createdAt)}</span>
                </div>
                <p className="muted">{report.summary}</p>
              </Link>
            ))}
          </div>
        </div>

        <div className="panel">
          <h2>Acceptance Reports</h2>
          <div className="stack">
            {acceptanceReports.length === 0 ? <p className="muted">No acceptance reports yet.</p> : null}
            {acceptanceReports.map(({ task, report, agent }) => (
              <Link className="task-card" href={`/tasks/${task.id}`} key={report.id}>
                <h3>{task.title}</h3>
                <div className="task-card-meta">
                  <StatusPill status={task.status} />
                  <span className="pill">{report.decision}</span>
                  {agent ? <span className="pill">{agent.name}</span> : null}
                  <span className="pill">{formatDateTime(report.createdAt)}</span>
                </div>
                <p className="muted">{report.summary}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
