import Link from "next/link";
import type { Agent, Task } from "@/lib/types";
import { StatusPill } from "./status-pill";

export function TaskCard({ task, agents }: { task: Task; agents: Agent[] }) {
  const owner = agents.find((agent) => agent.id === task.currentOwnerAgentId);
  const openQuestions = task.questions.filter((question) => question.status === "open").length;

  return (
    <Link className="task-card" href={`/tasks/${task.id}`}>
      <h3>{task.title}</h3>
      <div className="task-card-meta">
        <StatusPill status={task.status} />
        <span className="pill">P{task.priority}</span>
        {owner ? <span className="pill">{owner.name}</span> : null}
        {task.currentOwnerRole ? <span className="pill">{task.currentOwnerRole}</span> : null}
        {openQuestions > 0 ? <span className="pill status-blocked">{openQuestions} open question</span> : null}
      </div>
    </Link>
  );
}
