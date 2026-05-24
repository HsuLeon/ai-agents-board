export type AgentProvider = "codex" | "claude" | "openclaw" | "manual" | "other";
export type AgentStatus = "active" | "paused" | "disabled";
export type AgentRole = "pm" | "engineer" | "qa" | "reviewer" | "observer";

export type TaskStatus =
  | "planning"
  | "discussion"
  | "development"
  | "qa"
  | "acceptance"
  | "done"
  | "blocked"
  | "stalled";

export type AgentWorkStatus =
  | "assigned"
  | "acknowledged"
  | "queued"
  | "claimed"
  | "in_progress"
  | "progress_reported"
  | "waiting_for_pm"
  | "waiting_for_engineer"
  | "waiting_for_human"
  | "waiting_for_qa"
  | "blocked"
  | "released"
  | "completed"
  | "failed";

export type Agent = {
  id: string;
  name: string;
  provider: AgentProvider;
  status: AgentStatus;
  roles: AgentRole[];
  capabilities: string[];
  maxConcurrentTasks: number;
  notes?: string;
  hasApiToken: boolean;
  tokenLastUsedAt?: string;
};

export type AgentEvent = {
  id: string;
  type: string;
  targetAgentId?: string;
  targetRole?: AgentRole;
  taskId?: string;
  questionId?: string;
  reason?: string;
  payload: unknown;
  publishStatus: "pending" | "published" | "skipped" | "failed";
  publishMessage?: string;
  publishedAt?: string;
  acknowledgedAt?: string;
  createdAt: string;
};

export type TaskContext = {
  goal: string;
  background: string;
  requirements: string[];
  constraints: string[];
  handoffNotes: string[];
};

export type AcceptanceCriterion = {
  id: string;
  description: string;
  checked: boolean;
};

export type TaskQuestion = {
  id: string;
  question: string;
  status: "open" | "answered" | "cancelled";
  answer?: string;
  askedByAgentId?: string;
  targetRole?: AgentRole;
  targetAgentId?: string;
  answeredByAgentId?: string;
  answeredAt?: string;
  resolvedAt?: string;
  createdAt: string;
};

export type TaskDecision = {
  id: string;
  decision: string;
  decidedBy: string;
  source?: string;
  createdAt: string;
};

export type TaskComment = {
  id: string;
  authorType: "human" | "agent" | "system";
  authorAgentId?: string;
  body: string;
  createdAt: string;
};

export type TaskLease = {
  id: string;
  agentId: string;
  status: AgentWorkStatus;
  leaseUntil?: string;
  lastHeartbeatAt?: string;
  attempt: number;
};

export type TaskArtifact = {
  id: string;
  type: "plan" | "implementation_summary" | "qa_report" | "acceptance_report" | "link" | "log" | "other";
  title: string;
  content: unknown;
  url?: string;
  createdByAgentId?: string;
  createdAt: string;
};

export type QaReport = {
  id: string;
  agentId?: string;
  summary: string;
  checkedItems: string[];
  commandsRun: string[];
  issuesFound: string[];
  recommendation: "pass" | "fail" | "needs_human_review";
  createdAt: string;
};

export type ProgressReport = {
  id: string;
  agentId: string;
  workerStatus: AgentWorkStatus;
  summary: string;
  nextAction?: string;
  needsResponse: boolean;
  expectedResponderRole?: AgentRole;
  handoffReady: boolean;
  continuationPrompt?: string;
  createdAt: string;
};

export type AcceptanceReport = {
  id: string;
  agentId?: string;
  summary: string;
  decision: "accepted" | "rejected" | "needs_more_qa";
  reason?: string;
  createdAt: string;
};

export type TaskTransition = {
  id: string;
  fromStatus?: TaskStatus;
  toStatus: TaskStatus;
  reason?: string;
  requestedChanges?: string[];
  actorType: "human" | "agent" | "system";
  actorAgentId?: string;
  createdAt: string;
};

export type Task = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: number;
  currentOwnerAgentId?: string;
  currentOwnerRole?: AgentRole;
  previousStatus?: TaskStatus;
  context: TaskContext;
  acceptanceCriteria: AcceptanceCriterion[];
  questions: TaskQuestion[];
  decisions: TaskDecision[];
  comments: TaskComment[];
  leases: TaskLease[];
  artifacts: TaskArtifact[];
  progressReports: ProgressReport[];
  qaReports: QaReport[];
  acceptanceReports: AcceptanceReport[];
  transitions: TaskTransition[];
  createdAt: string;
  updatedAt: string;
};
