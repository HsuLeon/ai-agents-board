import { prisma } from "./prisma";
import { createHash, randomBytes } from "crypto";
import type { Prisma } from "@prisma/client";
import { publishRabbitMqWakeSignal, routingKeyForAgentEvent } from "./rabbitmq";
import { activeTaskStatuses, canTransition } from "./workflow";
import {
  activeWorkerStatuses,
  capacityWorkerStatuses,
  latestLeaseForAgent,
  sortTasksForWorker,
  taskHasAgentLease
} from "./worker-status";
import type {
  AcceptanceReport,
  Agent,
  AgentEvent,
  AgentProvider,
  AgentRole,
  AgentStatus,
  AgentWorkStatus,
  QaReport,
  Task,
  TaskArtifact,
  TaskQuestion,
  TaskStatus
} from "./types";

const taskInclude = {
  context: true,
  acceptanceCriteria: true,
  questions: true,
  decisions: true,
  comments: true,
  leases: true,
  artifacts: true,
  progressReports: true,
  qaReports: true,
  acceptanceReports: true,
  transitions: true
};

const agentInclude = {
  roles: true,
  capabilities: true
};

function toAgentEvent(event: {
  id: string;
  type: string;
  targetAgentId: string | null;
  targetRole: string | null;
  taskId: string | null;
  questionId: string | null;
  reason: string | null;
  payload: string;
  publishStatus: string;
  publishMessage: string | null;
  publishedAt: Date | null;
  acknowledgedAt: Date | null;
  createdAt: Date;
}): AgentEvent {
  return {
    id: event.id,
    type: event.type,
    targetAgentId: event.targetAgentId ?? undefined,
    targetRole: (event.targetRole as AgentRole | null) ?? undefined,
    taskId: event.taskId ?? undefined,
    questionId: event.questionId ?? undefined,
    reason: event.reason ?? undefined,
    payload: parseUnknown(event.payload),
    publishStatus: event.publishStatus as AgentEvent["publishStatus"],
    publishMessage: event.publishMessage ?? undefined,
    publishedAt: event.publishedAt?.toISOString(),
    acknowledgedAt: event.acknowledgedAt?.toISOString(),
    createdAt: event.createdAt.toISOString()
  };
}

