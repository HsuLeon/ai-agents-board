import type { Agent } from "./types";

type RabbitMqResult = {
  status: "provisioned" | "deprovisioned" | "published" | "skipped";
  queueName: string;
  exchangeName: string;
  bindings: string[];
  message: string;
};

const exchangeName = process.env.RABBITMQ_AGENT_EXCHANGE || "agent.events";
const managementUrl = process.env.RABBITMQ_MANAGEMENT_URL;
const username = process.env.RABBITMQ_USERNAME;
const password = process.env.RABBITMQ_PASSWORD;
const vhost = process.env.RABBITMQ_VHOST || "/";
const bindRoles = process.env.RABBITMQ_BIND_ROLE_WAKEUPS !== "false";

function encodedVhost() {
  return encodeURIComponent(vhost);
}

export function agentWakeQueueName(agentId: string) {
  return `agent.${agentId}.wake`;
}

function agentRoutingKey(agentId: string) {
  return `agent.${agentId}`;
}

function roleRoutingKey(role: string) {
  return `role.${role}`;
}

function getRabbitMqConfig() {
  if (!managementUrl || !username || !password) {
    return undefined;
  }

  return {
    baseUrl: managementUrl.replace(/\/$/, ""),
    authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`
  };
}

async function rabbitMqRequest(path: string, init: RequestInit) {
  const config = getRabbitMqConfig();
  if (!config) {
    throw new Error("RabbitMQ management API is not configured.");
  }

  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: config.authorization,
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`RabbitMQ request failed (${response.status}): ${body || response.statusText}`);
  }
}

function skippedResult(agent: Agent, action: "provision" | "deprovision"): RabbitMqResult {
  const queueName = agentWakeQueueName(agent.id);
  return {
    status: "skipped",
    queueName,
    exchangeName,
    bindings: [],
    message: `RabbitMQ ${action} skipped because RABBITMQ_MANAGEMENT_URL, RABBITMQ_USERNAME, or RABBITMQ_PASSWORD is not configured.`
  };
}

export async function provisionRabbitMqForAgent(agent: Agent): Promise<RabbitMqResult> {
  const config = getRabbitMqConfig();
  if (!config) {
    return skippedResult(agent, "provision");
  }

  const queueName = agentWakeQueueName(agent.id);
  const bindings = [agentRoutingKey(agent.id), ...(bindRoles ? agent.roles.map(roleRoutingKey) : [])];
  const vhostPath = encodedVhost();

  await rabbitMqRequest(`/api/exchanges/${vhostPath}/${encodeURIComponent(exchangeName)}`, {
    method: "PUT",
    body: JSON.stringify({ type: "topic", durable: true, auto_delete: false, arguments: {} })
  });
  await rabbitMqRequest(`/api/queues/${vhostPath}/${encodeURIComponent(queueName)}`, {
    method: "PUT",
    body: JSON.stringify({ durable: true, auto_delete: false, arguments: {} })
  });

  for (const routingKey of bindings) {
    await rabbitMqRequest(
      `/api/bindings/${vhostPath}/e/${encodeURIComponent(exchangeName)}/q/${encodeURIComponent(queueName)}`,
      {
        method: "POST",
        body: JSON.stringify({ routing_key: routingKey, arguments: {} })
      }
    );
  }

  return {
    status: "provisioned",
    queueName,
    exchangeName,
    bindings,
    message: `RabbitMQ queue ${queueName} is provisioned.`
  };
}

export async function deprovisionRabbitMqForAgent(agent: Agent): Promise<RabbitMqResult> {
  const config = getRabbitMqConfig();
  if (!config) {
    return skippedResult(agent, "deprovision");
  }

  const queueName = agentWakeQueueName(agent.id);
  await rabbitMqRequest(`/api/queues/${encodedVhost()}/${encodeURIComponent(queueName)}`, {
    method: "DELETE"
  });

  return {
    status: "deprovisioned",
    queueName,
    exchangeName,
    bindings: [],
    message: `RabbitMQ queue ${queueName} is deleted.`
  };
}

export async function publishRabbitMqWakeSignal(params: {
  routingKey: string;
  payload: unknown;
}): Promise<Pick<RabbitMqResult, "status" | "exchangeName" | "message"> & { routingKey: string }> {
  const config = getRabbitMqConfig();
  if (!config) {
    return {
      status: "skipped",
      exchangeName,
      routingKey: params.routingKey,
      message:
        "RabbitMQ publish skipped because RABBITMQ_MANAGEMENT_URL, RABBITMQ_USERNAME, or RABBITMQ_PASSWORD is not configured."
    };
  }

  await rabbitMqRequest(`/api/exchanges/${encodedVhost()}/${encodeURIComponent(exchangeName)}/publish`, {
    method: "POST",
    body: JSON.stringify({
      properties: {
        delivery_mode: 2,
        content_type: "application/json"
      },
      routing_key: params.routingKey,
      payload: JSON.stringify(params.payload),
      payload_encoding: "string"
    })
  });

  return {
    status: "published",
    exchangeName,
    routingKey: params.routingKey,
    message: `Wake signal published to ${params.routingKey}.`
  };
}

export function routingKeyForAgentEvent(params: { targetAgentId?: string; targetRole?: string }) {
  if (params.targetAgentId) {
    return agentRoutingKey(params.targetAgentId);
  }

  if (params.targetRole) {
    return roleRoutingKey(params.targetRole);
  }

  return undefined;
}
