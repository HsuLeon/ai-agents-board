const json = (schema: unknown, example?: unknown) => ({
  content: {
    "application/json": {
      schema,
      ...(example === undefined ? {} : { example })
    }
  }
});

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

const taskIdParam = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string" },
  example: "task-002"
};

const agentIdParam = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string" },
  example: "agent-engineer-01"
};

const questionIdParam = {
  name: "questionId",
  in: "path",
  required: true,
  schema: { type: "string" },
  example: "q-001"
};

const eventIdParam = {
  name: "eventId",
  in: "path",
  required: true,
  schema: { type: "string" },
  example: "evt-001"
};

const errorResponse = {
  description: "Request failed.",
  ...json(ref("ErrorResponse"), { error: "Validation failed" })
};

export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "AI Agents Board Agent API",
    version: "0.1.0",
    description:
      "Swagger/OpenAPI contract for Codex, Claude, OpenClaw, QA, PM, and other worker adapters integrating with AI Agents Board."
  },
  servers: [
    {
      url: "http://localhost:3000",
      description: "Local development server"
    },
    {
      url: "http://192.168.50.120:3000",
      description: "LAN example. Replace with the host running the board."
    }
  ],
  tags: [
    { name: "Agent Admin", description: "Create, inspect, delete, and provision agent integrations." },
    { name: "Agent Identity", description: "Authenticate an agent and inspect its work queues." },
    { name: "Agent Events", description: "RabbitMQ wake event outbox and agent-visible delivery acknowledgements." },
    { name: "Tasks", description: "Read task state and task context." },
    { name: "Worker Loop", description: "Acknowledge, claim, heartbeat, progress, and release work." },
    { name: "Questions", description: "Role-directed clarification flow between PM, Engineer, QA, and human." },
    { name: "Reports", description: "QA and PM acceptance reports that can move workflow stages." },
    { name: "Automation", description: "Orchestrator and watchdog maintenance endpoints." }
  ],
  paths: {
    "/api/agents": {
      get: {
        tags: ["Agent Admin"],
        summary: "List agents",
        responses: {
          "200": {
            description: "All agents.",
            ...json({ type: "object", properties: { agents: { type: "array", items: ref("Agent") } } })
          }
        }
      },
      post: {
        tags: ["Agent Admin"],
        summary: "Create agent and provision RabbitMQ queue",
        description:
          "Creates an agent profile. If RabbitMQ management settings are configured, also provisions the agent wake queue and bindings.",
        requestBody: json(ref("CreateAgentRequest"), {
          name: "Codex Engineer",
          provider: "codex",
          status: "active",
          roles: ["engineer"],
          capabilities: ["typescript", "api"],
          maxConcurrentTasks: 1
        }),
        responses: {
          "201": {
            description: "Agent created.",
            ...json(
              { type: "object", properties: { agent: ref("Agent"), rabbitmq: ref("RabbitMqProvisioningResult") } },
              {
                agent: { id: "agent-engineer-01", name: "Codex Engineer", provider: "codex", status: "active" },
                rabbitmq: {
                  status: "provisioned",
                  queueName: "agent.agent-engineer-01.wake",
                  exchangeName: "agent.events",
                  bindings: ["agent.agent-engineer-01", "role.engineer"]
                }
              }
            )
          },
          "400": errorResponse
        }
      }
    },
    "/api/agents/{id}": {
      get: {
        tags: ["Agent Admin"],
        summary: "Get agent and deletion blockers",
        parameters: [agentIdParam],
        responses: {
          "200": {
            description: "Agent and delete guard details.",
            ...json({ type: "object", properties: { agent: ref("Agent"), deletionBlockers: { type: "array", items: ref("DeletionBlocker") } } })
          },
          "404": errorResponse
        }
      },
      delete: {
        tags: ["Agent Admin"],
        summary: "Delete agent and deprovision RabbitMQ queue",
        description:
          "Deletes the agent only when it has no active task leases. The agent RabbitMQ wake queue is deprovisioned before deletion.",
        parameters: [agentIdParam],
        responses: {
          "200": {
            description: "Agent deleted.",
            ...json({ type: "object", properties: { deleted: { type: "boolean" }, rabbitmq: ref("RabbitMqProvisioningResult") } })
          },
          "409": {
            description: "Agent has active task leases.",
            ...json({ type: "object", properties: { error: { type: "string" }, deletionBlockers: { type: "array", items: ref("DeletionBlocker") } } })
          },
          "404": errorResponse
        }
      }
    },
    "/api/agents/{id}/provision-rabbitmq": {
      post: {
        tags: ["Agent Admin"],
        summary: "Provision agent RabbitMQ wake queue",
        description: "Declares the shared topic exchange, durable per-agent queue, direct agent binding, and role bindings.",
        parameters: [agentIdParam],
        responses: {
          "200": { description: "Provision result.", ...json({ type: "object", properties: { rabbitmq: ref("RabbitMqProvisioningResult") } }) },
          "404": errorResponse,
          "502": errorResponse
        }
      }
    },
    "/api/agents/{id}/deprovision-rabbitmq": {
      post: {
        tags: ["Agent Admin"],
        summary: "Deprovision agent RabbitMQ wake queue",
        description: "Deletes the durable per-agent wake queue. RabbitMQ removes its bindings when the queue is deleted.",
        parameters: [agentIdParam],
        responses: {
          "200": { description: "Deprovision result.", ...json({ type: "object", properties: { rabbitmq: ref("RabbitMqProvisioningResult") } }) },
          "404": errorResponse,
          "502": errorResponse
        }
      }
    },
    "/api/agents/me": {
      get: {
        tags: ["Agent Identity"],
        summary: "Get authenticated agent",
        description: "Returns the agent matched by bearer token or local X-Agent-Id fallback.",
        security: [{ bearerAuth: [] }, { agentIdHeader: [] }],
        responses: {
          "200": {
            description: "Authenticated agent.",
            ...json({ type: "object", properties: { agent: ref("Agent") } }, { agent: { id: "agent-engineer-01", name: "Codex Engineer", provider: "codex", status: "active", roles: ["engineer"], capabilities: ["typescript", "api"], maxConcurrentTasks: 1, hasApiToken: false } })
          },
          "401": errorResponse
        }
      }
    },
    "/api/agent-events": {
      get: {
        tags: ["Agent Events"],
        summary: "List recent agent event outbox records",
        description: "Human/admin endpoint for inspecting RabbitMQ wake events and publish status.",
        responses: {
          "200": {
            description: "Recent events.",
            ...json({ type: "object", properties: { events: { type: "array", items: ref("AgentEvent") } } })
          }
        }
      }
    },
    "/api/agents/me/events": {
      get: {
        tags: ["Agent Events"],
        summary: "List events visible to authenticated agent",
        description: "Returns events targeted to the authenticated agent id or one of its roles.",
        security: [{ bearerAuth: [] }, { agentIdHeader: [] }],
        responses: {
          "200": {
            description: "Visible agent events.",
            ...json({ type: "object", properties: { events: { type: "array", items: ref("AgentEvent") } } })
          },
          "401": errorResponse
        }
      }
    },
    "/api/agents/me/events/{eventId}/ack": {
      post: {
        tags: ["Agent Events"],
        summary: "Acknowledge visible agent event",
        description: "Marks a wake event as acknowledged after the adapter has inspected the board API.",
        security: [{ bearerAuth: [] }, { agentIdHeader: [] }],
        parameters: [eventIdParam],
        responses: {
          "200": { description: "Acknowledged event.", ...json({ type: "object", properties: { event: ref("AgentEvent") } }) },
          "401": errorResponse,
          "404": errorResponse
        }
      }
    },
    "/api/agents/me/tasks/current": {
      get: {
        tags: ["Agent Identity"],
        summary: "List resumable current tasks",
        description: "Returns non-done tasks currently owned by this agent with an active lease/status.",
        security: [{ bearerAuth: [] }, { agentIdHeader: [] }],
        responses: {
          "200": { description: "Current tasks.", ...json(ref("TaskListResponse"), { tasks: [ref("TaskExample")] }) },
          "401": errorResponse
        }
      }
    },
    "/api/agents/me/inbox": {
      get: {
        tags: ["Agent Identity"],
        summary: "Get unified agent inbox",
        description:
          "Returns current tasks, available tasks, targeted questions, queued/waiting tasks, capacity, and a recommended next action. This is the preferred first call for worker adapters and the endpoint used by the Agent edit page connection test.",
        security: [{ bearerAuth: [] }, { agentIdHeader: [] }],
        responses: {
          "200": {
            description: "Unified agent inbox.",
            ...json(ref("AgentInboxResponse"), {
              inbox: {
                agent: { id: "agent-engineer-01", name: "Codex Engineer", provider: "codex", status: "active", roles: ["engineer"], capabilities: ["typescript", "api"], maxConcurrentTasks: 1, hasApiToken: false },
                capacity: { used: 0, limit: 1, available: 1 },
                recommendedNextAction: "claim_available_task",
                recommendedReason: "The agent has capacity and matching available work.",
                recommendedTaskId: "task-004",
                currentTasks: [],
                availableTasks: [{ id: "task-004", title: "Dispatch unowned engineer task", status: "discussion", priority: 70 }],
                queuedTasks: [],
                waitingTasks: [],
                questions: []
              }
            })
          },
          "401": errorResponse
        }
      }
    },
    "/api/agents/me/tasks/available": {
      get: {
        tags: ["Agent Identity"],
        summary: "List tasks available to this agent",
        description: "Returns tasks whose current owner or owner role matches the authenticated agent.",
        security: [{ bearerAuth: [] }, { agentIdHeader: [] }],
        responses: {
          "200": { description: "Available tasks.", ...json(ref("TaskListResponse"), { tasks: [ref("TaskExample")] }) },
          "401": errorResponse
        }
      }
    },
    "/api/agents/me/questions": {
      get: {
        tags: ["Questions"],
        summary: "List open questions targeted to this agent",
        description: "Returns open questions addressed to the authenticated agent id or one of its roles.",
        security: [{ bearerAuth: [] }, { agentIdHeader: [] }],
        responses: {
          "200": {
            description: "Targeted questions.",
            ...json({ type: "object", properties: { questions: { type: "array", items: ref("TaskQuestion") } } }, { questions: [{ id: "q-001", question: "Can QA verify through public APIs?", status: "open", askedByAgentId: "agent-qa-01", targetRole: "engineer", createdAt: "2026-05-24T07:02:47.400Z" }] })
          },
          "401": errorResponse
        }
      }
    },
    "/api/tasks": {
      get: {
        tags: ["Tasks"],
        summary: "List all tasks",
        description: "Human/admin read endpoint. Useful for dashboards and local worker testing.",
        responses: {
          "200": { description: "All tasks.", ...json(ref("TaskListResponse")) }
        }
      },
      post: {
        tags: ["Tasks"],
        summary: "Create task",
        description: "Creates a task with context, constraints, handoff notes, and acceptance criteria.",
        requestBody: json(ref("CreateTaskRequest"), {
          title: "Implement worker API contract",
          status: "discussion",
          priority: 80,
          currentOwnerRole: "engineer",
          goal: "Define API endpoints for worker adapters.",
          background: "Agents need a stable contract.",
          requirements: ["Document auth", "Document progress reports"],
          constraints: ["Use English enums"],
          handoffNotes: ["Engineer should read upstream context."],
          acceptanceCriteria: ["OpenAPI docs are available"]
        }),
        responses: {
          "201": { description: "Created task.", ...json({ type: "object", properties: { task: ref("Task") } }) },
          "400": errorResponse
        }
      }
    },
    "/api/tasks/{id}": {
      get: {
        tags: ["Tasks"],
        summary: "Get full task",
        parameters: [taskIdParam],
        responses: {
          "200": { description: "Full task.", ...json({ type: "object", properties: { task: ref("Task") } }) },
          "404": errorResponse
        }
      }
    },
    "/api/tasks/{id}/context": {
      get: {
        tags: ["Tasks"],
        summary: "Get compact worker context",
        description: "Returns the task context, acceptance criteria, open questions, decisions, and latest lease.",
        parameters: [taskIdParam],
        responses: {
          "200": { description: "Worker-readable context.", ...json({ type: "object", properties: { task: ref("TaskContextView") } }) },
          "404": errorResponse
        }
      }
    },
    "/api/tasks/{id}/acknowledge": {
      post: {
        tags: ["Worker Loop"],
        summary: "Acknowledge task understanding",
        security: [{ bearerAuth: [] }, { agentIdHeader: [] }],
        parameters: [taskIdParam],
        requestBody: json(ref("AcknowledgeRequest"), { understanding: "I read the task goal and constraints.", plan: ["Inspect context", "Implement smallest verifiable step"], confidence: 0.82, blockers: [] }),
        responses: {
          "200": { description: "Lease updated to acknowledged.", ...json({ type: "object", properties: { lease: ref("TaskLease") } }) },
          "400": errorResponse,
          "401": errorResponse
        }
      }
    },
    "/api/tasks/{id}/claim": {
      post: {
        tags: ["Worker Loop"],
        summary: "Claim task lease",
        description: "Claims the task if the agent has capacity. Otherwise creates a queued lease.",
        security: [{ bearerAuth: [] }, { agentIdHeader: [] }],
        parameters: [taskIdParam],
        responses: {
          "200": { description: "Claim or queued result.", ...json(ref("ClaimResponse"), { lease: { id: "lease-001", agentId: "agent-engineer-01", status: "claimed", attempt: 1 }, queued: false }) },
          "400": errorResponse,
          "401": errorResponse
        }
      }
    },
    "/api/tasks/{id}/heartbeat": {
      post: {
        tags: ["Worker Loop"],
        summary: "Extend active lease",
        security: [{ bearerAuth: [] }, { agentIdHeader: [] }],
        parameters: [taskIdParam],
        requestBody: json(ref("HeartbeatRequest"), { note: "Still working. Please extend the lease." }),
        responses: {
          "200": { description: "Lease heartbeat updated.", ...json({ type: "object", properties: { lease: ref("TaskLease") } }) },
          "400": errorResponse,
          "401": errorResponse
        }
      }
    },
    "/api/tasks/{id}/progress": {
      post: {
        tags: ["Worker Loop"],
        summary: "Write progress checkpoint",
        description: "Workers should write progress at every meaningful checkpoint. Use needsResponse=false for ordinary Codex-style pauses.",
        security: [{ bearerAuth: [] }, { agentIdHeader: [] }],
        parameters: [taskIdParam],
        requestBody: json(ref("ProgressRequest"), { workerStatus: "progress_reported", summary: "Checkpoint finished; PM response is not required.", nextAction: "Continue the next implementation step.", needsResponse: false, handoffReady: true, continuationPrompt: "Read latest context and progress report, then continue." }),
        responses: {
          "201": { description: "Progress report created.", ...json({ type: "object", properties: { report: ref("ProgressReport") } }) },
          "400": errorResponse,
          "401": errorResponse
        }
      }
    },
    "/api/tasks/{id}/release": {
      post: {
        tags: ["Worker Loop"],
        summary: "Release task",
        security: [{ bearerAuth: [] }, { agentIdHeader: [] }],
        parameters: [taskIdParam],
        requestBody: json(ref("ReleaseRequest"), { reason: "Worker is yielding this task for another agent." }),
        responses: {
          "200": { description: "Lease released.", ...json({ type: "object", properties: { lease: ref("TaskLease") } }) },
          "400": errorResponse,
          "401": errorResponse
        }
      }
    },
    "/api/tasks/{id}/questions": {
      post: {
        tags: ["Questions"],
        summary: "Ask a role-directed question",
        description: "QA can ask engineer without returning the task to development. Engineer can ask PM for product decisions.",
        security: [{ bearerAuth: [] }, { agentIdHeader: [] }],
        parameters: [taskIdParam],
        requestBody: json(ref("AskQuestionRequest"), { question: "Can QA verify this behavior through the public API only?", targetRole: "engineer" }),
        responses: {
          "201": { description: "Question created.", ...json({ type: "object", properties: { question: ref("TaskQuestion") } }) },
          "400": errorResponse,
          "401": errorResponse
        }
      }
    },
    "/api/tasks/{id}/questions/{questionId}": {
      patch: {
        tags: ["Questions"],
        summary: "Answer or resolve question",
        security: [{ bearerAuth: [] }, { agentIdHeader: [] }],
        parameters: [taskIdParam, questionIdParam],
        requestBody: json(ref("AnswerQuestionRequest"), { answer: "Yes. Use the task detail API and QA report endpoint.", resolved: true, createDecision: true }),
        responses: {
          "200": { description: "Question updated.", ...json({ type: "object", properties: { question: ref("TaskQuestion") } }) },
          "400": errorResponse,
          "401": errorResponse
        }
      }
    },
    "/api/tasks/{id}/decisions": {
      post: {
        tags: ["Questions"],
        summary: "Record stable decision",
        security: [{ bearerAuth: [] }, { agentIdHeader: [] }],
        parameters: [taskIdParam],
        requestBody: json(ref("DecisionRequest"), { decision: "Disabled agents cannot use bearer token auth.", source: "question:q-001" }),
        responses: {
          "201": { description: "Decision created.", ...json({ type: "object", properties: { decision: ref("TaskDecision") } }) },
          "400": errorResponse,
          "401": errorResponse
        }
      }
    },
    "/api/tasks/{id}/transition": {
      post: {
        tags: ["Tasks"],
        summary: "Move task workflow stage",
        description: "Manual/system endpoint that applies workflow transition guards.",
        parameters: [taskIdParam],
        requestBody: json(ref("TransitionRequest"), { toStatus: "qa", reason: "Implementation is ready for QA.", actorType: "agent", actorAgentId: "agent-engineer-01" }),
        responses: {
          "200": { description: "Task transitioned.", ...json({ type: "object", properties: { task: ref("Task") } }) },
          "400": errorResponse
        }
      }
    },
    "/api/tasks/{id}/reports/qa": {
      post: {
        tags: ["Reports"],
        summary: "Submit QA report",
        description: "When task status is qa, pass moves to acceptance and fail moves back to development.",
        security: [{ bearerAuth: [] }, { agentIdHeader: [] }],
        parameters: [taskIdParam],
        requestBody: json(ref("QaReportRequest"), { summary: "QA passed the task.", checkedItems: ["Acceptance criteria reviewed"], commandsRun: ["npm test"], issuesFound: [], recommendation: "pass" }),
        responses: {
          "201": { description: "QA report created.", ...json({ type: "object", properties: { report: ref("QaReport") } }) },
          "400": errorResponse,
          "401": errorResponse
        }
      }
    },
    "/api/tasks/{id}/reports/acceptance": {
      post: {
        tags: ["Reports"],
        summary: "Submit PM acceptance report",
        description: "When task status is acceptance, accepted moves to done; rejected or needs_more_qa moves back to qa.",
        security: [{ bearerAuth: [] }, { agentIdHeader: [] }],
        parameters: [taskIdParam],
        requestBody: json(ref("AcceptanceReportRequest"), { summary: "Accepted for MVP.", decision: "accepted" }),
        responses: {
          "201": { description: "Acceptance report created.", ...json({ type: "object", properties: { report: ref("AcceptanceReport") } }) },
          "400": errorResponse,
          "401": errorResponse
        }
      }
    },
    "/api/orchestrator/dispatch": {
      post: {
        tags: ["Automation"],
        summary: "Dispatch unowned role-based tasks",
        description: "Assigns active tasks with currentOwnerRole but no currentOwnerAgentId to matching active agents.",
        responses: {
          "200": { description: "Dispatch result.", ...json(ref("DispatchResponse"), { dispatchedAt: "2026-05-24T07:00:00.000Z", results: [{ taskId: "task-004", title: "Dispatch unowned engineer task", status: "assigned", agentId: "agent-engineer-01", agentName: "Codex Engineer", reason: "Agent matched by role and has capacity." }] }) }
        }
      }
    },
    "/api/watchdog/scan": {
      post: {
        tags: ["Automation"],
        summary: "Scan expired leases",
        description: "Marks tasks stalled when active leases have expired.",
        responses: {
          "200": { description: "Watchdog scan result.", ...json(ref("WatchdogResponse"), { scannedAt: "2026-05-24T07:00:00.000Z", results: [] }) }
        }
      }
    }
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "Preferred worker authentication. Use an agent token generated on the Agent edit page."
      },
      agentIdHeader: {
        type: "apiKey",
        in: "header",
        name: "X-Agent-Id",
        description: "Local MVP fallback for Worker Console and test scripts."
      }
    },
    schemas: {
      ErrorResponse: {
        type: "object",
        properties: { error: { description: "Error message or validation details" } }
      },
      AgentRole: { type: "string", enum: ["pm", "engineer", "qa", "reviewer", "observer"] },
      TaskStatus: { type: "string", enum: ["planning", "discussion", "development", "qa", "acceptance", "done", "blocked", "stalled"] },
      WorkerStatus: { type: "string", enum: ["assigned", "acknowledged", "queued", "claimed", "in_progress", "progress_reported", "waiting_for_pm", "waiting_for_engineer", "waiting_for_human", "waiting_for_qa", "blocked", "released", "completed", "failed"] },
      Agent: {
        type: "object",
        required: ["id", "name", "provider", "status", "roles", "capabilities", "maxConcurrentTasks", "hasApiToken"],
        properties: {
          id: { type: "string", example: "agent-engineer-01" },
          name: { type: "string", example: "Codex Engineer" },
          provider: { type: "string", enum: ["codex", "claude", "openclaw", "manual", "other"] },
          status: { type: "string", enum: ["active", "paused", "disabled"] },
          roles: { type: "array", items: ref("AgentRole") },
          capabilities: { type: "array", items: { type: "string" } },
          maxConcurrentTasks: { type: "integer", example: 1 },
          notes: { type: "string" },
          hasApiToken: { type: "boolean" },
          tokenLastUsedAt: { type: "string", format: "date-time" }
        }
      },
      CreateAgentRequest: {
        type: "object",
        required: ["name", "provider", "roles"],
        properties: {
          name: { type: "string", example: "Codex Engineer" },
          provider: { type: "string", enum: ["codex", "claude", "openclaw", "manual", "other"] },
          status: { type: "string", enum: ["active", "paused", "disabled"], default: "active" },
          roles: { type: "array", items: ref("AgentRole") },
          capabilities: { type: "array", items: { type: "string" } },
          maxConcurrentTasks: { type: "integer", minimum: 1, default: 1 },
          notes: { type: "string" }
        }
      },
      RabbitMqProvisioningResult: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["provisioned", "deprovisioned", "skipped", "error"] },
          queueName: { type: "string", example: "agent.agent-engineer-01.wake" },
          exchangeName: { type: "string", example: "agent.events" },
          bindings: { type: "array", items: { type: "string" }, example: ["agent.agent-engineer-01", "role.engineer"] },
          message: { type: "string" }
        }
      },
      DeletionBlocker: {
        type: "object",
        properties: {
          id: { type: "string", example: "task-001" },
          title: { type: "string" },
          status: ref("TaskStatus"),
          workerStatus: ref("WorkerStatus")
        }
      },
      AgentEvent: {
        type: "object",
        properties: {
          id: { type: "string", example: "evt-001" },
          type: { type: "string", example: "task_assigned" },
          targetAgentId: { type: "string", example: "agent-engineer-01" },
          targetRole: ref("AgentRole"),
          taskId: { type: "string", example: "task-004" },
          questionId: { type: "string", example: "q-001" },
          reason: { type: "string" },
          payload: { type: "object" },
          publishStatus: { type: "string", enum: ["pending", "published", "skipped", "failed"] },
          publishMessage: { type: "string" },
          publishedAt: { type: "string", format: "date-time" },
          acknowledgedAt: { type: "string", format: "date-time" },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      TaskListResponse: { type: "object", properties: { tasks: { type: "array", items: ref("Task") } } },
      AgentInboxResponse: {
        type: "object",
        properties: {
          inbox: {
            type: "object",
            properties: {
              agent: ref("Agent"),
              capacity: {
                type: "object",
                properties: {
                  used: { type: "integer" },
                  limit: { type: "integer" },
                  available: { type: "integer" }
                }
              },
              recommendedNextAction: {
                type: "string",
                enum: ["answer_question", "resume_current_task", "claim_available_task", "wait"]
              },
              recommendedReason: { type: "string" },
              recommendedTaskId: { type: "string" },
              recommendedQuestionId: { type: "string" },
              currentTasks: { type: "array", items: ref("Task") },
              availableTasks: { type: "array", items: ref("Task") },
              queuedTasks: { type: "array", items: ref("Task") },
              waitingTasks: { type: "array", items: ref("Task") },
              questions: { type: "array", items: ref("TaskQuestion") }
            }
          }
        }
      },
      Task: {
        type: "object",
        properties: {
          id: { type: "string", example: "task-002" },
          title: { type: "string" },
          status: ref("TaskStatus"),
          priority: { type: "integer", minimum: 0, maximum: 100 },
          currentOwnerAgentId: { type: "string" },
          currentOwnerRole: ref("AgentRole"),
          context: ref("TaskContext"),
          acceptanceCriteria: { type: "array", items: ref("AcceptanceCriterion") },
          questions: { type: "array", items: ref("TaskQuestion") },
          decisions: { type: "array", items: ref("TaskDecision") },
          leases: { type: "array", items: ref("TaskLease") },
          progressReports: { type: "array", items: ref("ProgressReport") },
          qaReports: { type: "array", items: ref("QaReport") },
          acceptanceReports: { type: "array", items: ref("AcceptanceReport") },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      TaskExample: {
        type: "object",
        example: {
          id: "task-002",
          title: "Define task workflow transitions",
          status: "qa",
          priority: 85,
          currentOwnerAgentId: "agent-qa-01",
          currentOwnerRole: "qa"
        }
      },
      TaskContext: {
        type: "object",
        properties: {
          goal: { type: "string" },
          background: { type: "string" },
          requirements: { type: "array", items: { type: "string" } },
          constraints: { type: "array", items: { type: "string" } },
          handoffNotes: { type: "array", items: { type: "string" } }
        }
      },
      TaskContextView: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          status: ref("TaskStatus"),
          priority: { type: "integer" },
          currentOwnerAgentId: { type: "string" },
          currentOwnerRole: ref("AgentRole"),
          context: ref("TaskContext"),
          acceptanceCriteria: { type: "array", items: ref("AcceptanceCriterion") },
          openQuestions: { type: "array", items: ref("TaskQuestion") },
          decisions: { type: "array", items: ref("TaskDecision") },
          latestLease: ref("TaskLease")
        }
      },
      AcceptanceCriterion: { type: "object", properties: { id: { type: "string" }, description: { type: "string" }, checked: { type: "boolean" } } },
      TaskQuestion: {
        type: "object",
        properties: {
          id: { type: "string" },
          question: { type: "string" },
          status: { type: "string", enum: ["open", "answered", "cancelled"] },
          answer: { type: "string" },
          askedByAgentId: { type: "string" },
          targetRole: ref("AgentRole"),
          targetAgentId: { type: "string" },
          answeredByAgentId: { type: "string" },
          answeredAt: { type: "string", format: "date-time" },
          resolvedAt: { type: "string", format: "date-time" },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      TaskDecision: { type: "object", properties: { id: { type: "string" }, decision: { type: "string" }, decidedBy: { type: "string" }, source: { type: "string" }, createdAt: { type: "string", format: "date-time" } } },
      TaskLease: { type: "object", properties: { id: { type: "string" }, agentId: { type: "string" }, status: ref("WorkerStatus"), leaseUntil: { type: "string", format: "date-time" }, lastHeartbeatAt: { type: "string", format: "date-time" }, attempt: { type: "integer" } } },
      ProgressReport: { type: "object", properties: { id: { type: "string" }, agentId: { type: "string" }, workerStatus: ref("WorkerStatus"), summary: { type: "string" }, nextAction: { type: "string" }, needsResponse: { type: "boolean" }, expectedResponderRole: ref("AgentRole"), handoffReady: { type: "boolean" }, continuationPrompt: { type: "string" }, createdAt: { type: "string", format: "date-time" } } },
      QaReport: { type: "object", properties: { id: { type: "string" }, agentId: { type: "string" }, summary: { type: "string" }, checkedItems: { type: "array", items: { type: "string" } }, commandsRun: { type: "array", items: { type: "string" } }, issuesFound: { type: "array", items: { type: "string" } }, recommendation: { type: "string", enum: ["pass", "fail", "needs_human_review"] }, createdAt: { type: "string", format: "date-time" } } },
      AcceptanceReport: { type: "object", properties: { id: { type: "string" }, agentId: { type: "string" }, summary: { type: "string" }, decision: { type: "string", enum: ["accepted", "rejected", "needs_more_qa"] }, reason: { type: "string" }, createdAt: { type: "string", format: "date-time" } } },
      CreateTaskRequest: { type: "object", required: ["title", "goal"], properties: { title: { type: "string" }, status: ref("TaskStatus"), priority: { type: "integer", minimum: 0, maximum: 100 }, currentOwnerAgentId: { type: "string" }, currentOwnerRole: ref("AgentRole"), goal: { type: "string" }, background: { type: "string" }, requirements: { type: "array", items: { type: "string" } }, constraints: { type: "array", items: { type: "string" } }, handoffNotes: { type: "array", items: { type: "string" } }, acceptanceCriteria: { type: "array", items: { type: "string" } } } },
      AcknowledgeRequest: { type: "object", properties: { understanding: { type: "string" }, plan: { type: "array", items: { type: "string" } }, confidence: { type: "number", minimum: 0, maximum: 1 }, blockers: { type: "array", items: { type: "string" } } } },
      HeartbeatRequest: { type: "object", properties: { note: { type: "string" } } },
      ProgressRequest: { type: "object", required: ["workerStatus", "summary"], properties: { workerStatus: ref("WorkerStatus"), summary: { type: "string" }, nextAction: { type: "string" }, needsResponse: { type: "boolean", default: false }, expectedResponderRole: ref("AgentRole"), handoffReady: { type: "boolean", default: false }, continuationPrompt: { type: "string" } } },
      ReleaseRequest: { type: "object", properties: { reason: { type: "string" } } },
      ClaimResponse: { type: "object", properties: { lease: ref("TaskLease"), queued: { type: "boolean" } } },
      AskQuestionRequest: { type: "object", required: ["question"], properties: { question: { type: "string" }, askedByAgentId: { type: "string" }, targetRole: ref("AgentRole"), targetAgentId: { type: "string" } } },
      AnswerQuestionRequest: { type: "object", properties: { answer: { type: "string" }, resolved: { type: "boolean" }, createDecision: { type: "boolean", default: false }, decidedBy: { type: "string" }, source: { type: "string" } } },
      DecisionRequest: { type: "object", required: ["decision"], properties: { decision: { type: "string" }, decidedBy: { type: "string" }, source: { type: "string" } } },
      TransitionRequest: { type: "object", required: ["toStatus"], properties: { toStatus: ref("TaskStatus"), reason: { type: "string" }, requestedChanges: { type: "array", items: { type: "string" } }, actorType: { type: "string", enum: ["human", "agent", "system"] }, actorAgentId: { type: "string" } } },
      QaReportRequest: { type: "object", required: ["summary", "recommendation"], properties: { summary: { type: "string" }, checkedItems: { type: "array", items: { type: "string" } }, commandsRun: { type: "array", items: { type: "string" } }, issuesFound: { type: "array", items: { type: "string" } }, recommendation: { type: "string", enum: ["pass", "fail", "needs_human_review"] } } },
      AcceptanceReportRequest: { type: "object", required: ["summary", "decision"], properties: { summary: { type: "string" }, decision: { type: "string", enum: ["accepted", "rejected", "needs_more_qa"] }, reason: { type: "string" } } },
      DispatchResponse: { type: "object", properties: { dispatchedAt: { type: "string", format: "date-time" }, results: { type: "array", items: { type: "object" } } } },
      WatchdogResponse: { type: "object", properties: { scannedAt: { type: "string", format: "date-time" }, results: { type: "array", items: { type: "object" } } } }
    }
  },
  "x-maintenance-note": "When adding or changing Agent-facing APIs, update src/lib/openapi.ts and verify /api/openapi.json plus /api-docs."
} as const;

export type OpenApiSpec = typeof openApiSpec;