function parseArray(value?: string | null): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function parseUnknown(value?: string | null): unknown {
  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

const agentIncludeArgs = { include: agentInclude };
type PrismaAgent = Prisma.AgentGetPayload<typeof agentIncludeArgs>;

function toAgent(agent: NonNullable<PrismaAgent>): Agent {
  return {
    id: agent.id,
    name: agent.name,
    provider: agent.provider as AgentProvider,
    status: agent.status as AgentStatus,
    roles: agent.roles.map((role) => role.role as AgentRole),
    capabilities: agent.capabilities.map((capability) => capability.capability),
    maxConcurrentTasks: agent.maxConcurrentTasks,
    notes: agent.notes ?? undefined,
    hasApiToken: Boolean(agent.apiTokenHash),
    tokenLastUsedAt: agent.tokenLastUsedAt?.toISOString()
  };
}

export function hashAgentToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function generateAgentToken() {
  return `aab_${randomBytes(32).toString("base64url")}`;
}

const taskIncludeArgs = { include: taskInclude };
type PrismaTask = Prisma.TaskGetPayload<typeof taskIncludeArgs>;

function toTaskQuestion(question: PrismaTask["questions"][number]): TaskQuestion {
  return {
    id: question.id,
    question: question.question,
    status: question.status as TaskQuestion["status"],
    answer: question.answer ?? undefined,
    askedByAgentId: question.askedByAgentId ?? undefined,
    targetRole: (question.targetRole as AgentRole | null) ?? undefined,
    targetAgentId: question.targetAgentId ?? undefined,
    answeredByAgentId: question.answeredByAgentId ?? undefined,
    answeredAt: question.answeredAt?.toISOString(),
    resolvedAt: question.resolvedAt?.toISOString(),
    createdAt: question.createdAt.toISOString()
  };
}

function toTask(task: NonNullable<PrismaTask>): Task {
  return {
    id: task.id,
    title: task.title,
    status: task.status as TaskStatus,
    priority: task.priority,
    currentOwnerAgentId: task.currentOwnerAgentId ?? undefined,
    currentOwnerRole: (task.currentOwnerRole as AgentRole | null) ?? undefined,
    previousStatus: (task.previousStatus as TaskStatus | null) ?? undefined,
    context: {
      goal: task.context?.goal ?? "",
      background: task.context?.background ?? "",
      requirements: parseArray(task.context?.requirements),
      constraints: parseArray(task.context?.constraints),
      handoffNotes: parseArray(task.context?.handoffNotes)
    },
    acceptanceCriteria: task.acceptanceCriteria.map((criterion) => ({
      id: criterion.id,
      description: criterion.description,
      checked: criterion.checked
    })),
    questions: task.questions.map(toTaskQuestion),
    decisions: task.decisions.map((decision) => ({
      id: decision.id,
      decision: decision.decision,
      decidedBy: decision.decidedBy,
      source: decision.source ?? undefined,
      createdAt: decision.createdAt.toISOString()
    })),
    comments: task.comments.map((comment) => ({
      id: comment.id,
      authorType: comment.authorType as "human" | "agent" | "system",
      authorAgentId: comment.authorAgentId ?? undefined,
      body: comment.body,
      createdAt: comment.createdAt.toISOString()
    })),
    leases: task.leases.map((lease) => ({
      id: lease.id,
      agentId: lease.agentId,
      status: lease.status as AgentWorkStatus,
      leaseUntil: lease.leaseUntil?.toISOString(),
      lastHeartbeatAt: lease.lastHeartbeatAt?.toISOString(),
      attempt: lease.attempt
    })),
    artifacts: task.artifacts.map(
      (artifact): TaskArtifact => ({
        id: artifact.id,
        type: artifact.type as TaskArtifact["type"],
        title: artifact.title,
        content: parseUnknown(artifact.content),
        url: artifact.url ?? undefined,
        createdByAgentId: artifact.createdByAgentId ?? undefined,
        createdAt: artifact.createdAt.toISOString()
      })
    ),
    progressReports: task.progressReports.map((report) => ({
      id: report.id,
      agentId: report.agentId,
      workerStatus: report.workerStatus as AgentWorkStatus,
      summary: report.summary,
      nextAction: report.nextAction ?? undefined,
      needsResponse: report.needsResponse,
      expectedResponderRole: (report.expectedResponderRole as AgentRole | null) ?? undefined,
      handoffReady: report.handoffReady,
      continuationPrompt: report.continuationPrompt ?? undefined,
      createdAt: report.createdAt.toISOString()
    })),
    qaReports: task.qaReports.map(
      (report): QaReport => ({
        id: report.id,
        agentId: report.agentId ?? undefined,
        summary: report.summary,
        checkedItems: parseArray(report.checkedItems),
        commandsRun: parseArray(report.commandsRun),
        issuesFound: parseArray(report.issuesFound),
        recommendation: report.recommendation as QaReport["recommendation"],
        createdAt: report.createdAt.toISOString()
      })
    ),
    acceptanceReports: task.acceptanceReports.map(
      (report): AcceptanceReport => ({
        id: report.id,
        agentId: report.agentId ?? undefined,
        summary: report.summary,
        decision: report.decision as AcceptanceReport["decision"],
        reason: report.reason ?? undefined,
        createdAt: report.createdAt.toISOString()
      })
    ),
    transitions: task.transitions.map((transition) => ({
      id: transition.id,
      fromStatus: (transition.fromStatus as TaskStatus | null) ?? undefined,
      toStatus: transition.toStatus as TaskStatus,
      reason: transition.reason ?? undefined,
      requestedChanges: parseArray(transition.requestedChanges),
      actorType: transition.actorType as "human" | "agent" | "system",
      actorAgentId: transition.actorAgentId ?? undefined,
      createdAt: transition.createdAt.toISOString()
    })),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString()
  };
}

export async function listAgents() {
  const agents = await prisma.agent.findMany({
    ...agentIncludeArgs,
    orderBy: { name: "asc" }
  });
  return agents.map(toAgent);
}

export async function createAgent(params: {
  name: string;
  provider: AgentProvider;
  status: AgentStatus;
  roles: AgentRole[];
  capabilities: string[];
  maxConcurrentTasks: number;
  notes?: string;
}) {
  const agent = await prisma.agent.create({
    data: {
      name: params.name,
      provider: params.provider,
      status: params.status,
      maxConcurrentTasks: params.maxConcurrentTasks,
      notes: params.notes,
      roles: {
        create: params.roles.map((role) => ({ role }))
      },
      capabilities: {
        create: params.capabilities.map((capability) => ({ capability }))
      }
    },
    ...agentIncludeArgs
  });

  return toAgent(agent);
}

export async function updateAgent(
  id: string,
  params: {
    name: string;
    provider: AgentProvider;
    status: AgentStatus;
    roles: AgentRole[];
    capabilities: string[];
    maxConcurrentTasks: number;
    notes?: string;
  }
) {
  await prisma.$transaction([
    prisma.agentRoleRecord.deleteMany({ where: { agentId: id } }),
    prisma.agentCapability.deleteMany({ where: { agentId: id } })
  ]);

  const agent = await prisma.agent.update({
    where: { id },
    data: {
      name: params.name,
      provider: params.provider,
      status: params.status,
      maxConcurrentTasks: params.maxConcurrentTasks,
      notes: params.notes,
      roles: {
        create: params.roles.map((role) => ({ role }))
      },
      capabilities: {
        create: params.capabilities.map((capability) => ({ capability }))
      }
    },
    ...agentIncludeArgs
  });

  return toAgent(agent);
}

export async function getAgent(id: string) {
  const agent = await prisma.agent.findUnique({
    where: { id },
    ...agentIncludeArgs
  });

  return agent ? toAgent(agent) : undefined;
}

export async function listAgentEvents(params: { agentId?: string; limit?: number } = {}) {
  const events = await prisma.agentEvent.findMany({
    where: params.agentId
      ? {
          OR: [{ targetAgentId: params.agentId }, { targetAgent: { id: params.agentId } }]
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: params.limit ?? 50
  });

  return events.map(toAgentEvent);
}

export async function listEventsForAgent(agentId: string, limit = 50) {
  const agent = await getAgent(agentId);
  if (!agent) {
    return [];
  }

  const events = await prisma.agentEvent.findMany({
    where: {
      OR: [{ targetAgentId: agentId }, { targetRole: { in: agent.roles } }]
    },
    orderBy: { createdAt: "desc" },
    take: limit
  });

  return events.map(toAgentEvent);
}

export async function emitAgentEvent(params: {
  type: string;
  targetAgentId?: string;
  targetRole?: AgentRole;
  taskId?: string;
  questionId?: string;
  reason?: string;
  payload?: unknown;
}) {
  const routingKey = routingKeyForAgentEvent(params);
  const payload = {
    eventType: params.type,
    agentId: params.targetAgentId,
    role: params.targetRole,
    taskId: params.taskId,
    questionId: params.questionId,
    reason: params.reason,
    ...(typeof params.payload === "object" && params.payload !== null ? params.payload : {})
  };

  const event = await prisma.agentEvent.create({
    data: {
      type: params.type,
      targetAgentId: params.targetAgentId,
      targetRole: params.targetRole,
      taskId: params.taskId,
      questionId: params.questionId,
      reason: params.reason,
      payload: JSON.stringify(payload)
    }
  });

  if (!routingKey) {
    const updated = await prisma.agentEvent.update({
      where: { id: event.id },
      data: {
        publishStatus: "skipped",
        publishMessage: "No target agent or role routing key."
      }
    });
    return toAgentEvent(updated);
  }

  try {
    const publish = await publishRabbitMqWakeSignal({
      routingKey,
      payload: {
        eventId: event.id,
        type: params.type,
        agentId: params.targetAgentId,
        role: params.targetRole,
        taskId: params.taskId,
        questionId: params.questionId,
        reason: params.reason,
        createdAt: event.createdAt.toISOString()
      }
    });
    const updated = await prisma.agentEvent.update({
      where: { id: event.id },
      data: {
        publishStatus: publish.status,
        publishMessage: publish.message,
        publishedAt: publish.status === "published" ? new Date() : null
      }
    });
    return toAgentEvent(updated);
  } catch (error) {
    const updated = await prisma.agentEvent.update({
      where: { id: event.id },
      data: {
        publishStatus: "failed",
        publishMessage: error instanceof Error ? error.message : "RabbitMQ publish failed"
      }
    });
    return toAgentEvent(updated);
  }
}

export async function acknowledgeAgentEvent(eventId: string) {
  const event = await prisma.agentEvent.update({
    where: { id: eventId },
    data: { acknowledgedAt: new Date() }
  });

  return toAgentEvent(event);
}

export async function getAgentDeletionBlockers(agentId: string) {
  const tasks = await listTasks();
  return tasks
    .filter((task) => taskHasAgentLease(task, agentId, activeWorkerStatuses))
    .map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      workerStatus: latestLeaseForAgent(task, agentId)?.status
    }));
}

