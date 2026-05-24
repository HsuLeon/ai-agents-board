import type { AgentWorkStatus, Task } from "./types";

export const activeWorkerStatuses: AgentWorkStatus[] = [
  "assigned",
  "acknowledged",
  "queued",
  "claimed",
  "in_progress",
  "progress_reported",
  "waiting_for_pm",
  "waiting_for_engineer",
  "waiting_for_human",
  "waiting_for_qa",
  "blocked"
];

export const capacityWorkerStatuses: AgentWorkStatus[] = [
  "claimed",
  "in_progress",
  "progress_reported",
  "waiting_for_pm",
  "waiting_for_engineer",
  "waiting_for_human",
  "waiting_for_qa",
  "blocked"
];

export const resumableWorkerStatuses: AgentWorkStatus[] = [
  "claimed",
  "in_progress",
  "progress_reported",
  "waiting_for_pm",
  "waiting_for_engineer",
  "waiting_for_human",
  "waiting_for_qa",
  "blocked",
  "assigned",
  "acknowledged",
  "queued"
];

export function latestLeaseForAgent(task: Task, agentId: string) {
  return task.leases
    .filter((lease) => lease.agentId === agentId)
    .sort((a, b) => {
      const aTime = a.lastHeartbeatAt ?? a.leaseUntil ?? "";
      const bTime = b.lastHeartbeatAt ?? b.leaseUntil ?? "";
      return bTime.localeCompare(aTime);
    })[0];
}

export function taskHasAgentLease(task: Task, agentId: string, statuses: AgentWorkStatus[]) {
  const latestLease = latestLeaseForAgent(task, agentId);
  return latestLease ? statuses.includes(latestLease.status) : false;
}

export function getTaskWorkerStatusForAgent(task: Task, agentId: string) {
  return latestLeaseForAgent(task, agentId)?.status;
}

export function sortTasksForWorker(agentId: string, tasks: Task[]) {
  const rank: Record<AgentWorkStatus, number> = {
    claimed: 0,
    in_progress: 1,
    progress_reported: 2,
    waiting_for_pm: 3,
    waiting_for_engineer: 3,
    waiting_for_human: 3,
    waiting_for_qa: 3,
    blocked: 4,
    assigned: 5,
    acknowledged: 6,
    queued: 7,
    released: 8,
    completed: 9,
    failed: 10
  };

  return [...tasks].sort((a, b) => {
    const aStatus = getTaskWorkerStatusForAgent(a, agentId);
    const bStatus = getTaskWorkerStatusForAgent(b, agentId);
    const aRank = aStatus ? rank[aStatus] : 99;
    const bRank = bStatus ? rank[bStatus] : 99;
    return aRank - bRank || b.priority - a.priority || b.updatedAt.localeCompare(a.updatedAt);
  });
}
