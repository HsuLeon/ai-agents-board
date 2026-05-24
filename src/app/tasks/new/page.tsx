import { redirect } from "next/navigation";
import { createTask, listAgents } from "@/lib/db";
import { lines, optionalString } from "@/lib/form-utils";
import { taskStatusLabels } from "@/lib/workflow";
import type { AgentRole, TaskStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const statuses: TaskStatus[] = ["planning", "discussion", "development", "qa", "acceptance", "blocked"];
const roles: Array<AgentRole | ""> = ["", "pm", "engineer", "qa", "reviewer", "observer"];

async function createTaskAction(formData: FormData) {
  "use server";

  const ownerAgentId = optionalString(formData.get("currentOwnerAgentId"));
  const ownerRole = optionalString(formData.get("currentOwnerRole")) as AgentRole | undefined;

  const task = await createTask({
    title: String(formData.get("title") ?? "").trim(),
    status: String(formData.get("status") ?? "planning") as TaskStatus,
    priority: Number(formData.get("priority") ?? 50),
    currentOwnerAgentId: ownerAgentId,
    currentOwnerRole: ownerRole,
    goal: String(formData.get("goal") ?? "").trim(),
    background: String(formData.get("background") ?? "").trim(),
    requirements: lines(formData.get("requirements")),
    constraints: lines(formData.get("constraints")),
    handoffNotes: lines(formData.get("handoffNotes")),
    acceptanceCriteria: lines(formData.get("acceptanceCriteria"))
  });

  redirect(`/tasks/${task.id}`);
}

export default async function NewTaskPage() {
  const agents = await listAgents();

  return (
    <>
      <section className="page-heading">
        <div>
          <h1>New Task</h1>
          <p>建立一個具備上下文、驗收標準與負責角色的細節工項。</p>
        </div>
      </section>

      <section className="panel">
        <form className="form" action={createTaskAction}>
          <div className="field">
            <label htmlFor="title">Title</label>
            <input id="title" name="title" required placeholder="建立登入 API" />
          </div>

          <div className="grid-two">
            <div className="field">
              <label htmlFor="status">Status</label>
              <select id="status" name="status" defaultValue="planning">
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {taskStatusLabels[status]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="priority">Priority</label>
              <input id="priority" name="priority" type="number" min="0" max="100" defaultValue="50" />
            </div>
          </div>

          <div className="grid-two">
            <div className="field">
              <label htmlFor="currentOwnerRole">Owner role</label>
              <select id="currentOwnerRole" name="currentOwnerRole" defaultValue="">
                {roles.map((role) => (
                  <option key={role || "none"} value={role}>
                    {role || "None"}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="currentOwnerAgentId">Owner agent</label>
              <select id="currentOwnerAgentId" name="currentOwnerAgentId" defaultValue="">
                <option value="">None</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label htmlFor="goal">Goal</label>
            <textarea id="goal" name="goal" required placeholder="這個工項要達成的結果" />
          </div>

          <div className="field">
            <label htmlFor="background">Background</label>
            <textarea id="background" name="background" placeholder="為什麼要做這件事、上游脈絡是什麼" />
          </div>

          <div className="grid-two">
            <div className="field">
              <label htmlFor="requirements">Requirements</label>
              <textarea id="requirements" name="requirements" placeholder={"每行一個需求\n支援 email/password 登入"} />
            </div>
            <div className="field">
              <label htmlFor="acceptanceCriteria">Acceptance criteria</label>
              <textarea id="acceptanceCriteria" name="acceptanceCriteria" placeholder={"每行一個驗收標準\n密碼錯誤時回傳 401"} />
            </div>
          </div>

          <div className="grid-two">
            <div className="field">
              <label htmlFor="constraints">Constraints</label>
              <textarea id="constraints" name="constraints" placeholder="每行一個限制" />
            </div>
            <div className="field">
              <label htmlFor="handoffNotes">Handoff notes</label>
              <textarea id="handoffNotes" name="handoffNotes" placeholder="交接給下一棒 Agent 的注意事項" />
            </div>
          </div>

          <div className="actions">
            <button className="button primary" type="submit">
              Create task
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
