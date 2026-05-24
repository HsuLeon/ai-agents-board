import Link from "next/link";
import { revalidatePath } from "next/cache";
import { CheckCircle2, CircleHelp, MessageSquareReply, Search } from "lucide-react";
import { StatusPill } from "@/components/status-pill";
import { answerTaskQuestion, listAgents, listTasks } from "@/lib/db";
import { formatDateTime } from "@/lib/activity";
import type { Agent, Task, TaskQuestion } from "@/lib/types";

export const dynamic = "force-dynamic";

type QuestionItem = {
  task: Task;
  question: TaskQuestion;
};

function agentName(agents: Agent[], id?: string) {
  return agents.find((agent) => agent.id === id)?.name ?? id;
}

function questionOwner(question: TaskQuestion, agents: Agent[]) {
  if (question.targetAgentId) {
    return agentName(agents, question.targetAgentId) ?? question.targetAgentId;
  }

  return question.targetRole ?? "unassigned";
}

function ownerKey(question: TaskQuestion) {
  return question.targetAgentId ?? question.targetRole ?? "unassigned";
}

function matchesStatus(question: TaskQuestion, status: string) {
  if (status === "all") {
    return true;
  }

  if (status === "resolved") {
    return Boolean(question.resolvedAt);
  }

  return question.status === status;
}

