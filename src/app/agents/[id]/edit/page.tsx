import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { BookOpenCheck, KeyRound, PlugZap, SquareTerminal } from "lucide-react";
import { AgentConnectionTest } from "@/components/agent-connection-test";
import { deleteAgent, getAgent, getAgentDeletionBlockers, resetAgentToken, updateAgent } from "@/lib/db";
import { checkedValues, lines, optionalString } from "@/lib/form-utils";
import { agentWakeQueueName, deprovisionRabbitMqForAgent, provisionRabbitMqForAgent } from "@/lib/rabbitmq";
import type { AgentProvider, AgentRole, AgentStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const providers: AgentProvider[] = ["codex", "claude", "openclaw", "manual", "other"];
const statuses: AgentStatus[] = ["active", "paused", "disabled"];
const roles: AgentRole[] = ["pm", "engineer", "qa", "reviewer", "observer"];

export default async function EditAgentPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string; rabbitmqStatus?: string; rabbitmqMessage?: string; error?: string }>;
}) {
  const { id } = await params;
  const { token, rabbitmqStatus, rabbitmqMessage, error } = await searchParams;
  const agent = await getAgent(id);
  if (!agent) {
    notFound();
  }
  const deletionBlockers = await getAgentDeletionBlockers(id);
  const apiBaseUrl = process.env.NEXT_PUBLIC_AAB_BASE_URL ?? "http://localhost:3000";
  const rabbitMqQueueName = agentWakeQueueName(agent.id);
  const tokenPlaceholder = token ?? "<agent-token>";
  const envExample = `AAB_BASE_URL=${apiBaseUrl}
AAB_AGENT_ID=${agent.id}
AAB_AGENT_TOKEN=${tokenPlaceholder}`;
  const powershellExample = `$env:AAB_BASE_URL="${apiBaseUrl}"
$env:AAB_AGENT_ID="${agent.id}"
$env:AAB_AGENT_TOKEN="${tokenPlaceholder}"`;
  const inboxCurlExample = `curl ${apiBaseUrl}/api/agents/me/inbox \\
  -H "Authorization: Bearer ${tokenPlaceholder}"`;
  const inboxPowerShellExample = `Invoke-RestMethod \`
  -Uri "${apiBaseUrl}/api/agents/me/inbox" \`
  -Headers @{ Authorization = "Bearer ${tokenPlaceholder}" }`;

  async function updateAgentAction(formData: FormData) {
    "use server";

    const selectedRoles = checkedValues(formData, "roles") as AgentRole[];
    await updateAgent(id, {
      name: String(formData.get("name") ?? "").trim(),
      provider: String(formData.get("provider") ?? "other") as AgentProvider,
      status: String(formData.get("status") ?? "active") as AgentStatus,
      roles: selectedRoles.length > 0 ? selectedRoles : ["observer"],
      capabilities: lines(formData.get("capabilities")),
      maxConcurrentTasks: Number(formData.get("maxConcurrentTasks") ?? 1),
      notes: optionalString(formData.get("notes"))
    });

    redirect("/agents");
  }

  async function resetTokenAction() {
    "use server";

    const newToken = await resetAgentToken(id);
    redirect(`/agents/${id}/edit?token=${encodeURIComponent(newToken)}`);
  }

  async function provisionRabbitMqAction() {
    "use server";

    const currentAgent = await getAgent(id);
    if (!currentAgent) {
      redirect("/agents");
    }

    let target = `/agents/${id}/edit`;
    try {
      const result = await provisionRabbitMqForAgent(currentAgent);
      target = `/agents/${id}/edit?rabbitmqStatus=${encodeURIComponent(result.status)}&rabbitmqMessage=${encodeURIComponent(result.message)}`;
    } catch (provisionError) {
      target = `/agents/${id}/edit?error=${encodeURIComponent(provisionError instanceof Error ? provisionError.message : "RabbitMQ provisioning failed")}`;
    }

    redirect(target);
  }

  async function deprovisionRabbitMqAction() {
    "use server";

    const currentAgent = await getAgent(id);
    if (!currentAgent) {
      redirect("/agents");
    }

    let target = `/agents/${id}/edit`;
    try {
      const result = await deprovisionRabbitMqForAgent(currentAgent);
      target = `/agents/${id}/edit?rabbitmqStatus=${encodeURIComponent(result.status)}&rabbitmqMessage=${encodeURIComponent(result.message)}`;
    } catch (deprovisionError) {
      target = `/agents/${id}/edit?error=${encodeURIComponent(deprovisionError instanceof Error ? deprovisionError.message : "RabbitMQ deprovisioning failed")}`;
    }

    redirect(target);
  }

  async function deleteAgentAction(formData: FormData) {
    "use server";

    if (String(formData.get("confirmDelete") ?? "").trim() !== id) {
      redirect(`/agents/${id}/edit?error=${encodeURIComponent("Type the agent id to confirm deletion.")}`);
    }

    const currentAgent = await getAgent(id);
    if (!currentAgent) {
      redirect("/agents");
    }

    let target = "/agents";
    try {
      await deprovisionRabbitMqForAgent(currentAgent);
      await deleteAgent(id);
    } catch (deleteError) {
      target = `/agents/${id}/edit?error=${encodeURIComponent(deleteError instanceof Error ? deleteError.message : "Delete agent failed")}`;
    }

    redirect(target);
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <h1>Edit Agent</h1>
          <p>{agent.name}</p>
        </div>
      </section>

      <section className="grid-two">
        <div className="panel">
          <form className="form" action={updateAgentAction}>
            <div className="field">
              <label htmlFor="name">Name</label>
              <input id="name" name="name" required defaultValue={agent.name} />
            </div>

            <div className="grid-two">
              <div className="field">
                <label htmlFor="provider">Provider</label>
                <select id="provider" name="provider" defaultValue={agent.provider}>
                  {providers.map((provider) => (
                    <option key={provider} value={provider}>
                      {provider}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="status">Status</label>
                <select id="status" name="status" defaultValue={agent.status}>
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
                    <input name="roles" type="checkbox" value={role} defaultChecked={agent.roles.includes(role)} />
                    {role}
                  </label>
                ))}
              </div>
            </div>

            <div className="field">
              <label htmlFor="capabilities">Capabilities</label>
              <textarea id="capabilities" name="capabilities" defaultValue={agent.capabilities.join("\n")} />
            </div>

            <div className="field">
              <label htmlFor="maxConcurrentTasks">Max concurrent tasks</label>
              <input
                id="maxConcurrentTasks"
                name="maxConcurrentTasks"
                type="number"
                min="1"
                defaultValue={agent.maxConcurrentTasks}
              />
            </div>

            <div className="field">
              <label htmlFor="notes">Notes</label>
              <textarea id="notes" name="notes" defaultValue={agent.notes ?? ""} />
            </div>

            <div className="actions">
              <button className="button primary" type="submit">
                Save agent
              </button>
            </div>
          </form>
        </div>

        <aside className="stack">
          {error ? <div className="connection-result connection-result-error">{error}</div> : null}
          {rabbitmqStatus ? (
            <div className="connection-result connection-result-ok">
              <strong>RabbitMQ {rabbitmqStatus}</strong>
              <p>{rabbitmqMessage}</p>
            </div>
          ) : null}

          <section className="panel stack">
            <h2>
              <KeyRound size={16} /> API Token
            </h2>
            <p className="muted">
              Worker APIs accept <code>Authorization: Bearer token</code>. The token is only shown once after reset.
            </p>
            <div className="inline-list">
              <span className="pill">{agent.hasApiToken ? "token enabled" : "no token"}</span>
              {agent.tokenLastUsedAt ? <span className="pill">last used {agent.tokenLastUsedAt}</span> : null}
            </div>
            {token ? (
              <div className="field">
                <label htmlFor="api-token">New token</label>
                <textarea id="api-token" readOnly value={token} />
              </div>
            ) : (
              <p className="muted">Reset the token to generate a one-time plaintext token for this agent.</p>
            )}
            <form action={resetTokenAction}>
              <button className="button danger" type="submit">
                Reset API token
              </button>
            </form>
          </section>

          <section className="panel stack">
            <h2>
              <PlugZap size={16} /> Connection Setup
            </h2>
            <div className="connection-grid">
              <div>
                <span className="muted">Agent ID</span>
                <strong>{agent.id}</strong>
              </div>
              <div>
                <span className="muted">API base URL</span>
                <strong>{apiBaseUrl}</strong>
              </div>
            </div>
            <div className="inline-list">
              {agent.roles.map((role) => (
                <span className="pill" key={role}>
                  {role}
                </span>
              ))}
              {agent.capabilities.map((capability) => (
                <span className="pill" key={capability}>
                  {capability}
                </span>
              ))}
            </div>

            <div>
              <strong>.env</strong>
              <pre>{envExample}</pre>
            </div>
            <div>
              <strong>PowerShell</strong>
              <pre>{powershellExample}</pre>
            </div>
            <div>
              <strong>Inbox API</strong>
              <pre>{inboxCurlExample}</pre>
              <pre>{inboxPowerShellExample}</pre>
            </div>
          </section>

          <AgentConnectionTest agentId={agent.id} initialToken={token} />

          <section className="panel stack">
            <h2>
              <PlugZap size={16} /> RabbitMQ Queue
            </h2>
            <p className="muted">
              RabbitMQ is used only as a wake-up trigger. The adapter must read <code>/api/agents/me/inbox</code> after
              receiving a wake signal.
            </p>
            <div className="connection-grid">
              <div>
                <span className="muted">Queue</span>
                <strong>{rabbitMqQueueName}</strong>
              </div>
              <div>
                <span className="muted">Routing key</span>
                <strong>agent.{agent.id}</strong>
              </div>
            </div>
            <div className="actions">
              <form action={provisionRabbitMqAction}>
                <button className="button" type="submit">
                  Provision queue
                </button>
              </form>
              <form action={deprovisionRabbitMqAction}>
                <button className="button danger" type="submit">
                  Deprovision queue
                </button>
              </form>
            </div>
          </section>

          <section className="panel stack">
            <h2>
              <SquareTerminal size={16} /> Try It
            </h2>
            <div className="actions">
              <Link className="button" href="/worker">
                Worker inbox
              </Link>
              <Link className="button" href="/api-docs">
                <BookOpenCheck size={16} />
                API Docs
              </Link>
            </div>
          </section>

          <section className="panel stack">
            <h2>Delete Agent</h2>
            <p className="muted">
              Delete will deprovision this agent's RabbitMQ queue first. Agents with active task leases cannot be deleted.
            </p>
            {deletionBlockers.length > 0 ? (
              <div className="connection-result connection-result-error">
                <strong>Deletion blocked</strong>
                <p>{deletionBlockers.length} active task lease(s) must be released or reassigned first.</p>
              </div>
            ) : null}
            <form className="form" action={deleteAgentAction}>
              <label className="field" htmlFor="confirmDelete">
                <span>Type agent id to confirm</span>
                <input id="confirmDelete" name="confirmDelete" placeholder={agent.id} />
              </label>
              <button className="button danger" type="submit" disabled={deletionBlockers.length > 0}>
                Delete agent and queue
              </button>
            </form>
          </section>
        </aside>
      </section>
    </>
  );
}
