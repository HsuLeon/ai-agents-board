import { notFound } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { CheckCircle2, ClipboardCheck, GitBranch, MessageSquarePlus, Pencil, ShieldCheck } from "lucide-react";
import { StatusPill } from "@/components/status-pill";
import {
  addAcceptanceCriterion,
  addTaskDecision,
  addTaskQuestion,
  answerTaskQuestion,
  getAgent,
  getTask,
  setAcceptanceCriterionChecked,
  submitAcceptanceReport,
  submitQaReport,
  transitionTask
} from "@/lib/db";
import { optionalString, lines } from "@/lib/form-utils";
import { formatDateTime, taskActivity } from "@/lib/activity";
import { allowedTransitions, taskStatusLabels } from "@/lib/workflow";
import type { AgentRole, TaskStatus } from "@/lib/types";

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = await getTask(id);
  if (!task) {
    notFound();
  }

  const owner = task.currentOwnerAgentId ? await getAgent(task.currentOwnerAgentId) : undefined;
  const nextStatuses = allowedTransitions[task.status];
  const activity = taskActivity(task);
  const openQuestions = task.questions.filter((question) => question.status === "open");
  const resolvedQuestions = task.questions.filter((question) => question.status !== "open");
  const latestProgress = task.progressReports[task.progressReports.length - 1];
  const latestLease = task.leases[task.leases.length - 1];

  async function transitionAction(formData: FormData) {
    "use server";

    await transitionTask({
      taskId: id,
      toStatus: String(formData.get("toStatus") ?? "blocked") as TaskStatus,
      reason: optionalString(formData.get("reason")),
      requestedChanges: lines(formData.get("requestedChanges")),
      actorType: "human"
    });

    revalidatePath(`/tasks/${id}`);
    revalidatePath("/board");
    revalidatePath("/blocked");
  }

  async function addCriterionAction(formData: FormData) {
    "use server";

    const description = String(formData.get("description") ?? "").trim();
    if (description) {
      await addAcceptanceCriterion(id, description);
      revalidatePath(`/tasks/${id}`);
    }
  }

  async function toggleCriterionAction(formData: FormData) {
    "use server";

    const criterionId = String(formData.get("criterionId") ?? "");
    const checked = String(formData.get("checked") ?? "") === "true";
    if (criterionId) {
      await setAcceptanceCriterionChecked(criterionId, checked);
      revalidatePath(`/tasks/${id}`);
    }
  }

  async function addQuestionAction(formData: FormData) {
    "use server";

    const question = String(formData.get("question") ?? "").trim();
    const targetRole = optionalString(formData.get("targetRole")) as AgentRole | undefined;
    const targetAgentId = optionalString(formData.get("targetAgentId"));
    if (question) {
      await addTaskQuestion({ taskId: id, question, targetRole, targetAgentId });
      revalidatePath(`/tasks/${id}`);
      revalidatePath("/questions");
      revalidatePath("/blocked");
    }
  }

  async function answerQuestionAction(formData: FormData) {
    "use server";

    const questionId = String(formData.get("questionId") ?? "");
    const answer = String(formData.get("answer") ?? "").trim();
    const createDecision = String(formData.get("createDecision") ?? "") === "on";
    if (questionId && answer) {
      await answerTaskQuestion({
        id: questionId,
        answer,
        resolve: true,
        createDecision,
        decidedBy: "human",
        source: `question:${questionId}`
      });
      revalidatePath(`/tasks/${id}`);
      revalidatePath("/questions");
      revalidatePath("/blocked");
    }
  }

  async function addDecisionAction(formData: FormData) {
    "use server";

    const decision = String(formData.get("decision") ?? "").trim();
    if (decision) {
      await addTaskDecision({
        taskId: id,
        decision,
        decidedBy: optionalString(formData.get("decidedBy")) ?? "human",
        source: optionalString(formData.get("source"))
      });
      revalidatePath(`/tasks/${id}`);
    }
  }

  async function addQaReportAction(formData: FormData) {
    "use server";

    const recommendation = String(formData.get("recommendation") ?? "needs_human_review") as
      | "pass"
      | "fail"
      | "needs_human_review";
    const summary = String(formData.get("summary") ?? "").trim();
    if (!summary) {
      return;
    }

    await submitQaReport({
      taskId: id,
      agentId: optionalString(formData.get("agentId")),
      summary,
      checkedItems: lines(formData.get("checkedItems")),
      commandsRun: lines(formData.get("commandsRun")),
      issuesFound: lines(formData.get("issuesFound")),
      recommendation,
      actorType: "human"
    });

    revalidatePath(`/tasks/${id}`);
    revalidatePath("/board");
    revalidatePath("/reports");
  }

  async function addAcceptanceReportAction(formData: FormData) {
    "use server";

    const decision = String(formData.get("decision") ?? "needs_more_qa") as
      | "accepted"
      | "rejected"
      | "needs_more_qa";
    const summary = String(formData.get("summary") ?? "").trim();
    if (!summary) {
      return;
    }

    await submitAcceptanceReport({
      taskId: id,
      agentId: optionalString(formData.get("agentId")),
      summary,
      decision,
      reason: optionalString(formData.get("reason")),
      actorType: "human"
    });

    revalidatePath(`/tasks/${id}`);
    revalidatePath("/board");
    revalidatePath("/reports");
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <div className="inline-list">
            <StatusPill status={task.status} />
            <span className="pill">P{task.priority}</span>
            {owner ? <span className="pill">{owner.name}</span> : null}
            {task.currentOwnerRole ? <span className="pill">{task.currentOwnerRole}</span> : null}
          </div>
          <h1>{task.title}</h1>
          <p>{task.context.goal}</p>
        </div>
        <div className="actions">
          <Link className="button" href="/board">
            Board
          </Link>
          <Link className="button" href={`/tasks/${task.id}/edit`}>
            <Pencil size={16} />
            Edit task
          </Link>
        </div>
      </section>

      <section className="task-overview-grid">
        <div className="metric">
          <span>Open questions</span>
          <strong>{openQuestions.length}</strong>
        </div>
        <div className="metric">
          <span>Acceptance criteria</span>
          <strong>
            {task.acceptanceCriteria.filter((criterion) => criterion.checked).length}/{task.acceptanceCriteria.length}
          </strong>
        </div>
        <div className="metric">
          <span>Progress reports</span>
          <strong>{task.progressReports.length}</strong>
        </div>
        <div className="metric">
          <span>Latest worker status</span>
          <strong className="metric-small">{latestProgress?.workerStatus ?? latestLease?.status ?? "none"}</strong>
        </div>
      </section>

      <section className="task-detail-layout">
        <div className="stack">
          <section className="section-tabs" aria-label="Task sections">
            <a href="#context">Context</a>
            <a href="#questions">Questions</a>
            <a href="#progress">Progress</a>
            <a href="#reports">Reports</a>
            <a href="#timeline">Timeline</a>
          </section>

          <section className="panel" id="context">
            <h2>Context</h2>
            <div className="stack">
              {task.context.background ? <p>{task.context.background}</p> : <p className="muted">No background provided.</p>}
              <div className="context-grid">
                <div>
                  <h3>Requirements</h3>
                  {task.context.requirements.length === 0 ? <p className="muted">No requirements.</p> : null}
                  <ul className="clean-list">
                    {task.context.requirements.map((requirement) => (
                      <li key={requirement}>{requirement}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3>Constraints</h3>
                  {task.context.constraints.length === 0 ? <p className="muted">No constraints.</p> : null}
                  <ul className="clean-list">
                    {task.context.constraints.map((constraint) => (
                      <li key={constraint}>{constraint}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3>Handoff Notes</h3>
                  {task.context.handoffNotes.length === 0 ? <p className="muted">No handoff notes.</p> : null}
                  <ul className="clean-list">
                    {task.context.handoffNotes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </section>

          <section className="panel">
            <h2>Acceptance Criteria</h2>
            <div className="stack">
              {task.acceptanceCriteria.map((criterion) => (
                <form className="check-row" action={toggleCriterionAction} key={criterion.id}>
                  <input name="criterionId" type="hidden" value={criterion.id} />
                  <input name="checked" type="hidden" value={String(!criterion.checked)} />
                  <button className={criterion.checked ? "button" : "button primary"} type="submit">
                    <CheckCircle2 size={16} />
                    {criterion.checked ? "Mark open" : "Mark checked"}
                  </button>
                  <span>
                    <strong>{criterion.checked ? "Checked" : "Open"}:</strong> {criterion.description}
                  </span>
                </form>
              ))}
              <form className="form compact-form" action={addCriterionAction}>
                <div className="field">
                  <label htmlFor="description">Add criterion</label>
                  <input id="description" name="description" placeholder="新增驗收條件" />
                </div>
                <button className="button" type="submit">
                  Add criterion
                </button>
              </form>
            </div>
          </section>

          <section className="panel" id="questions">
            <h2>Questions</h2>
            <div className="stack">
              {openQuestions.length === 0 ? <p className="muted">No open questions.</p> : null}
              {openQuestions.map((question) => (
                <article className="question-card" key={question.id}>
                  <div className="inline-list">
                    <span className="pill status-blocked">open</span>
                    {question.askedByAgentId ? <span className="pill">from {question.askedByAgentId}</span> : null}
                    {question.targetRole ? <span className="pill">to {question.targetRole}</span> : null}
                    {question.targetAgentId ? <span className="pill">to {question.targetAgentId}</span> : null}
                  </div>
                  <h2>{question.question}</h2>
                  <form className="form" action={answerQuestionAction}>
                    <input name="questionId" type="hidden" value={question.id} />
                    <div className="field">
                      <label htmlFor={`answer-${question.id}`}>Answer</label>
                      <textarea id={`answer-${question.id}`} name="answer" placeholder="回答此問題" />
                    </div>
                    <div className="checkbox-grid">
                      <label>
                        <input name="createDecision" type="checkbox" />
                        Also write decision
                      </label>
                    </div>
                    <button className="button primary" type="submit">
                      Save answer
                    </button>
                  </form>
                </article>
              ))}
              {resolvedQuestions.length > 0 ? (
                <details className="details-panel">
                  <summary>Resolved questions ({resolvedQuestions.length})</summary>
                  <div className="stack">
                    {resolvedQuestions.map((question) => (
                      <div className="answer-box" key={question.id}>
                        <strong>{question.question}</strong>
                        {question.answer ? <p>{question.answer}</p> : null}
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          </section>

          <section className="panel" id="progress">
            <h2>Progress</h2>
            <div className="stack">
              {task.progressReports.length === 0 ? <p className="muted">No progress reports yet.</p> : null}
              {task.progressReports.map((report) => (
                <article className="report-card" key={report.id}>
                  <div className="inline-list">
                    <span className={report.needsResponse ? "pill status-blocked" : "pill"}>{report.workerStatus}</span>
                    {report.needsResponse ? (
                      <span className="pill status-blocked">needs {report.expectedResponderRole ?? "response"}</span>
                    ) : null}
                    {report.handoffReady ? <span className="pill status-done">handoff ready</span> : null}
                  </div>
                  <strong>{report.summary}</strong>
                  {report.nextAction ? <p className="muted">Next: {report.nextAction}</p> : null}
                  {report.continuationPrompt ? <pre>{report.continuationPrompt}</pre> : null}
                </article>
              ))}
            </div>
          </section>

          <section className="panel" id="reports">
            <h2>Reports</h2>
            <div className="context-grid">
              <div className="stack">
                <h3>QA Reports</h3>
                {task.qaReports.length === 0 ? <p className="muted">No QA reports yet.</p> : null}
                {task.qaReports.map((report) => (
                  <article className="report-card" key={report.id}>
                    <span className="pill">{report.recommendation}</span>
                    <strong>{report.summary}</strong>
                    {report.checkedItems.length > 0 ? <p className="muted">Checked: {report.checkedItems.join(", ")}</p> : null}
                    {report.issuesFound.length > 0 ? <p className="muted">Issues: {report.issuesFound.join(", ")}</p> : null}
                  </article>
                ))}
              </div>
              <div className="stack">
                <h3>Acceptance Reports</h3>
                {task.acceptanceReports.length === 0 ? <p className="muted">No acceptance reports yet.</p> : null}
                {task.acceptanceReports.map((report) => (
                  <article className="report-card" key={report.id}>
                    <span className="pill">{report.decision}</span>
                    <strong>{report.summary}</strong>
                    {report.reason ? <p className="muted">{report.reason}</p> : null}
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="panel">
            <h2>Decisions</h2>
            <div className="stack">
              {task.decisions.length === 0 ? <p className="muted">No decisions yet.</p> : null}
              {task.decisions.map((decision) => (
                <article className="report-card" key={decision.id}>
                  <strong>{decision.decision}</strong>
                  <p className="muted">
                    {decision.decidedBy}
                    {decision.source ? ` · ${decision.source}` : ""}
                  </p>
                </article>
              ))}
            </div>
          </section>

          <section className="panel">
            <h2>Artifacts And Lease</h2>
            <div className="context-grid">
              <div className="stack">
                <h3>Artifacts</h3>
                {task.artifacts.length === 0 ? <p className="muted">No artifacts yet.</p> : null}
                {task.artifacts.map((artifact) => (
                  <article className="report-card" key={artifact.id}>
                    <strong>{artifact.type}: {artifact.title}</strong>
                    <pre>{JSON.stringify(artifact.content, null, 2)}</pre>
                    {artifact.url ? <a href={artifact.url}>{artifact.url}</a> : null}
                  </article>
                ))}
              </div>
              <div className="stack">
                <h3>Lease</h3>
                {task.leases.length === 0 ? <p className="muted">No active lease.</p> : null}
                {task.leases.map((lease) => (
                  <article className="report-card" key={lease.id}>
                    <strong>{lease.status}</strong>
                    <p className="muted">by {lease.agentId}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="panel" id="timeline">
            <h2>Timeline</h2>
            <div className="timeline">
              {activity.map((item) => (
                <div className="timeline-item" key={item.id}>
                  <strong>{item.title}</strong>
                  {item.body ? <p className="muted">{item.body}</p> : null}
                  <time dateTime={item.at}>{formatDateTime(item.at)}</time>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="task-action-rail">
          <section className="panel">
            <h2>
              <GitBranch size={16} /> Move Stage
            </h2>
            {nextStatuses.length === 0 ? (
              <p className="muted">No transitions available.</p>
            ) : (
              <form className="form" action={transitionAction}>
                <div className="field">
                  <label htmlFor="toStatus">Move to</label>
                  <select id="toStatus" name="toStatus">
                    {nextStatuses.map((status) => (
                      <option key={status} value={status}>
                        {taskStatusLabels[status]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="reason">Reason</label>
                  <textarea id="reason" name="reason" placeholder="說明推進或退回原因" />
                </div>
                <div className="field">
                  <label htmlFor="requestedChanges">Requested changes</label>
                  <textarea id="requestedChanges" name="requestedChanges" placeholder="每行一項要求修改內容" />
                </div>
                <button className="button primary" type="submit">
                  Update status
                </button>
              </form>
            )}
          </section>

          <section className="panel">
            <h2>
              <MessageSquarePlus size={16} /> Ask Question
            </h2>
            <form className="form" action={addQuestionAction}>
              <div className="field">
                <label htmlFor="question">Question</label>
                <textarea id="question" name="question" placeholder="新增需要釐清的問題" />
              </div>
              <div className="field">
                <label htmlFor="targetRole">Target role</label>
                <select id="targetRole" name="targetRole" defaultValue="">
                  <option value="">none</option>
                  <option value="pm">pm</option>
                  <option value="engineer">engineer</option>
                  <option value="qa">qa</option>
                  <option value="reviewer">reviewer</option>
                  <option value="observer">observer</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="targetAgentId">Target agent id</label>
                <input id="targetAgentId" name="targetAgentId" placeholder="agent-engineer-01" />
              </div>
              <button className="button" type="submit">
                Add question
              </button>
            </form>
          </section>

          <section className="panel">
            <h2>
              <ShieldCheck size={16} /> QA Report
            </h2>
            <form className="form" action={addQaReportAction}>
              <div className="field">
                <label htmlFor="qa-summary">QA summary</label>
                <textarea id="qa-summary" name="summary" placeholder="QA 檢查摘要" />
              </div>
              <div className="field">
                <label htmlFor="qa-recommendation">Recommendation</label>
                <select id="qa-recommendation" name="recommendation" defaultValue="needs_human_review">
                  <option value="pass">pass</option>
                  <option value="fail">fail</option>
                  <option value="needs_human_review">needs_human_review</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="qa-agent">QA agent id</label>
                <input id="qa-agent" name="agentId" placeholder="agent-qa-01" defaultValue={task.currentOwnerRole === "qa" ? task.currentOwnerAgentId ?? "" : ""} />
              </div>
              <div className="field">
                <label htmlFor="checkedItems">Checked items</label>
                <textarea id="checkedItems" name="checkedItems" placeholder="每行一個檢查項目" />
              </div>
              <div className="field">
                <label htmlFor="commandsRun">Commands run</label>
                <textarea id="commandsRun" name="commandsRun" placeholder="npm test" />
              </div>
              <div className="field">
                <label htmlFor="issuesFound">Issues found</label>
                <textarea id="issuesFound" name="issuesFound" placeholder="若 fail，請每行列出一個問題" />
              </div>
              <button className="button" type="submit">
                Add QA report
              </button>
            </form>
          </section>

          <section className="panel">
            <h2>
              <ClipboardCheck size={16} /> Acceptance
            </h2>
            <form className="form" action={addAcceptanceReportAction}>
              <div className="field">
                <label htmlFor="acceptance-summary">Acceptance summary</label>
                <textarea id="acceptance-summary" name="summary" placeholder="PM 驗收摘要" />
              </div>
              <div className="field">
                <label htmlFor="acceptance-decision">Decision</label>
                <select id="acceptance-decision" name="decision" defaultValue="needs_more_qa">
                  <option value="accepted">accepted</option>
                  <option value="rejected">rejected</option>
                  <option value="needs_more_qa">needs_more_qa</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="acceptance-agent">PM agent id</label>
                <input id="acceptance-agent" name="agentId" placeholder="agent-pm-01" />
              </div>
              <div className="field">
                <label htmlFor="acceptance-reason">Reason</label>
                <textarea id="acceptance-reason" name="reason" placeholder="驗收失敗或需要更多 QA 時填寫原因" />
              </div>
              <button className="button" type="submit">
                Add acceptance report
              </button>
            </form>
          </section>

          <section className="panel">
            <h2>Add Decision</h2>
            <form className="form" action={addDecisionAction}>
              <div className="field">
                <label htmlFor="decision">Decision</label>
                <textarea id="decision" name="decision" placeholder="記錄已確認且會影響後續工作的決策" />
              </div>
              <div className="field">
                <label htmlFor="decidedBy">Decided by</label>
                <input id="decidedBy" name="decidedBy" defaultValue="human" />
              </div>
              <div className="field">
                <label htmlFor="source">Source</label>
                <input id="source" name="source" placeholder="user-confirmation" />
              </div>
              <button className="button" type="submit">
                Add decision
              </button>
            </form>
          </section>
        </aside>
      </section>
    </>
  );
}
