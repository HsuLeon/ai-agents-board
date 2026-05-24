import Link from "next/link";
import { Bot, PauseCircle, Plus, UserRoundCheck } from "lucide-react";
import { listAgents, listTasks } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const [agents, tasks] = await Promise.all([listAgents(), listTasks()]);

  return (
    <>
      <section className="page-heading">
        <div>
          <h1>Agent Admin</h1>
          <p>Manage agent providers, roles, capabilities, status, and workload limits.</p>
        </div>
        <Link className="button primary" href="/agents/new">
          <Plus size={16} />
          New agent
        </Link>
      </section>

      <section className="agent-list">
        {agents.map((agent) => {
          const ownedTasks = tasks.filter((task) => task.currentOwnerAgentId === agent.id);
          const Icon = agent.status === "active" ? UserRoundCheck : agent.status === "paused" ? PauseCircle : Bot;

          return (
            <article className="agent-row" key={agent.id}>
              <div>
                <h2>{agent.name}</h2>
                <p className="muted">{agent.provider}</p>
              </div>
              <div className="stack">
                <div className="inline-list">
                  {agent.roles.map((role) => (
                    <span className="pill" key={role}>
                      {role}
                    </span>
                  ))}
                </div>
                <div className="inline-list">
                  {agent.capabilities.map((capability) => (
                    <span className="pill" key={capability}>
                      {capability}
                    </span>
                  ))}
                </div>
              </div>
              <div className="stack">
                <span className="inline-list">
                  <Icon size={16} />
                  {agent.status}
                </span>
                <span className="muted">{agent.hasApiToken ? "API token enabled" : "No API token"}</span>
                {agent.tokenLastUsedAt ? <span className="muted">Used {agent.tokenLastUsedAt}</span> : null}
                <span className="muted">{ownedTasks.length} active task</span>
                <Link className="button" href={`/agents/${agent.id}/edit`}>
                  Edit / connect
                </Link>
              </div>
            </article>
          );
        })}
      </section>
    </>
  );
}