export async function deleteAgent(agentId: string) {
  const blockers = await getAgentDeletionBlockers(agentId);
  if (blockers.length > 0) {
    throw new Error(`Agent has ${blockers.length} active task lease(s). Release or reassign work before deleting.`);
  }

  await prisma.$transaction([
    prisma.task.updateMany({
      where: { currentOwnerAgentId: agentId },
      data: { currentOwnerAgentId: null }
    }),
    prisma.agent.delete({ where: { id: agentId } })
  ]);
}

export async function getAgentByToken(token: string) {
  const agent = await prisma.agent.findFirst({
    where: { apiTokenHash: hashAgentToken(token) },
    ...agentIncludeArgs
  });

  if (!agent) {
    return undefined;
  }

  await prisma.agent.update({
    where: { id: agent.id },
    data: { tokenLastUsedAt: new Date() }
  });

  return toAgent(agent);
}

export async function resetAgentToken(agentId: string) {
  const token = generateAgentToken();
  await prisma.agent.update({
    where: { id: agentId },
    data: {
      apiTokenHash: hashAgentToken(token),
      tokenLastUsedAt: null
    }
  });

  return token;
}

export async function listTasks() {
  const tasks = await prisma.task.findMany({
    ...taskIncludeArgs,
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }]
  });
  return tasks.map(toTask);
}

export async function createTask(params: {
  title: string;
  status: TaskStatus;
  priority: number;
  currentOwnerAgentId?: string;
  currentOwnerRole?: AgentRole;
  goal: string;
  background: string;
  requirements: string[];
  constraints: string[];
  handoffNotes: string[];
  acceptanceCriteria: string[];
}) {
  const task = await prisma.task.create({
    data: {
      title: params.title,
      status: params.status,
      priority: params.priority,
      currentOwnerAgentId: params.currentOwnerAgentId || null,
      currentOwnerRole: params.currentOwnerRole || null,
      context: {
        create: {
          goal: params.goal,
          background: params.background,
          requirements: JSON.stringify(params.requirements),
          constraints: JSON.stringify(params.constraints),
          handoffNotes: JSON.stringify(params.handoffNotes)
        }
      },
      acceptanceCriteria: {
        create: params.acceptanceCriteria.map((description) => ({ description }))
      },
      transitions: {
        create: {
          toStatus: params.status,
          actorType: "human",
          reason: "Task created"
        }
      }
    },
    ...taskIncludeArgs
  });

  return toTask(task);
}

