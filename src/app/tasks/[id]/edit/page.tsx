import { notFound, redirect } from "next/navigation";
import { getTask, listAgents, updateTask } from "@/lib/db";
import { lines, optionalString } from "@/lib/form-utils";
import type { AgentRole } from "@/lib/types";

export const dynamic = "force-dynamic";

const roles: Array<AgentRole | ""> = ["", "pm", "engineer", "qa", "reviewer", "observer"];

export default async function EditTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [task, agents] = await Promise.all([getTask(id), listAgents()]);
  if (!task) {
    notFound();
  }

  async function updateTaskAction(formData: FormData) {
    "use server";

    await updateTask({
      id,
      title: String(formData.get("title") ?? "").trim(),
      priority: Number(formData.get("priority") ?? 50),
      currentOwnerAgentId: optionalString(formData.get("currentOwnerAgentId")),
      currentOwnerRole: optionalString(formData.get("currentOwnerRole")) as AgentRole | undefined,
      goal: String(formData.get("goal") ?? "").trim(),
      background: String(formData.get("background") ?? "").trim(),
      requirements: lines(formData.get("requirements")),
      constraints: lines(formData.get("constraints")),
      handoffNotes: lines(formData.get("handoffNotes"))
    });

    redirect(`/tasks/${id}`);
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <h1>Edit Task</h1>
          <p>{task.title}</p>
        </div>
      </section>

      <section className="panel">
        <form className="form" action={updateTaskAction}>
          <div className="field">
            <label htmlFor="title">Title</label>
            <input id="title" name="title" required defaultValue={task.title} />
          </div>

          <div className="grid-two">
            <div className="field">
              <label htmlFor="priority">Priority</label>
              <input id="priority" name="priority" type="number" min="0" max="100" defaultValue={task.priority} />
            </div>
            <div className="field">
              <label htmlFor="currentOwnerRole">Owner role</label>
              <select id="currentOwnerRole" name="currentOwnerRole" defaultValue={task.currentOwnerRole ?? ""}>
                {roles.map((role) => (
                  <option key={role || "none"} value={role}>
                    {role || "None"}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label htmlFor="currentOwnerAgentId">Owner agent</label>
            <select id="currentOwnerAgentId" name="currentOwnerAgentId" defaultValue={task.currentOwnerAgentId ?? ""}>
              <option value="">None</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="goal">Goal</label>
            <textarea id="goal" name="goal" required defaultValue={task.context.goal} />
          </div>

          <div className="field">
            <label htmlFor="background">Background</label>
            <textarea id="background" name="background" defaultValue={task.context.background} />
          </div>

          <div className="grid-two">
            <div className="field">
              <label htmlFor="requirements">Requirements</label>
              <textarea id="requirements" name="requirements" defaultValue={task.context.requirements.join("\n")} />
            </div>
            <div className="field">
              <label htmlFor="constraints">Constraints</label>
              <textarea id="constraints" name="constraints" defaultValue={task.context.constraints.join("\n")} />
            </div>
          </div>

          <div className="field">
            <label htmlFor="handoffNotes">Handoff notes</label>
            <textarea id="handoffNotes" name="handoffNotes" defaultValue={task.context.handoffNotes.join("\n")} />
          </div>

          <div className="actions">
            <button className="button primary" type="submit">
              Save task
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