export default async function QuestionsPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; owner?: string }>;
}) {
  const [{ status = "open", owner = "all" }, agents, tasks] = await Promise.all([
    searchParams,
    listAgents(),
    listTasks()
  ]);

  async function answerQuestionAction(formData: FormData) {
    "use server";

    const questionId = String(formData.get("questionId") ?? "");
    const answer = String(formData.get("answer") ?? "").trim();
    const createDecision = String(formData.get("createDecision") ?? "") === "on";

    if (!questionId || !answer) {
      return;
    }

    await answerTaskQuestion({
      id: questionId,
      answer,
      resolve: true,
      createDecision,
      decidedBy: "human",
      source: `question:${questionId}`
    });

    revalidatePath("/questions");
    revalidatePath("/blocked");
  }

  const allQuestions: QuestionItem[] = tasks.flatMap((task) =>
    task.questions.map((question) => ({
      task,
      question
    }))
  );

  const filteredQuestions = allQuestions.filter(({ question }) => {
    const ownerMatches = owner === "all" || ownerKey(question) === owner;
    return ownerMatches && matchesStatus(question, status);
  });

  const openQuestions = allQuestions.filter(({ question }) => question.status === "open");
  const resolvedQuestions = allQuestions.filter(({ question }) => Boolean(question.resolvedAt));
  const ownerCounts = openQuestions.reduce<Record<string, number>>((counts, { question }) => {
    const key = ownerKey(question);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});

  const filterHref = (next: { status?: string; owner?: string }) => {
    const params = new URLSearchParams();
    params.set("status", next.status ?? status);
    params.set("owner", next.owner ?? owner);
    return `/questions?${params.toString()}`;
  };

  return (
    <>
      <section className="page-heading">
        <div>
          <h1>Question Inbox</h1>
          <p>集中處理 PM、Engineer、QA 之間的角色導向問答，避免只因需要釐清就退回上一階段。</p>
        </div>
        <div className="actions">
          <Link className="button" href="/blocked">
            <Search size={16} />
            Attention hub
          </Link>
        </div>
      </section>

      <section className="metrics">
        <div className="metric">
          <span>Open</span>
          <strong>{openQuestions.length}</strong>
        </div>
        <div className="metric">
          <span>Resolved</span>
          <strong>{resolvedQuestions.length}</strong>
        </div>
        <div className="metric">
          <span>Total</span>
          <strong>{allQuestions.length}</strong>
        </div>
        <div className="metric">
          <span>Visible</span>
          <strong>{filteredQuestions.length}</strong>
        </div>
      </section>

      <section className="grid-two">
        <div className="stack">
          <section className="panel">
            <h2>Filters</h2>
            <div className="actions">
              {["open", "answered", "resolved", "cancelled", "all"].map((option) => (
                <Link
                  className={status === option ? "button primary" : "button"}
                  href={filterHref({ status: option })}
                  key={option}
                >
                  {option}
                </Link>
              ))}
            </div>
          </section>

          <section className="panel">
            <h2>Questions</h2>
            <div className="stack">
              {filteredQuestions.length === 0 ? <p className="muted">No questions match the current filters.</p> : null}
              {filteredQuestions.map(({ task, question }) => (
                <article className="question-card" key={question.id}>
                  <div className="question-card-header">
                    <div>
                      <div className="inline-list">
                        <span className={question.status === "open" ? "pill status-blocked" : "pill status-done"}>
                          {question.status === "open" ? <CircleHelp size={13} /> : <CheckCircle2 size={13} />}
                          {question.status}
                        </span>
                        <StatusPill status={task.status} />
                        <span className="pill">to {questionOwner(question, agents)}</span>
                        {question.askedByAgentId ? (
                          <span className="pill">from {agentName(agents, question.askedByAgentId)}</span>
                        ) : null}
                      </div>
                      <h2>{question.question}</h2>
                      <p className="muted">
                        <Link href={`/tasks/${task.id}`}>{task.title}</Link> · {formatDateTime(question.createdAt)}
                      </p>
                    </div>
                  </div>

                  {question.answer ? (
                    <div className="answer-box">
                      <strong>Answer</strong>
                      <p>{question.answer}</p>
                      <p className="muted">
                        {question.answeredByAgentId ? `Answered by ${agentName(agents, question.answeredByAgentId)} · ` : null}
                        {question.answeredAt ? formatDateTime(question.answeredAt) : null}
                      </p>
                    </div>
                  ) : null}

                  {question.status === "open" ? (
                    <form className="form" action={answerQuestionAction}>
                      <input name="questionId" type="hidden" value={question.id} />
                      <div className="field">
                        <label htmlFor={`answer-${question.id}`}>Answer</label>
                        <textarea id={`answer-${question.id}`} name="answer" placeholder="輸入回覆內容" />
                      </div>
                      <div className="checkbox-grid">
                        <label>
                          <input name="createDecision" type="checkbox" />
                          Also write decision
                        </label>
                      </div>
                      <div className="actions">
                        <button className="button primary" type="submit">
                          <MessageSquareReply size={16} />
                          Answer and resolve
                        </button>
                        <Link className="button" href={`/tasks/${task.id}`}>
                          Open task
                        </Link>
                      </div>
                    </form>
                  ) : (
                    <div className="actions">
                      <Link className="button" href={`/tasks/${task.id}`}>
                        Open task
                      </Link>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        </div>

        <aside className="stack">
          <section className="panel">
            <h2>Open By Owner</h2>
            <div className="stack">
              <Link className={owner === "all" ? "attention-row active" : "attention-row"} href={filterHref({ owner: "all" })}>
                <span>All owners</span>
                <strong>{openQuestions.length}</strong>
              </Link>
              {Object.entries(ownerCounts).map(([key, count]) => (
                <Link
                  className={owner === key ? "attention-row active" : "attention-row"}
                  href={filterHref({ owner: key, status: "open" })}
                  key={key}
                >
                  <span>{agentName(agents, key) ?? key}</span>
                  <strong>{count}</strong>
                </Link>
              ))}
            </div>
          </section>

          <section className="panel subtle-panel">
            <h2>Routing Guidance</h2>
            <div className="stack">
              <p>
                <strong>QA to Engineer:</strong> 測試環境、實作細節、測試證據不清楚時，先問工程師。
              </p>
              <p>
                <strong>Engineer to PM:</strong> 需求或產品行為不清楚時，問 PM。
              </p>
              <p>
                <strong>Return stages:</strong> 只有確認不符合需求或驗收失敗時，才退回開發或驗測。
              </p>
            </div>
          </section>
        </aside>
      </section>
    </>
  );
}