export async function updateTask(params: {
  id: string;
  title: string;
  priority: number;
  currentOwnerAgentId?: string;
  currentOwnerRole?: AgentRole;
  goal: string;
  background: string;
  requirements: string[];
  constraints: string[];
  handoffNotes: string[];
}) {
  const task = await prisma.task.update({
    where: { id: params.id },
    data: {
      title: params.title,
      priority: params.priority,
      currentOwnerAgentId: params.currentOwnerAgentId || null,
      currentOwnerRole: params.currentOwnerRole || null,
      context: {
        upsert: {
          create: {
            goal: params.goal,
            background: params.background,
            requirements: JSON.stringify(params.requirements),
            constraints: JSON.stringify(params.constraints),
            handoffNotes: JSON.stringify(params.handoffNotes)
          },
          update: {
            goal: params.goal,
            background: params.background,
            requirements: JSON.stringify(params.requirements),
            constraints: JSON.stringify(params.constraints),
            handoffNotes: JSON.stringify(params.handoffNotes)
          }
        }
      }
    },
    ...taskIncludeArgs
  });

  return toTask(task);
}

export async function addAcceptanceCriterion(taskId: string, description: string) {
  await prisma.acceptanceCriteria.create({
    data: { taskId, description }
  });
}

export async function setAcceptanceCriterionChecked(id: string, checked: boolean) {
  await prisma.acceptanceCriteria.update({
    where: { id },
    data: { checked }
  });
}

export async function addTaskQuestion(params: {
  taskId: string;
  question: string;
  askedByAgentId?: string;
  targetRole?: AgentRole;
  targetAgentId?: string;
}) {
  const question = await prisma.taskQuestion.create({
    data: {
      taskId: params.taskId,
      question: params.question,
      askedByAgentId: params.askedByAgentId,
      targetRole: params.targetRole,
      targetAgentId: params.targetAgentId
    }
  });

  await emitAgentEvent({
    type: "question_created",
    targetAgentId: params.targetAgentId,
    targetRole: params.targetRole,
    taskId: params.taskId,
    questionId: question.id,
    reason: "A question is targeted to this agent or role.",
    payload: { question: params.question }
  });

  return toTaskQuestion(question);
}

export async function answerTaskQuestion(params: {
  id: string;
  answer: string;
  answeredByAgentId?: string;
  resolve?: boolean;
  createDecision?: boolean;
  decidedBy?: string;
  source?: string;
}) {
  const question = await prisma.taskQuestion.update({
    where: { id: params.id },
    data: {
      answer: params.answer,
      status: "answered",
      answeredByAgentId: params.answeredByAgentId,
      answeredAt: new Date(),
      resolvedAt: params.resolve === false ? null : new Date()
    }
  });

  if (params.createDecision) {
    await prisma.taskDecision.create({
      data: {
        taskId: question.taskId,
        decision: params.answer,
        decidedBy: params.decidedBy ?? "human",
        source: params.source ?? `question:${question.id}`
      }
    });
  }

  if (question.askedByAgentId) {
    await emitAgentEvent({
      type: "question_answered",
      targetAgentId: question.askedByAgentId,
      taskId: question.taskId,
      questionId: question.id,
      reason: "A question asked by this agent was answered.",
      payload: { answer: params.answer }
    });
  }

  return toTaskQuestion(question);
}

export async function resolveTaskQuestion(params: { id: string; resolved: boolean }) {
  const question = await prisma.taskQuestion.update({
    where: { id: params.id },
    data: {
      status: params.resolved ? "answered" : "open",
      resolvedAt: params.resolved ? new Date() : null
    }
  });

  return toTaskQuestion(question);
}

export async function listQuestionsForAgent(agentId: string) {
  const agent = await getAgent(agentId);
  if (!agent) {
    return [];
  }

  const questions = await prisma.taskQuestion.findMany({
    where: {
      status: "open",
      OR: [
        { targetAgentId: agentId },
        { targetRole: { in: agent.roles } }
      ]
    },
    orderBy: { createdAt: "asc" }
  });

  return questions.map(toTaskQuestion);
}

export async function addTaskDecision(params: {
  taskId: string;
  decision: string;
  decidedBy: string;
  source?: string;
}) {
  const decision = await prisma.taskDecision.create({
    data: {
      taskId: params.taskId,
      decision: params.decision,
      decidedBy: params.decidedBy,
      source: params.source
    }
  });

  return {
    id: decision.id,
    decision: decision.decision,
    decidedBy: decision.decidedBy,
    source: decision.source ?? undefined,
    createdAt: decision.createdAt.toISOString()
  };
}

