"use client";

import { useEffect, useMemo, useState } from "react";
import type { Agent, AgentRole, AgentWorkStatus, Task } from "@/lib/types";

type WorkerConsoleProps = {
  agents: Agent[];
  tasks: Task[];
};

type AgentInbox = {
  agent: Agent;
  capacity: {
    used: number;
    limit: number;
    available: number;
  };
  recommendedNextAction: "answer_question" | "resume_current_task" | "claim_available_task" | "wait";
  recommendedReason: string;
  recommendedTaskId?: string;
  recommendedQuestionId?: string;
  currentTasks: Task[];
  availableTasks: Task[];
  queuedTasks: Task[];
  waitingTasks: Task[];
  questions: Array<{
    id: string;
    question: string;
    status: "open" | "answered" | "cancelled";
    askedByAgentId?: string;
    targetRole?: AgentRole;
    targetAgentId?: string;
    createdAt: string;
  }>;
};

type ProgressDraft = {
  workerStatus: Extract<
    AgentWorkStatus,
    | "in_progress"
    | "progress_reported"
    | "waiting_for_pm"
    | "waiting_for_engineer"
    | "waiting_for_human"
    | "waiting_for_qa"
    | "blocked"
    | "completed"
    | "failed"
  >;
  summary: string;
  nextAction: string;
  needsResponse: boolean;
  expectedResponderRole: "" | AgentRole;
  handoffReady: boolean;
  continuationPrompt: string;
};

const progressStatuses: ProgressDraft["workerStatus"][] = [
  "in_progress",
  "progress_reported",
  "waiting_for_pm",
  "waiting_for_engineer",
  "waiting_for_human",
  "waiting_for_qa",
  "blocked",
  "completed",
  "failed"
];

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

async function readJson(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(formatJson(body));
  }
  return body;
}

