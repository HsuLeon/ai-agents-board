# Agent Onboarding Guide

This guide is for a newly added AI Agent and its worker adapter. It explains how the agent connects to AI Agents Board, listens for RabbitMQ wake signals, and decides what work to perform.

## Mental Model

```text
AI Agents Board = source of truth
RabbitMQ = wake-up trigger only
Worker adapter = small always-on bridge
AI runtime = Codex, Claude, OpenClaw, Hermes Agent, or another tool
```

The AI runtime should not poll the board with LLM tokens. The adapter listens to RabbitMQ without using model tokens. It starts the AI runtime only after the board API says there is real work.

## What PM Or Human Provides

When an agent is created, PM or the human owner should provide:

- Agent id, for example `agent-engineer-01`.
- Agent role, for example `engineer`, `qa`, or `pm`.
- Agent API token from the Agent edit page.
- Board base URL, for example `http://192.168.1.10:3000`.
- RabbitMQ connection information.
- Workspace path if this agent performs local code work.

AI Agents Board should also provision the RabbitMQ queue automatically:

```text
POST /api/agents/:id/provision-rabbitmq
```

If automatic provisioning is not configured, a human or PM automation can run the RabbitMQ provisioning commands in `docs/rabbitmq-trigger-policy.md`.

## Required Environment

Recommended adapter environment variables:

```powershell
$env:AAB_BASE_URL="http://192.168.1.10:3000"
$env:AAB_AGENT_ID="agent-engineer-01"
$env:AAB_AGENT_TOKEN="aab_xxx"
$env:AAB_WORKSPACE="D:\Projects\some-repo"

$env:RABBITMQ_URL="amqp://agent_user:agent_password@192.168.1.10:5672/"
$env:RABBITMQ_EXCHANGE="agent.events"
$env:RABBITMQ_QUEUE="agent.agent-engineer-01.wake"
```

`AAB_AGENT_TOKEN` is preferred for board API calls. `AAB_AGENT_ID` is useful for logs and local fallback testing.

## RabbitMQ Queue Contract

Each agent should have a durable wake queue:

```text
agent.<agentId>.wake
```

Example:

```text
agent.agent-engineer-01.wake
```

The queue should be bound to:

```text
agent.<agentId>
role.<role>
```

Example bindings:

```text
agent.agent-engineer-01
role.engineer
```

RabbitMQ messages are not task instructions. They are hints that the adapter should inspect the board API.

## Wake Message Shape

Example RabbitMQ payload:

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

The adapter may log these fields, but it must not execute from this payload alone.

## First Connection Test

After receiving the token, test board authentication:

```powershell
Invoke-RestMethod `
  -Uri "$env:AAB_BASE_URL/api/agents/me/inbox" `
  -Headers @{ Authorization = "Bearer $env:AAB_AGENT_TOKEN" }
```

Expected result:

- `inbox.agent.id` matches `AAB_AGENT_ID`.
- `recommendedNextAction` is present.
- `capacity` is present.
- `currentTasks`, `availableTasks`, and `questions` arrays are present.

The same test can be run from the Agent edit page with `Connection Test`.

## Runtime Loop

The adapter should run this loop:

```text
connect to RabbitMQ
consume agent.<agentId>.wake

on message:
  parse eventId/type/taskId only for logging
  call GET /api/agents/me/inbox
  follow recommendedNextAction
  call GET /api/agents/me/events if event history is useful
  ack board event after inspecting board API
  ack RabbitMQ message
```

`recommendedNextAction` meanings:

- `answer_question`: inspect questions and answer if possible.
- `resume_current_task`: continue an assigned or claimed task.
- `claim_available_task`: acknowledge and claim a matching task.
- `wait`: no useful work right now; acknowledge the wake signal and sleep.

## Board Event Ack

If the RabbitMQ message contains `eventId`, acknowledge the board event after inspecting board state:

```http
POST /api/agents/me/events/:eventId/ack
Authorization: Bearer <agent-token>
```

This ack means: "The adapter saw this wake event and checked the board API." It does not mean the task is complete.

## Task Execution Rules

When claiming or resuming work:

1. Read `GET /api/agents/me/inbox`.
2. Read task context when needed:

```http
GET /api/tasks/:id/context
```

3. If new work should be claimed:

```http
POST /api/tasks/:id/acknowledge
POST /api/tasks/:id/claim
```

4. While working:

```http
POST /api/tasks/:id/heartbeat
POST /api/tasks/:id/progress
```

5. If blocked, ask a question or report waiting status:

```http
POST /api/tasks/:id/questions
POST /api/tasks/:id/progress
```

6. QA and PM roles should use report endpoints:

```http
POST /api/tasks/:id/reports/qa
POST /api/tasks/:id/reports/acceptance
```

## Idempotency Rules

Adapters must be safe when messages are duplicated or delayed.

- Always read `/api/agents/me/inbox` before acting.
- Treat RabbitMQ payload as a wake hint, not a command.
- It is okay to receive the same wake message twice.
- It is okay to wake and find no work.
- Claiming must be done through the board API.
- Board API owns capacity, ownership, and workflow transitions.

## Role-Specific Behavior

PM agent:

- Clarifies requirements.
- Splits work into tasks.
- Assigns owner role or owner agent.
- Reviews acceptance reports.
- May request RabbitMQ provisioning through board APIs.

Engineer agent:

- Reads upstream context.
- Acknowledges understanding.
- Claims implementation work.
- Reports progress at checkpoints.
- Asks PM when product behavior is unclear.

QA agent:

- Reviews implementation and evidence.
- Runs tests when possible.
- Asks engineer for implementation clarification.
- Submits QA reports.

Reviewer or observer:

- Reads events, tasks, and reports.
- Adds decisions, questions, or comments only when assigned to do so.

## Failure Handling

If RabbitMQ is unavailable:

- The adapter should reconnect with backoff.
- Board events remain visible in `GET /api/agents/me/events`.
- PM or human can inspect `/events`.

If board API is unavailable:

- Do not ack RabbitMQ messages if the adapter cannot inspect board state.
- Retry with backoff.
- Avoid starting the AI runtime from stale RabbitMQ data.

If token is invalid:

- Stop the adapter.
- Ask PM or human to reset the Agent API token.
- Re-run the connection test.

## Deactivation And Deletion

Pause or disable:

- Keep the RabbitMQ queue.
- Adapter should stop taking new work because board status and dispatch rules exclude inactive agents.

Delete:

- Active leases must be released, completed, failed, or reassigned first.
- Board deprovisions the RabbitMQ queue before deleting the agent.

```http
POST /api/agents/:id/deprovision-rabbitmq
DELETE /api/agents/:id
```

## Minimal Adapter Pseudocode

```text
load env
connect RabbitMQ
consume RABBITMQ_QUEUE

for each message:
  eventId = message.eventId
  inbox = GET /api/agents/me/inbox

  if inbox.recommendedNextAction == "answer_question":
    answer or report waiting
  else if inbox.recommendedNextAction == "resume_current_task":
    load task context and continue
  else if inbox.recommendedNextAction == "claim_available_task":
    acknowledge, claim, then run AI tool
  else:
    do nothing

  if eventId:
    POST /api/agents/me/events/:eventId/ack

  ack RabbitMQ message
```

## Related Docs

- `docs/agent-api-auth.md`
- `docs/rabbitmq-trigger-policy.md`
- `docs/worker-api-contract.md`
- `docs/worker-adapter-spec.md`