export async function addQaReport(params: {
  taskId: string;
  agentId?: string;
  summary: string;
  checkedItems: string[];
  commandsRun: string[];
  issuesFound: string[];
  recommendation: QaReport["recommendation"];
}) {
  const report = await prisma.qaReport.create({
    data: {
      taskId: params.taskId,
      agentId: params.agentId,
      summary: params.summary,
      checkedItems: JSON.stringify(params.checkedItems),
      commandsRun: JSON.stringify(params.commandsRun),
      issuesFound: JSON.stringify(params.issuesFound),
      recommendation: params.recommendation
    }
  });

  return {
    id: report.id,
    agentId: report.agentId ?? undefined,
    summary: report.summary,
    checkedItems: parseArray(report.checkedItems),
    commandsRun: parseArray(report.commandsRun),
    issuesFound: parseArray(report.issuesFound),
    recommendation: report.recommendation as QaReport["recommendation"],
    createdAt: report.createdAt.toISOString()
  };
}

export async function addAcceptanceReport(params: {
  taskId: string;
  agentId?: string;
  summary: string;
  decision: AcceptanceReport["decision"];
  reason?: string;
}) {
  const report = await prisma.acceptanceReport.create({
    data: {
      taskId: params.taskId,
      agentId: params.agentId,
      summary: params.summary,
      decision: params.decision,
      reason: params.reason
    }
  });

  return {
    id: report.id,
    agentId: report.agentId ?? undefined,
    summary: report.summary,
    decision: report.decision as AcceptanceReport["decision"],
    reason: report.reason ?? undefined,
    createdAt: report.createdAt.toISOString()
  };
}

export async function submitQaReport(params: {
  taskId: string;
  agentId?: string;
  summary: string;
  checkedItems: string[];
  commandsRun: string[];
  issuesFound: string[];
  recommendation: QaReport["recommendation"];
  actorType?: "human" | "agent" | "system";
}) {
  const task = await getTask(params.taskId);
  if (!task) {
    throw new Error("Task not found");
  }

  const report = await addQaReport(params);

  if (params.recommendation === "pass" && task.status === "qa") {
    await transitionTask({
      taskId: params.taskId,
      toStatus: "acceptance",
      reason: "QA report recommendation: pass",
      actorType: params.actorType ?? "agent",
      actorAgentId: params.agentId
    });
  }

  if (params.recommendation === "fail" && task.status === "qa") {
    await transitionTask({
      taskId: params.taskId,
      toStatus: "development",
      reason: params.summary,
      requestedChanges: params.issuesFound,
      actorType: params.actorType ?? "agent",
      actorAgentId: params.agentId
    });
  }

  return report;
}

export async function submitAcceptanceReport(params: {
  taskId: string;
  agentId?: string;
  summary: string;
  decision: AcceptanceReport["decision"];
  reason?: string;
  actorType?: "human" | "agent" | "system";
}) {
  const task = await getTask(params.taskId);
  if (!task) {
    throw new Error("Task not found");
  }

  const report = await addAcceptanceReport(params);

  if (params.decision === "accepted" && task.status === "acceptance") {
    await transitionTask({
      taskId: params.taskId,
      toStatus: "done",
      reason: "PM acceptance accepted",
      actorType: params.actorType ?? "agent",
      actorAgentId: params.agentId
    });
  }

  if ((params.decision === "rejected" || params.decision === "needs_more_qa") && task.status === "acceptance") {
    await transitionTask({
      taskId: params.taskId,
      toStatus: "qa",
      reason: params.reason ?? params.summary,
      actorType: params.actorType ?? "agent",
      actorAgentId: params.agentId
    });
  }

  return report;
}

export async function getTask(id: string) {
  const task = await prisma.task.findUnique({
    where: { id },
    ...taskIncludeArgs
  });

  return task ? toTask(task) : undefined;
}

export async function listAvailableTasks(agentId: string) {
  const agent = await getAgent(agentId);
  if (!agent || agent.status !== "active") {
    return [];
  }

  const tasks = await listTasks();
  return tasks.filter((task) => {
    if (task.currentOwnerAgentId && task.currentOwnerAgentId !== agentId) {
      return false;
    }

    if (!task.currentOwnerRole) {
      return true;
    }

    return agent.roles.includes(task.currentOwnerRole);
  });
}

export async function listCurrentTasksForAgent(agentId: string) {
  const tasks = (await listTasks()).filter(
    (task) =>
      task.currentOwnerAgentId === agentId &&
      task.status !== "done" &&
      taskHasAgentLease(task, agentId, activeWorkerStatuses)
  );

  return sortTasksForWorker(agentId, tasks);
}

