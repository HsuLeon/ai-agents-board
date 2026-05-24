# RabbitMQ Trigger Policy

RabbitMQ is a wake-up trigger bus for AI Agents Board. It should not be treated as the source of truth for task content, workflow state, ownership, QA decisions, or acceptance results.

For a full new-agent setup checklist, see `docs/agent-onboarding.md`.

## Core Principle

```text
RabbitMQ = wake-up signal
AI Agents Board API = source of truth
Database = durable workflow state
Agent adapter = receiver that wakes the AI tool only when needed
```

RabbitMQ messages should be small and disposable. They exist only to tell an agent adapter that something may need attention. After receiving a message, the adapter must call the board API before deciding what to do.

## Agent Runtime Flow

```text
RabbitMQ wake signal
  -> adapter receives message
  -> adapter calls GET /api/agents/me/inbox
  -> adapter follows recommendedNextAction
  -> adapter calls task context/report/question APIs as needed
  -> adapter acknowledges the RabbitMQ message after it has safely inspected the board state
```

The AI model itself should not spend tokens polling for work. A lightweight adapter should listen to RabbitMQ and only start Codex, Claude, OpenClaw, Hermes Agent, or another AI runtime when the board API says there is real work to perform.

## Payload Rules

Wake messages may include useful hints, but the adapter must not execute from the payload alone.

Recommended payload:

```json
{
  "eventId": "evt-001",
  "type": "task_assigned",
  "agentId": "agent-engineer-01",
  "taskId": "task-004",
  "reason": "task_assigned",
  "createdAt": "2026-05-24T10:00:00.000Z"
}
```

Allowed hints:

- `eventId`
- `type`
- `agentId`
- `role`
- `taskId`
- `questionId`
- `reason`
- `createdAt`

Do not include full requirements, secrets, source code patches, QA reports, or acceptance decisions in the RabbitMQ message. Those must be read from the board API.

## Exchange And Queue Model

Use one topic exchange:

```text
agent.events
```

Use one durable queue per agent:

```text
agent.<agentId>.wake
```

Use routing keys:

```text
agent.<agentId>
role.<role>
```

Examples:

```text
agent.agent-engineer-01
agent.agent-qa-01
role.engineer
role.qa
role.pm
```

In RabbitMQ terminology, a `channel` is a protocol-level communication path inside a connection. It is not the durable inbox for an agent. The durable inbox should be a `queue`.

## Direct Agent Events

When a task or question is assigned to one specific agent, publish to that agent routing key:

```text
routing key = agent.agent-engineer-01
queue       = agent.agent-engineer-01.wake
```

The adapter for that agent receives the wake signal, calls:

```http
GET /api/agents/me/inbox
```

Then it decides whether to resume a task, answer a question, claim work, or wait.

## Role-Based Events

When work is for a role but not yet assigned to a specific agent, publish to a role routing key:

```text
routing key = role.engineer
```

Multiple engineer adapters may wake at the same time. This is acceptable because the board API owns claiming and capacity checks. Only the agent that successfully calls `POST /api/tasks/:id/claim` should proceed.

## Idempotency

Adapters must treat RabbitMQ messages as repeatable hints.

Required behavior:

- Receiving the same wake signal twice must be safe.
- Missing one wake signal must not lose work, because the board API remains the source of truth.
- The adapter should always call `GET /api/agents/me/inbox` after a wake signal.
- If the inbox says `recommendedNextAction = wait`, the adapter should acknowledge the RabbitMQ message and do nothing.
- The adapter should acknowledge the RabbitMQ message only after it has successfully inspected the board API.

## Queue Provisioning

Yes, RabbitMQ can create queues by command. This can be automated when a new AI Agent is created.

AI Agents Board should treat RabbitMQ queue management as part of the Agent lifecycle:

```text
Create / activate agent
  -> provision queue and bindings

Delete agent
  -> verify there are no active task leases
  -> deprovision queue and bindings
  -> delete the agent record

Pause / disable agent
  -> keep the queue
  -> prevent new work through board status and dispatch rules
```

