import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardCheck, Clock3, Plus, Radar } from "lucide-react";
import { TaskCard } from "@/components/task-card";
import { listAgents, listTasks } from "@/lib/db";
import { formatDateTime, taskActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [tasks, agents] = await Promise.all([listTasks(), listAgents()]);
  const blocked = tasks.filter((task) => task.status === "blocked");
  const activeAgents = agents.filter((agent) => agent.status === "active");
  const done = tasks.filter((task) => task.status === "done");
  const inFlight = tasks.filter((task) => !["done", "blocked", "stalled"].includes(task.status));
  const recentActivity = tasks
    .flatMap((task) => taskActivity(task).map((item) => ({ task, item })))
    .sort((a, b) => Date.parse(b.item.at) - Date.parse(a.item.at))
    .slice(0, 5);

  return (
    <>
      <section className="page-heading">
        <div>
          <h1>Dashboard</h1>
          <p>第一版 MVP 的工作台，集中顯示工項流轉、Agent 負載與需要人工介入的阻塞點。</p>
        </div>
        <Link className="button primary" href="/board">
          <ArrowRight size={16} />
          View board
        </Link>
        <Link className="button" href="/tasks/new">
          <Plus size={16} />
          New task
        </Link>
        <Link className="button" href="/reports">
          <ClipboardCheck size={16} />
          Reports
        </Link>
        <Link className="button" href="/watchdog">
          <Radar size={16} />
          Watchdog
        </Link>
      </section>

      <section className="metrics" aria-label="Project metrics">
        <div className="metric">
          <span>Active tasks</span>
          <strong>{inFlight.length}</strong>
        </div>
        <div className="metric">
          <span>Blocked</span>
          <strong>{blocked.length}</strong>
        </div>
        <div className="metric">
          <span>Active agents</span>
          <strong>{activeAgents.length}</strong>
        </div>
        <div className="metric">
          <span>Done</span>
          <strong>{done.length}</strong>
        </div>
      </section>

      <section className="grid-two">
        <div className="panel">
          <h2>Recent Tasks</h2>
          <div className="stack">
            {tasks.slice(0, 4).map((task) => (
              <TaskCard key={task.id} task={task} agents={agents} />
            ))}
          </div>
        </div>
        <aside className="panel">
          <h2>Attention</h2>
          <div className="stack">
            <p className="inline-list">
              <AlertTriangle size={16} />
              {blocked.length} blocked task needs a decision.
            </p>
            <p className="inline-list">
              <Clock3 size={16} />
              Lease and heartbeat APIs are scaffolded for worker integration.
            </p>
            <p className="inline-list">
              <CheckCircle2 size={16} />
              Prisma schema is ready for database hookup.
            </p>
          </div>
        </aside>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Recent Activity</h2>
        <div className="timeline">
          {recentActivity.length === 0 ? <p className="muted">No activity yet.</p> : null}
          {recentActivity.map(({ task, item }) => (
            <div className="timeline-item" key={`${task.id}-${item.id}`}>
              <strong>{item.title}</strong>
              <p className="muted">{task.title}</p>
              <time dateTime={item.at}>{formatDateTime(item.at)}</time>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