export async function getAgentInbox(agentId: string) {
  const agent = await getAgent(agentId);
  if (!agent) {
    return undefined;
  }

  const [currentTasks, availableTasks, questions, workloads] = await Promise.all([
    listCurrentTasksForAgent(agentId),
    listAvailableTasks(agentId),
    listQuestionsForAgent(agentId),
    getAgentWorkloads()
  ]);
  const workload = workloads.find((item) => item.agent.id === agentId);
  const queuedTasks = currentTasks.filter((task) => taskHasAgentLease(task, agentId, ["queued"]));
  const waitingTasks = currentTasks.filter((task) =>
    taskHasAgentLease(task, agentId, ["waiting_for_pm", "waiting_for_engineer", "waiting_for_human", "waiting_for_qa", "blocked"])
  );
  const capacity = workload
    ? {
        used: workload.capacityUsedCount,
        limit: agent.maxConcurrentTasks,
        available: workload.capacity
      }
    : {
        used: 0,
        limit: agent.maxConcurrentTasks,
        available: agent.maxConcurrentTasks
      };

  let recommendedNextAction: "answer_question" | "resume_current_task" | "claim_available_task" | "wait" = "wait";
  let recommendedReason = "No current work or matching available task.";
  let recommendedTaskId: string | undefined;
  let recommendedQuestionId: string | undefined;

  if (questions.length > 0) {
    recommendedNextAction = "answer_question";
    recommendedQuestionId = questions[0].id;
    recommendedReason = "A question is targeted to this agent or one of its roles.";
  } else if (currentTasks.length > 0) {
    recommendedNextAction = "resume_current_task";
    recommendedTaskId = currentTasks[0].id;
    recommendedReason = "This agent has a current resumable task.";
  } else if (capacity.available > 0 && availableTasks.length > 0) {
    recommendedNextAction = "claim_available_task";
    recommendedTaskId = availableTasks[0].id;
    recommendedReason = "The agent has capacity and matching available work.";
  } else if (availableTasks.length > 0) {
    recommendedNextAction = "wait";
    recommendedTaskId = availableTasks[0].id;
    recommendedReason = "Matching work exists, but the agent has no free capacity.";
  }

  return {
    agent,
    capacity,
    recommendedNextAction,
    recommendedReason,
    recommendedTaskId,
    recommendedQuestionId,
    currentTasks,
    availableTasks,
    queuedTasks,
    waitingTasks,
    questions
  };
}

export async function transitionTask(params: {
  taskId: string;
  toStatus: TaskStatus;
  reason?: string;
  requestedChanges?: string[];
  actorType?: "human" | "agent" | "system";
  actorAgentId?: string;
}) {
  const task = await getTask(params.taskId);
  if (!task) {
    throw new Error("Task not found");
  }

  if (!canTransition(task.status, params.toStatus)) {
    throw new Error(`Cannot transition from ${task.status} to ${params.toStatus}`);
  }

  await prisma.task.update({
    where: { id: params.taskId },
    data: {
      status: params.toStatus,
      previousStatus: params.toStatus === "blocked" || params.toStatus === "stalled" ? task.status : task.previousStatus,
      transitions: {
        create: {
          fromStatus: task.status,
          toStatus: params.toStatus,
          reason: params.reason,
          requestedChanges: params.requestedChanges ? JSON.stringify(params.requestedChanges) : undefined,
          actorType: params.actorType ?? "human",
          actorAgentId: params.actorAgentId
        }
      }
    }
  });

  const updated = await getTask(params.taskId);
  if (!updated) {
    throw new Error("Task not found after transition");
  }

  await emitAgentEvent({
    type: "task_transitioned",
    targetAgentId: updated.currentOwnerAgentId,
    targetRole: updated.currentOwnerRole,
    taskId: updated.id,
    reason: params.reason ?? `Task moved from ${task.status} to ${params.toStatus}.`,
    payload: {
      fromStatus: task.status,
      toStatus: params.toStatus,
      requestedChanges: params.requestedChanges ?? []
    }
  });

  return updated;
}

export async function updateLease(taskId: string, agentId: string, status: AgentWorkStatus) {
  const task = await getTask(taskId);
  if (!task) {
    throw new Error("Task not found");
  }

  const now = new Date();
  const leaseUntil = new Date(now.getTime() + 30 * 60 * 1000);
  const existing = task.leases.find((lease) => lease.agentId === agentId);

  if (existing) {
    const lease = await prisma.taskLease.update({
      where: { id: existing.id },
      data: {
        status,
        leaseUntil: status === "released" || status === "completed" ? null : leaseUntil,
        lastHeartbeatAt: now
      }
    });

    return {
      id: lease.id,
      agentId: lease.agentId,
      status: lease.status as AgentWorkStatus,
      leaseUntil: lease.leaseUntil?.toISOString(),
      lastHeartbeatAt: lease.lastHeartbeatAt?.toISOString(),
      attempt: lease.attempt
    };
  }

  const lease = await prisma.taskLease.create({
    data: {
      taskId,
      agentId,
      status,
      leaseUntil,
      lastHeartbeatAt: now,
      attempt: task.leases.length + 1
    }
  });

  await prisma.task.update({
    where: { id: taskId },
    data: { currentOwnerAgentId: agentId }
  });

  return {
    id: lease.id,
    agentId: lease.agentId,
    status: lease.status as AgentWorkStatus,
    leaseUntil: lease.leaseUntil?.toISOString(),
    lastHeartbeatAt: lease.lastHeartbeatAt?.toISOString(),
    attempt: lease.attempt
  };
}

