import { redirect } from "next/navigation";
import { createAgent } from "@/lib/db";
import { checkedValues, lines, optionalString } from "@/lib/form-utils";
import { provisionRabbitMqForAgent } from "@/lib/rabbitmq";
import type { AgentProvider, AgentRole, AgentStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const providers: AgentProvider[] = ["codex", "claude", "openclaw", "manual", "other"];
const statuses: AgentStatus[] = ["active", "paused", "disabled"];
const roles: AgentRole[] = ["pm", "engineer", "qa", "reviewer", "observer"];

async function createAgentAction(formData: FormData) {
  "use server";

  const selectedRoles = checkedValues(formData, "roles") as AgentRole[];
  const agent = await createAgent({
    name: String(formData.get("name") ?? "").trim(),
    provider: String(formData.get("provider") ?? "other") as AgentProvider,
    status: String(formData.get("status") ?? "active") as AgentStatus,
    roles: selectedRoles.length > 0 ? selectedRoles : ["observer"],
    capabilities: lines(formData.get("capabilities")),
    maxConcurrentTasks: Number(formData.get("maxConcurrentTasks") ?? 1),
    notes: optionalString(formData.get("notes"))
  });

  let target = `/agents/${agent.id}/edit`;
  try {
    const rabbitmq = await provisionRabbitMqForAgent(agent);
    target = `/agents/${agent.id}/edit?rabbitmqStatus=${encodeURIComponent(rabbitmq.status)}&rabbitmqMessage=${encodeURIComponent(rabbitmq.message)}`;
  } catch (error) {
    target = `/agents/${agent.id}/edit?error=${encodeURIComponent(error instanceof Error ? error.message : "RabbitMQ provisioning failed")}`;
  }

  redirect(target);
}

export default function NewAgentPage() {
  return (
    <>
      <section className="page-heading">
        <div>
          <h1>New Agent</h1>
          <p>Create an agent profile with provider, roles, capabilities, and workload limits.</p>
        </div>
      </section>

      <section className="panel">
        <form className="form" action={createAgentAction}>
          <div className="field">
            <label htmlFor="name">Name</label>
            <input id="name" name="name" required placeholder="Codex Engineer" />
          </div>

          <div className="grid-two">
            <div className="field">
              <label htmlFor="provider">Provider</label>
              <select id="provider" name="provider" defaultValue="codex">
                {providers.map((provider) => (
                  <option key={provider} value={provider}>
                    {provider}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="status">Status</label>
              <select id="status" name="status" defaultValue="active">
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <span className="field-label">Roles</span>
            <div className="checkbox-grid">
              {roles.map((role) => (
                <label key={role}>
                  <input name="roles" type="checkbox" value={role} defaultChecked={role === "engineer"} />
                  {role}
                </label>
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="capabilities">Capabilities</label>
            <textarea id="capabilities" name="capabilities" placeholder={"typescript\nreact\napi\ntests"} />
          </div>

          <div className="field">
            <label htmlFor="maxConcurrentTasks">Max concurrent tasks</label>
            <input id="maxConcurrentTasks" name="maxConcurrentTasks" type="number" min="1" defaultValue="1" />
          </div>

          <div className="field">
            <label htmlFor="notes">Notes</label>
            <textarea id="notes" name="notes" placeholder="How this agent should be used." />
          </div>

          <div className="actions">
            <button className="button primary" type="submit">
              Create agent
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
