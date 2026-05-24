import { WorkerConsole } from "@/components/worker-console";
import { listAgents, listTasks } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function WorkerPage() {
  const [agents, tasks] = await Promise.all([listAgents(), listTasks()]);

  return (
    <>
      <section className="page-heading">
        <div>
          <h1>Worker Console</h1>
          <p>
            Simulate Codex, Claude, or OpenClaw Worker API calls before connecting a real agent runtime.
          </p>
        </div>
      </section>

      <WorkerConsole agents={agents} tasks={tasks} />
    </>
  );
}