export async function acknowledgeTask(params: {
  taskId: string;
  agentId: string;
  understanding?: string;
  plan?: string[];
  confidence?: number;
  blockers?: string[];
}) {
  const lease = await updateLease(params.taskId, params.agentId, "acknowledged");

  if (params.understanding || params.plan?.length || params.blockers?.length || typeof params.confidence === "number") {
    await prisma.taskArtifact.create({
      data: {
        taskId: params.taskId,
        createdByAgentId: params.agentId,
        type: "plan",
        title: "Structured understanding",
        content: JSON.stringify({
          understanding: params.understanding,
          plan: params.plan ?? [],
          confidence: params.confidence,
          blockers: params.blockers ?? []
        })
      }
    });
  }

  await prisma.taskComment.create({
    data: {
      taskId: params.taskId,
      authorType: "agent",
      authorAgentId: params.agentId,
      body: params.understanding ? `Acknowledged: ${params.understanding}` : "Task acknowledged."
    }
  });

  return lease;
}

export async function claimTask(params: { taskId: string; agentId: string }) {
  const agent = await getAgent(params.agentId);
  if (!agent) {
    throw new Error("Agent not found");
  }

  const currentTasks = await listTasks();
  const activeOwnedTasks = currentTasks.filter(
    (task) =>
      task.currentOwnerAgentId === params.agentId &&
      task.id !== params.taskId &&
      taskHasAgentLease(task, params.agentId, capacityWorkerStatuses)
  );

  if (activeOwnedTasks.length >= agent.maxConcurrentTasks) {
    const lease = await updateLease(params.taskId, params.agentId, "queued");
    await prisma.taskComment.create({
      data: {
        taskId: params.taskId,
        authorType: "system",
        body: `${agent.name} is at max concurrency. Task queued instead of claimed.`
      }
    });
    return { lease, queued: true };
  }

  const lease = await updateLease(params.taskId, params.agentId, "claimed");
  await prisma.taskComment.create({
    data: {
      taskId: params.taskId,
      authorType: "agent",
      authorAgentId: params.agentId,
      body: "Task claimed."
    }
  });
  return { lease, queued: false };
}

export async function heartbeatTask(params: { taskId: string; agentId: string; note?: string }) {
  const lease = await updateLease(params.taskId, params.agentId, "in_progress");

  if (params.note) {
    await prisma.taskComment.create({
      data: {
        taskId: params.taskId,
        authorType: "agent",
        authorAgentId: params.agentId,
        body: `Heartbeat: ${params.note}`
      }
    });
  }

  return lease;
}

export async function releaseTask(params: { taskId: string; agentId: string; reason?: string }) {
  const lease = await updateLease(params.taskId, params.agentId, "released");

  await prisma.taskComment.create({
    data: {
      taskId: params.taskId,
      authorType: "agent",
      authorAgentId: params.agentId,
      body: params.reason ? `Released: ${params.reason}` : "Task released."
    }
  });

  return lease;
}

export async function reportProgress(params: {
  taskId: string;
  agentId: string;
  workerStatus: AgentWorkStatus;
  summary: string;
  nextAction?: string;
  needsResponse: boolean;
  expectedResponderRole?: AgentRole;
  handoffReady: boolean;
  continuationPrompt?: string;
}) {
  const report = await prisma.progressReport.create({
    data: {
      taskId: params.taskId,
      agentId: params.agentId,
      workerStatus: params.workerStatus,
      summary: params.summary,
      nextAction: params.nextAction,
      needsResponse: params.needsResponse,
      expectedResponderRole: params.expectedResponderRole,
      handoffReady: params.handoffReady,
      continuationPrompt: params.continuationPrompt
    }
  });

  await updateLease(params.taskId, params.agentId, params.workerStatus);

  await prisma.taskArtifact.create({
    data: {
      taskId: params.taskId,
      createdByAgentId: params.agentId,
      type: params.handoffReady ? "implementation_summary" : "plan",
      title: params.handoffReady ? "Handoff-ready progress report" : "Progress report",
      content: JSON.stringify({
        workerStatus: params.workerStatus,
        summary: params.summary,
        nextAction: params.nextAction,
        needsResponse: params.needsResponse,
        expectedResponderRole: params.expectedResponderRole,
        handoffReady: params.handoffReady,
        continuationPrompt: params.continuationPrompt
      })
    }
  });

  await prisma.taskComment.create({
    data: {
      taskId: params.taskId,
      authorType: "agent",
      authorAgentId: params.agentId,
      body: params.needsResponse
        ? `Waiting for ${params.expectedResponderRole ?? "response"}: ${params.summary}`
        : `Progress reported: ${params.summary}`
    }
  });

  return {
    id: report.id,
    agentId: report.agentId,
    workerStatus: report.workerStatus as AgentWorkStatus,
    summary: report.summary,
    nextAction: report.nextAction ?? undefined,
    needsResponse: report.needsResponse,
    expectedResponderRole: (report.expectedResponderRole as AgentRole | null) ?? undefined,
    handoffReady: report.handoffReady,
    continuationPrompt: report.continuationPrompt ?? undefined,
    createdAt: report.createdAt.toISOString()
  };
}

