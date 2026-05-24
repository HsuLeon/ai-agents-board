import Link from "next/link";
import { AlertTriangle, MessageSquareWarning, TimerReset } from "lucide-react";
import { TaskCard } from "@/components/task-card";
import { listAgents, listTasks } from "@/lib/db";
import type { Agent, AgentRole, Task, TaskQuestion } from "@/lib/types";

export const dynamic = "force-dynamic";

type WaitingItem = {
  id: string;
  task: Task;
  kind: "question" | "progress";
  title: string;
  body: string;
  targetRole?: AgentRole;
  targetAgentId?: string;
};

function agentName(agents: Agent[], id?: string) {
  return agents.find((agent) => agent.id === id)?.name ?? id;
}

function questionTarget(question: TaskQuestion, agents: Agent[]) {
  if (question.targetAgentId) {
    return agentName(agents, question.targetAgentId);
  }

  return question.targetRole ?? "unassigned";
}

export default async function BlockedPage() {
  const [agents, allTasks] = await Promise.all([listAgents(), listTasks()]);
  const tasks = allTasks.filter(
    (task) =>
      task.status === "blocked" ||
      task.status === "stalled" ||
      task.questions.some((question) => question.status === "open") ||
      task.progressReports.some((report) => report.needsResponse)
  );

  const waitingItems: WaitingItem[] = tasks.flatMap((task) => [
    ...task.questions
      .filter((question) => question.status === "open")
      .map((question) => ({
        id: question.id,
        task,
        kind: "question" as const,
        title: `Question for ${questionTarget(question, agents)}`,
        body: question.question,
        targetRole: question.targetRole,
        targetAgentId: question.targetAgentId
      })),
    ...task.progressReports
      .filter((report) => report.needsResponse)
      .map((report) => ({
        id: report.id,
        task,
        kind: "progress" as const,
        title: `Waiting for ${report.expectedResponderRole ?? "response"}`,
        body: `${report.workerStatus}: ${report.summary}`,
        targetRole: report.expectedResponderRole
      }))
  ]);

  const blockedCount = tasks.filter((task) => task.status === "blocked").length;
  const stalledCount = tasks.filter((task) => task.status === "stalled").length;
  const openQuestionCount = waitingItems.filter((item) => item.kind === "question").length;
  const roleCounts = waitingItems.reduce<Record<string, number>>((counts, item) => {
    const key = item.targetAgentId ?? item.targetRole ?? "unassigned";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});

  return (
    <>
      <section className="page-heading">
        <div>
          <h1>Attention Hub</h1>
          <p>集中檢視阻塞、停滯、開放問題，以及目前等待哪個角色或 Agent 回覆。</p>
        </div>
        <div className="actions">
          <Link className="button primary" href="/questions">
            <MessageSquareWarning size={16} />
            Open question inbox
          </Link>
        </div>
      </section>

      <section className="metrics">
        <div className="metric">
          <span>Blocked tasks</span>
          <strong>{blockedCount}</strong>
        </div>
        <div className="metric">
          <span>Stalled tasks</span>
          <strong>{stalledCount}</strong>
        </div>
        <div className="metric">
          <span>Open questions</span>
          <strong>{openQuestionCount}</strong>
        </div>
        <div className="metric">
          <span>Waiting items</span>
          <strong>{waitingItems.length}</strong>
        </div>
      </section>

      <section className="grid-two">
        <div className="panel">
          <h2>Tasks Needing Attention</h2>
          <div className="stack">
            {tasks.length === 0 ? <p className="muted">No blocked, stalled, or waiting tasks.</p> : null}
            {tasks.map((task) => (
              <TaskCard key={task.id} task={task} agents={agents} />
            ))}
          </div>
        </div>

        <aside className="stack">
          <section className="panel">
            <h2>Waiting By Owner</h2>
            <div className="stack">
              {Object.keys(roleCounts).length === 0 ? <p className="muted">No active waiting owners.</p> : null}
              {Object.entries(roleCounts).map(([owner, count]) => (
                <Link className="attention-row" href={`/questions?owner=${encodeURIComponent(owner)}`} key={owner}>
                  <span>{agentName(agents, owner) ?? owner}</span>
                  <strong>{count}</strong>
                </Link>
              ))}
            </div>
          </section>

          <section className="panel">
            <h2>Waiting Items</h2>
            <div className="stack">
              {waitingItems.length === 0 ? <p className="muted">No open questions or waiting progress reports.</p> : null}
              {waitingItems.map((item) => (
                <Link className="attention-card" href={`/tasks/${item.task.id}`} key={item.id}>
                  <div className="inline-list">
                    <span className={item.kind === "question" ? "pill status-blocked" : "pill status-stalled"}>
                      {item.kind === "question" ? <MessageSquareWarning size={13} /> : <TimerReset size={13} />}
                      {item.kind}
                    </span>
                    {item.targetRole ? <span className="pill">to {item.targetRole}</span> : null}
                    {item.targetAgentId ? <span className="pill">to {agentName(agents, item.targetAgentId)}</span> : null}
                  </div>
                  <strong>{item.title}</strong>
                  <p className="muted">{item.task.title}</p>
                  <p>{item.body}</p>
                </Link>
              ))}
            </div>
          </section>

          <section className="panel subtle-panel">
            <h2>
              <AlertTriangle size={16} /> Routing rule
            </h2>
            <p className="muted">
              QA 需要釐清實作或測試證據時，優先問 engineer 並留在驗測階段；確認不符合需求時才退回開發。
            </p>
          </section>
        </aside>
      </section>
    </>
  );
}