export function WorkerConsole({ agents, tasks }: WorkerConsoleProps) {
  const activeAgents = useMemo(() => agents.filter((agent) => agent.status === "active"), [agents]);
  const [agentId, setAgentId] = useState(activeAgents[0]?.id ?? agents[0]?.id ?? "");
  const [taskId, setTaskId] = useState(tasks[0]?.id ?? "");
  const [availableJson, setAvailableJson] = useState("");
  const [currentJson, setCurrentJson] = useState("");
  const [questionsJson, setQuestionsJson] = useState("");
  const [inbox, setInbox] = useState<AgentInbox | null>(null);
  const [resultJson, setResultJson] = useState("");
  const [bearerToken, setBearerToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [progressDraft, setProgressDraft] = useState<ProgressDraft>({
    workerStatus: "progress_reported",
    summary: "Checkpoint finished. Continue from the continuation prompt.",
    nextAction: "Continue the next implementation step and report again.",
    needsResponse: false,
    expectedResponderRole: "",
    handoffReady: true,
    continuationPrompt: "Read task context, latest progress report, artifacts, and open questions before continuing."
  });

  const selectedAgent = agents.find((agent) => agent.id === agentId);
  const selectedTask = tasks.find((task) => task.id === taskId);

  async function api(path: string, init?: RequestInit) {
    if (!agentId) {
      throw new Error("Select an agent first.");
    }

    const headers = new Headers(init?.headers);
    headers.set("Content-Type", "application/json");
    if (bearerToken.trim()) {
      headers.set("Authorization", `Bearer ${bearerToken.trim()}`);
    } else {
      headers.set("X-Agent-Id", agentId);
    }

    const response = await fetch(path, {
      ...init,
      headers
    });

    return readJson(response);
  }

  async function refresh(options: { updateResult?: boolean } = {}) {
    const { updateResult = true } = options;
    if (!agentId) {
      return;
    }

    setBusy(true);
    try {
      const [inboxResult, available, current, questions] = await Promise.all([
        api("/api/agents/me/inbox"),
        api("/api/agents/me/tasks/available"),
        api("/api/agents/me/tasks/current"),
        api("/api/agents/me/questions")
      ]);
      setInbox(inboxResult.inbox);
      setAvailableJson(formatJson(available));
      setCurrentJson(formatJson(current));
      setQuestionsJson(formatJson(questions));
      if (updateResult) {
        setResultJson(formatJson({ refreshedAt: new Date().toISOString() }));
      }
    } catch (error) {
      setResultJson(error instanceof Error ? error.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  async function postTaskAction(action: "acknowledge" | "claim" | "heartbeat" | "progress" | "release") {
    if (!taskId) {
      setResultJson("Select a task first.");
      return;
    }

    const bodies = {
      acknowledge: {
        understanding: "I have read the task goal, constraints, acceptance criteria, and upstream handoff notes.",
        plan: ["Read task context", "Report understanding and risks", "Start the smallest verifiable step"],
        confidence: 0.82,
        blockers: []
      },
      claim: undefined,
      heartbeat: {
        note: "Still working. Please extend the lease."
      },
      progress: {
        ...progressDraft,
        expectedResponderRole: progressDraft.expectedResponderRole || undefined
      },
      release: {
        reason: "Mock worker released the task so another agent or PM can take over."
      }
    } satisfies Record<string, unknown>;

    setBusy(true);
    try {
      const body = bodies[action];
      const result = await api(`/api/tasks/${taskId}/${action}`, {
        method: "POST",
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      setResultJson(formatJson(result));
      await refresh({ updateResult: false });
    } catch (error) {
      setResultJson(error instanceof Error ? error.message : `${action} failed`);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  const curlExample = selectedTask
    ? `curl -X POST http://localhost:3000/api/tasks/${selectedTask.id}/progress \\
  -H "Content-Type: application/json" \\
  -H "${bearerToken.trim() ? `Authorization: Bearer ${bearerToken.trim()}` : `X-Agent-Id: ${agentId || "AGENT_ID"}`}" \\
  -d '${JSON.stringify(
    {
      workerStatus: "progress_reported",
      summary: "Checkpoint finished; PM response is not required.",
      nextAction: "Continue the next implementation step.",
      needsResponse: false,
      handoffReady: true,
      continuationPrompt: "Read latest context and progress report, then continue."
    },
    null,
    2
  )}'`
    : "Select a task to generate an example.";

  return (
    <section className="grid-two">
      <div className="panel stack">
        <h2>Agent Inbox</h2>
        <div className="worker-controls">
          <label className="field">
            <span>Agent</span>
            <select value={agentId} onChange={(event) => setAgentId(event.target.value)}>
              {agents.map((agent) => (
                <option value={agent.id} key={agent.id}>
                  {agent.name} ({agent.provider}, {agent.roles.join("/")})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Task</span>
            <select value={taskId} onChange={(event) => setTaskId(event.target.value)}>
              {tasks.map((task) => (
                <option value={task.id} key={task.id}>
                  {task.title} ({task.status})
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="field">
          <span>Bearer token override</span>
          <input
            value={bearerToken}
            onChange={(event) => setBearerToken(event.target.value)}
            placeholder="Optional API token"
          />
        </label>

        <div className="inline-list">
          {selectedAgent?.roles.map((role) => (
            <span className="pill" key={role}>
              {role}
            </span>
          ))}
          {selectedTask ? <span className="pill">P{selectedTask.priority}</span> : null}
          {selectedTask?.currentOwnerRole ? <span className="pill">{selectedTask.currentOwnerRole}</span> : null}
        </div>

        {inbox ? (
          <div className="agent-inbox-summary">
            <div className="metric">
              <span>Recommended</span>
              <strong className="metric-small">{inbox.recommendedNextAction}</strong>
            </div>
            <div className="metric">
              <span>Capacity</span>
              <strong>
                {inbox.capacity.used}/{inbox.capacity.limit}
              </strong>
            </div>
            <div className="metric">
              <span>Current</span>
              <strong>{inbox.currentTasks.length}</strong>
            </div>
            <div className="metric">
              <span>Questions</span>
              <strong>{inbox.questions.length}</strong>
            </div>
          </div>
        ) : null}

        {inbox ? (
          <div className="inbox-recommendation">
            <strong>{inbox.recommendedNextAction}</strong>
            <p>{inbox.recommendedReason}</p>
            <div className="inline-list">
              {inbox.recommendedTaskId ? <span className="pill">task {inbox.recommendedTaskId}</span> : null}
              {inbox.recommendedQuestionId ? <span className="pill">question {inbox.recommendedQuestionId}</span> : null}
            </div>
          </div>
        ) : null}

        {inbox ? (
          <div className="inbox-grid">
            <section className="inset-panel panel">
              <h2>Current</h2>
              <div className="stack">
                {inbox.currentTasks.length === 0 ? <p className="muted">No current tasks.</p> : null}
                {inbox.currentTasks.map((task) => (
                  <button className="inbox-task-card" key={task.id} type="button" onClick={() => setTaskId(task.id)}>
                    <strong>{task.title}</strong>
                    <span>
                      {task.status} · P{task.priority}
                    </span>
                  </button>
                ))}
              </div>
            </section>
            <section className="inset-panel panel">
              <h2>Available</h2>
              <div className="stack">
                {inbox.availableTasks.length === 0 ? <p className="muted">No available tasks.</p> : null}
                {inbox.availableTasks.slice(0, 4).map((task) => (
                  <button className="inbox-task-card" key={task.id} type="button" onClick={() => setTaskId(task.id)}>
                    <strong>{task.title}</strong>
                    <span>
                      {task.status} · P{task.priority}
                    </span>
                  </button>
                ))}
              </div>
            </section>
            <section className="inset-panel panel">
              <h2>Targeted Questions</h2>
              <div className="stack">
                {inbox.questions.length === 0 ? <p className="muted">No targeted questions.</p> : null}
                {inbox.questions.map((question) => (
                  <div className="inbox-question-card" key={question.id}>
                    <strong>{question.question}</strong>
                    <span>
                      {question.targetAgentId ? `to ${question.targetAgentId}` : question.targetRole ? `to ${question.targetRole}` : "unassigned"}
                    </span>
                  </div>
                ))}
              </div>
            </section>
            <section className="inset-panel panel">
              <h2>Waiting / Queued</h2>
              <div className="stack">
                {inbox.waitingTasks.length === 0 && inbox.queuedTasks.length === 0 ? (
                  <p className="muted">No waiting or queued tasks.</p>
                ) : null}
                {[...inbox.waitingTasks, ...inbox.queuedTasks].map((task) => (
                  <button className="inbox-task-card" key={task.id} type="button" onClick={() => setTaskId(task.id)}>
                    <strong>{task.title}</strong>
                    <span>
                      {task.status} · P{task.priority}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        <div className="actions">
          <button className="button" type="button" disabled={busy} onClick={() => refresh()}>
            Refresh
          </button>
          <button className="button" type="button" disabled={busy} onClick={() => postTaskAction("acknowledge")}>
            Acknowledge
          </button>
          <button className="button" type="button" disabled={busy} onClick={() => postTaskAction("claim")}>
            Claim
          </button>
          <button className="button" type="button" disabled={busy} onClick={() => postTaskAction("heartbeat")}>
            Heartbeat
          </button>
          <button className="button danger" type="button" disabled={busy} onClick={() => postTaskAction("release")}>
            Release
          </button>
        </div>

        <div className="panel inset-panel stack">
          <h2>Progress Payload</h2>
          <div className="worker-controls">
            <label className="field">
              <span>Worker status</span>
              <select
                value={progressDraft.workerStatus}
                onChange={(event) =>
                  setProgressDraft((draft) => ({
                    ...draft,
                    workerStatus: event.target.value as ProgressDraft["workerStatus"]
                  }))
                }
              >
                {progressStatuses.map((status) => (
                  <option value={status} key={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Expected responder</span>
              <select
                value={progressDraft.expectedResponderRole}
                onChange={(event) =>
                  setProgressDraft((draft) => ({
                    ...draft,
                    expectedResponderRole: event.target.value as "" | AgentRole
                  }))
                }
              >
                <option value="">none</option>
                <option value="pm">pm</option>
                <option value="engineer">engineer</option>
                <option value="qa">qa</option>
                <option value="reviewer">reviewer</option>
                <option value="observer">observer</option>
              </select>
            </label>
          </div>
          <label className="field">
            <span>Summary</span>
            <textarea
              value={progressDraft.summary}
              onChange={(event) => setProgressDraft((draft) => ({ ...draft, summary: event.target.value }))}
            />
          </label>
          <label className="field">
            <span>Next action</span>
            <textarea
              value={progressDraft.nextAction}
              onChange={(event) => setProgressDraft((draft) => ({ ...draft, nextAction: event.target.value }))}
            />
          </label>
          <label className="field">
            <span>Continuation prompt</span>
            <textarea
              value={progressDraft.continuationPrompt}
              onChange={(event) =>
                setProgressDraft((draft) => ({ ...draft, continuationPrompt: event.target.value }))
              }
            />
          </label>
          <div className="checkbox-grid">
            <label>
              <input
                type="checkbox"
                checked={progressDraft.needsResponse}
                onChange={(event) => setProgressDraft((draft) => ({ ...draft, needsResponse: event.target.checked }))}
              />
              needsResponse
            </label>
            <label>
              <input
                type="checkbox"
                checked={progressDraft.handoffReady}
                onChange={(event) => setProgressDraft((draft) => ({ ...draft, handoffReady: event.target.checked }))}
              />
              handoffReady
            </label>
          </div>
          <button className="button primary" type="button" disabled={busy} onClick={() => postTaskAction("progress")}>
            Send progress
          </button>
        </div>
      </div>

      <div className="stack">
        <div className="panel">
          <h2>API Contract</h2>
          <p className="muted">
            Real workers should use <code>Authorization: Bearer token</code>. The local console can still fall back to
            <code>X-Agent-Id</code> for fast MVP testing.
          </p>
          <pre>{curlExample}</pre>
        </div>
        <div className="panel">
          <h2>Latest Result</h2>
          <pre>{resultJson || "No request yet."}</pre>
        </div>
        <div className="panel">
          <h2>Available Tasks</h2>
          <pre>{availableJson || "No data yet."}</pre>
        </div>
        <div className="panel">
          <h2>Current Tasks</h2>
          <pre>{currentJson || "No data yet."}</pre>
        </div>
        <div className="panel">
          <h2>Targeted Questions</h2>
          <pre>{questionsJson || "No data yet."}</pre>
        </div>
      </div>
    </section>
  );
}
