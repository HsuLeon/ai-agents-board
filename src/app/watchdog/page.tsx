import { revalidatePath } from "next/cache";
import Link from "next/link";
import { scanWatchdog, listTasks } from "@/lib/db";
import { StatusPill } from "@/components/status-pill";

export const dynamic = "force-dynamic";

async function scanAction() {
  "use server";

  await scanWatchdog();
  revalidatePath("/watchdog");
  revalidatePath("/board");
  revalidatePath("/blocked");
}

export default async function WatchdogPage() {
  const tasks = await listTasks();
  const stalledTasks = tasks.filter((task) => task.status === "stalled");
  const leaseBacklog = tasks.filter((task) =>
    task.leases.some((lease) => ["assigned", "acknowledged", "queued", "claimed", "in_progress"].includes(lease.status))
  );

  return (
    <>
      <section className="page-heading">
        <div>
          <h1>Watchdog</h1>
          <p>掃描 active lease 是否過期，將卡住的工項標記為 stalled，並留下 system comment 與 transition 紀錄。</p>
        </div>
        <form action={scanAction}>
          <button className="button primary" type="submit">
            Run scan
          </button>
        </form>
      </section>

      <section className="metrics" aria-label="Watchdog metrics">
        <div className="metric">
          <span>Active leases</span>
          <strong>{leaseBacklog.length}</strong>
        </div>
        <div className="metric">
          <span>Stalled tasks</span>
          <strong>{stalledTasks.length}</strong>
        </div>
        <div className="metric">
          <span>Scannable tasks</span>
          <strong>{tasks.length}</strong>
        </div>
        <div className="metric">
          <span>Done</span>
          <strong>{tasks.filter((task) => task.status === "done").length}</strong>
        </div>
      </section>

      <section className="grid-two">
        <div className="panel">
          <h2>Lease Watchlist</h2>
          <div className="stack">
            {leaseBacklog.length === 0 ? <p className="muted">No active leases.</p> : null}
            {leaseBacklog.map((task) => (
              <Link className="task-card" href={`/tasks/${task.id}`} key={task.id}>
                <h3>{task.title}</h3>
                <div className="task-card-meta">
                  <StatusPill status={task.status} />
                  {task.leases.map((lease) => (
                    <span className="pill" key={lease.id}>
                      {lease.status} {lease.leaseUntil ? `until ${new Date(lease.leaseUntil).toLocaleTimeString("zh-TW")}` : ""}
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="panel">
          <h2>Stalled Tasks</h2>
          <div className="stack">
            {stalledTasks.length === 0 ? <p className="muted">No stalled tasks.</p> : null}
            {stalledTasks.map((task) => (
              <Link className="task-card" href={`/tasks/${task.id}`} key={task.id}>
                <h3>{task.title}</h3>
                <div className="task-card-meta">
                  <StatusPill status={task.status} />
                  {task.previousStatus ? <span className="pill">from {task.previousStatus}</span> : null}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