Recommended CLI with the RabbitMQ management plugin:

```powershell
rabbitmqadmin declare exchange name=agent.events type=topic durable=true
rabbitmqadmin declare queue name=agent.agent-engineer-01.wake durable=true
rabbitmqadmin declare binding source=agent.events destination_type=queue destination=agent.agent-engineer-01.wake routing_key=agent.agent-engineer-01
```

Optional role binding for role-level wakeups:

```powershell
rabbitmqadmin declare binding source=agent.events destination_type=queue destination=agent.agent-engineer-01.wake routing_key=role.engineer
```

Equivalent HTTP API approach:

```http
PUT /api/exchanges/%2f/agent.events
PUT /api/queues/%2f/agent.agent-engineer-01.wake
POST /api/bindings/%2f/e/agent.events/q/agent.agent-engineer-01.wake
```

The PM Agent should not need direct shell access to every worker machine. A safer long-term design is to add a board-side provisioning API:

```http
POST /api/agents/:id/provision-rabbitmq
POST /api/agents/:id/deprovision-rabbitmq
DELETE /api/agents/:id
```

The provision endpoint can:

1. Read the agent id and roles from the database.
2. Declare the shared exchange.
3. Declare the agent queue.
4. Bind `agent.<agentId>`.
5. Bind `role.<role>` for each agent role when role wakeups are enabled.
6. Store provisioning status for the Agent Admin UI.

The deprovision endpoint deletes the durable queue:

```powershell
rabbitmqadmin delete queue name=agent.agent-engineer-01.wake
```

RabbitMQ removes bindings for that queue when the queue is deleted.

Agent deletion should be guarded:

- Do not delete an agent with active leases such as `claimed`, `in_progress`, `progress_reported`, `waiting_for_pm`, `waiting_for_engineer`, `waiting_for_human`, `waiting_for_qa`, or `blocked`.
- Release, complete, fail, or reassign active work first.
- Deprovision RabbitMQ before deleting the agent record so orphan queues do not accumulate.

## PM Agent Policy

A PM Agent may request RabbitMQ provisioning or deprovisioning when it creates, activates, disables, or deletes an agent, but it should do so through the board API instead of manually editing RabbitMQ whenever possible.

Recommended PM flow:

```text
Create agent in AI Agents Board
  -> reset/generate agent API token
  -> call board-side RabbitMQ provisioning API
  -> show adapter setup instructions
  -> run connection test
```

Recommended PM deletion flow:

```text
Inspect agent workload
  -> if active leases exist, ask workers/PM to release or reassign work
  -> call board-side RabbitMQ deprovisioning API
  -> delete agent
  -> confirm Agent Admin no longer lists the agent
```

Until the provisioning API exists, a human or trusted PM automation can run the `rabbitmqadmin` commands above on the RabbitMQ host.

## Future Implementation Notes

Keep RabbitMQ behind a small service boundary:

```text
emitAgentEvent(...)
  -> write AgentEvent/outbox row
  -> publish wake signal to RabbitMQ
```

This keeps workflow logic independent from RabbitMQ. If RabbitMQ is temporarily down, the outbox can preserve the event and retry publishing later.

Implemented MVP event surfaces:

```http
GET /api/agent-events
GET /api/agents/me/events
POST /api/agents/me/events/:eventId/ack
```

Event-producing situations:

- Task dispatch creates `task_assigned` or `task_queued`.
- Task transition creates `task_transitioned` for the current owner agent or role.
- Creating a question creates `question_created` for the target agent or role.
- Answering a question creates `question_answered` for the asking agent when available.

RabbitMQ publish status is stored per event:

- `pending`: event was created and not yet finalized.
- `published`: wake signal was sent to RabbitMQ.
- `skipped`: RabbitMQ is not configured or no routing key exists.
- `failed`: RabbitMQ publish failed; the DB event remains available for inspection or retry.