export async function listDispatchCandidates() {
  const tasks = await listTasks();
  return tasks.filter(
    (task) =>
      activeTaskStatuses.includes(task.status) &&
      Boolean(task.currentOwnerRole) &&
      !task.currentOwnerAgentId
  );
}

export async function getAgentWorkloads() {
  const [agents, tasks] = await Promise.all([listAgents(), listTasks()]);

  return agents.map((agent) => {
    const activeTasks = tasks.filter(
      (task) =>
        task.currentOwnerAgentId === agent.id &&
        task.status !== "done" &&
        taskHasAgentLease(task, agent.id, activeWorkerStatuses)
    );
    const capacityUsedTasks = tasks.filter(
      (task) =>
        task.currentOwnerAgentId === agent.id &&
        task.status !== "done" &&
        taskHasAgentLease(task, agent.id, capacityWorkerStatuses)
    );

    return {
      agent,
      activeTaskCount: activeTasks.length,
      capacityUsedCount: capacityUsedTasks.length,
      capacity: Math.max(agent.maxConcurrentTasks - capacityUsedTasks.length, 0),
      activeTasks: sortTasksForWorker(agent.id, activeTasks),
      capacityUsedTasks
    };
  });
}

export async function dispatchTasks() {
  const candidates = await listDispatchCandidates();
  const workloads = await getAgentWorkloads();
  const results: Array<{
    taskId: string;
    title: string;
    status: "assigned" | "queued" | "skipped";
    agentId?: string;
    agentName?: string;
    reason: string;
  }> = [];

  for (const task of candidates) {
    const role = task.currentOwnerRole;
    if (!role) {
      results.push({
        taskId: task.id,
        title: task.title,
        status: "skipped",
        reason: "Task has no owner role."
      });
      continue;
    }

    const matchingWorkloads = workloads
      .filter(({ agent }) => agent.status === "active" && agent.roles.includes(role))
      .sort((a, b) => b.capacity - a.capacity || a.activeTaskCount - b.activeTaskCount || a.agent.name.localeCompare(b.agent.name));

    const selected = matchingWorkloads[0];
    if (!selected) {
      await prisma.taskComment.create({
        data: {
          taskId: task.id,
          authorType: "system",
          body: `Dispatch skipped: no active agent has role ${role}.`
        }
      });
      results.push({
        taskId: task.id,
        title: task.title,
        status: "skipped",
        reason: `No active agent has role ${role}.`
      });
      continue;
    }

    const leaseStatus: AgentWorkStatus = selected.capacity > 0 ? "assigned" : "queued";
    const lease = await updateLease(task.id, selected.agent.id, leaseStatus);
    await emitAgentEvent({
      type: leaseStatus === "assigned" ? "task_assigned" : "task_queued",
      targetAgentId: selected.agent.id,
      taskId: task.id,
      reason:
        leaseStatus === "assigned"
          ? `Task dispatched to ${selected.agent.name}.`
          : `Task queued for ${selected.agent.name}; agent is at capacity.`,
      payload: {
        title: task.title,
        status: task.status,
        priority: task.priority,
        ownerRole: role,
        workerStatus: leaseStatus
      }
    });
    await prisma.taskComment.create({
      data: {
        taskId: task.id,
        authorType: "system",
        body:
          leaseStatus === "assigned"
            ? `Dispatched to ${selected.agent.name} for role ${role}.`
            : `Queued for ${selected.agent.name}; agent is at capacity.`
      }
    });

    selected.activeTaskCount += 1;
    selected.capacity = Math.max(selected.agent.maxConcurrentTasks - selected.activeTaskCount, 0);

    results.push({
      taskId: task.id,
      title: task.title,
      status: lease.status === "queued" ? "queued" : "assigned",
      agentId: selected.agent.id,
      agentName: selected.agent.name,
      reason:
        lease.status === "queued"
          ? "Agent matched but is at capacity."
          : "Agent matched by role and has capacity."
    });
  }

  return results;
}

export async function scanWatchdog(now = new Date()) {
  const staleTasks = await prisma.task.findMany({
    where: {
      status: { notIn: ["done", "stalled"] },
      leases: {
        some: {
          status: { in: activeWorkerStatuses },
          leaseUntil: { lt: now }
        }
      }
    },
    include: {
      leases: true
    }
  });

  const results = [];

  for (const task of staleTasks) {
    const expiredLeases = task.leases.filter(
      (lease) =>
        activeWorkerStatuses.includes(lease.status as AgentWorkStatus) &&
        lease.leaseUntil &&
        lease.leaseUntil.getTime() < now.getTime()
    );
    const reason = `Watchdog marked task stalled because ${expiredLeases.length} active lease(s) expired.`;

    await prisma.task.update({
      where: { id: task.id },
      data: {
        previousStatus: task.status,
        status: "stalled",
        comments: {
          create: {
            authorType: "system",
            body: reason
          }
        },
        transitions: {
          create: {
            fromStatus: task.status,
            toStatus: "stalled",
            reason,
            actorType: "system"
          }
        }
      }
    });

    results.push({
      taskId: task.id,
      title: task.title,
      fromStatus: task.status,
      toStatus: "stalled",
      expiredLeaseCount: expiredLeases.length,
      reason
    });
  }

  return results;
}
