"use client";

import { useMemo, useState } from "react";
import { PlugZap } from "lucide-react";
import type { Agent, AgentRole, Task } from "@/lib/types";

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

type TestState =
  | { status: "idle" }
  | { status: "success"; inbox: AgentInbox }
  | { status: "error"; message: string };

type AgentConnectionTestProps = {
  agentId: string;
  initialToken?: string;
};

async function readJson(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : JSON.stringify(body, null, 2);
    throw new Error(message || `Request failed with ${response.status}`);
  }
  return body as { inbox: AgentInbox };
}

export function AgentConnectionTest({ agentId, initialToken = "" }: AgentConnectionTestProps) {
  const [token, setToken] = useState(initialToken);
  const [testState, setTestState] = useState<TestState>({ status: "idle" });
  const [busy, setBusy] = useState(false);

  const canTest = useMemo(() => token.trim().length > 0, [token]);

  async function testConnection() {
    if (!canTest) {
      setTestState({ status: "error", message: "Paste an agent token before testing the connection." });
      return;
    }

    setBusy(true);
    setTestState({ status: "idle" });
    try {
      const result = await fetch("/api/agents/me/inbox", {
        headers: {
          Authorization: `Bearer ${token.trim()}`
        }
      }).then(readJson);

      if (result.inbox.agent.id !== agentId) {
        setTestState({
          status: "error",
          message: `Token authenticated as ${result.inbox.agent.id}, but this page is for ${agentId}.`
        });
        return;
      }

      setTestState({ status: "success", inbox: result.inbox });
    } catch (error) {
      setTestState({
        status: "error",
        message: error instanceof Error ? error.message : "Connection test failed."
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel stack">
      <h2>
        <PlugZap size={16} /> Connection Test
      </h2>
      <p className="muted">
        Test the real bearer token flow against <code>/api/agents/me/inbox</code>. This confirms the agent can
        authenticate and read its work queue.
      </p>
      <label className="field" htmlFor="connection-test-token">
        <span>Agent token</span>
        <input
          id="connection-test-token"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="Paste the one-time token after reset"
        />
      </label>
      <div className="actions">
        <button className="button primary" type="button" disabled={busy} onClick={testConnection}>
          {busy ? "Testing..." : "Test connection"}
        </button>
      </div>

      {testState.status === "success" ? (
        <div className="connection-result connection-result-ok">
          <strong>Connected as {testState.inbox.agent.name}</strong>
          <div className="connection-grid">
            <div>
              <span className="muted">Capacity</span>
              <strong>
                {testState.inbox.capacity.used}/{testState.inbox.capacity.limit}
              </strong>
            </div>
            <div>
              <span className="muted">Recommended</span>
              <strong>{testState.inbox.recommendedNextAction}</strong>
            </div>
            <div>
              <span className="muted">Current</span>
              <strong>{testState.inbox.currentTasks.length}</strong>
            </div>
            <div>
              <span className="muted">Questions</span>
              <strong>{testState.inbox.questions.length}</strong>
            </div>
          </div>
          <p>{testState.inbox.recommendedReason}</p>
        </div>
      ) : null}

      {testState.status === "error" ? (
        <div className="connection-result connection-result-error">
          <strong>Connection failed</strong>
          <p>{testState.message}</p>
        </div>
      ) : null}
    </section>
  );
}
