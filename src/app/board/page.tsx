import { TaskCard } from "@/components/task-card";
import { listAgents, listTasks } from "@/lib/db";
import { taskStatusLabels, taskStatusOrder } from "@/lib/workflow";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const [tasks, agents] = await Promise.all([listTasks(), listAgents()]);

  return (
    <>
      <section className="page-heading">
        <div>
          <h1>Workflow Board</h1>
          <p>依照規劃、討論、開發、驗測、驗收與完工階段追蹤每個細節工項。</p>
        </div>
      </section>

      <section className="board" aria-label="Task workflow board">
        {taskStatusOrder.map((status) => {
          const laneTasks = tasks.filter((task) => task.status === status);
          return (
            <div className="lane" key={status}>
              <div className="lane-title">
                <h2>{taskStatusLabels[status]}</h2>
                <span className="pill">{laneTasks.length}</span>
              </div>
              {laneTasks.map((task) => (
                <TaskCard key={task.id} task={task} agents={agents} />
              ))}
            </div>
          );
        })}
      </section>
    </>
  );
}
