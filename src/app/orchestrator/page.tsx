import { revalidatePath } from "next/cache";
import Link from "next/link";
import { dispatchTasks, getAgentWorkloads, listDispatchCandidates } from "@/lib/db";
import { StatusPill } from "@/components/status-pill";

export const dynamic = "force-dynamic";

async function dispatchAction() {
  "use server";

  await dispatchTasks();
  revalidatePath("/orchestrator");
  revalidatePath("/board");
  revalidatePath("/blocked");
  revalidatePath("/");
}

export default async function OrchestratorPage() {
  const [candidates, workloads] = await Promise.all([listDispatchCandidates(), getAgentWorkloads()]);

  return (
    <>
      <section className="page-heading">
        <div>
          <h1>Orchestrator</h1>
          <p>Dispatch tasks with an owner role to active agents. Workers still handle acknowledge, claim, heartbeat, and progress.</p>
        </div>
        <form action={dispatchAction}>
          <button className="button primary" type="submit">
            Run dispatch
          </button>
        </form>
      </section>

      <section className="metrics" aria-label="Orchestrator metrics">
        <div className="metric">
          <span>Dispatch candidates</span>
          <strong>{candidates.length}</strong>
        </div>
        <div className="metric">
          <span>Active agents</span>
          <strong>{workloads.filter(({ agent }) => agent.status === "active").length}</strong>
        </div>
        <div className="metric">
          <span>Total capacity</span>
          <strong>{workloads.reduce((total, item) => total + item.capacity, 0)}</strong>
        </div>
        <div className="metric">
          <span>Busy agents</span>
          <strong>{workloads.filter((item) => item.activeTaskCount > 0).length}</strong>
        </div>
      </section>

      <section className="grid-two">
        <div className="panel">
          <h2>Pending Dispatch</h2>
          <div className="stack">
            {candidates.length === 0 ? <p className="muted">No tasks need dispatch.</p> : null}
            {candidates.map((task) => (
              <Link className="task-card" href={`/tasks/${task.id}`} key={task.id}>
                <h3>{task.title}</h3>
                <div className="task-card-meta">
                  <StatusPill status={task.status} />
                  <span className="pill">P{task.priority}</span>
                  {task.currentOwnerRole ? <span className="pill">{task.currentOwnerRole}</span> : null}
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="panel">
          <h2>Agent Workload</h2>
          <div className="stack">
            {workloads.map(({ agent, activeTaskCount, capacityUsedCount, capacity, activeTasks }) => (
              <article className="task-card" key={agent.id}>
                <h3>{agent.name}</h3>
                <div className="task-card-meta">
                  <span className="pill">{agent.status}</span>
                  {agent.roles.map((role) => (
                    <span className="pill" key={role}>
                      {role}
                    </span>
                  ))}
                  <span className="pill">{activeTaskCount} tracked</span>
                  <span className="pill">{capacityUsedCount}/{agent.maxConcurrentTasks} capacity used</span>
                  <span className="pill">{capacity} capacity</span>
                </div>
                {activeTasks.length > 0 ? (
                  <div className="inline-list">
                    {activeTasks.map((task) => (
                      <Link href={`/tasks/${task.id}`} className="pill" key={task.id}>
                        {task.id}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
