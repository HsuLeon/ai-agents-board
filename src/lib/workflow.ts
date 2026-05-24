import type { TaskStatus } from "./types";

export const taskStatusLabels: Record<TaskStatus, string> = {
  planning: "規劃階段",
  discussion: "討論階段",
  development: "開發階段",
  qa: "驗測階段",
  acceptance: "驗收階段",
  done: "完工階段",
  blocked: "阻塞",
  stalled: "停滯"
};

export const taskStatusOrder: TaskStatus[] = [
  "planning",
  "discussion",
  "development",
  "qa",
  "acceptance",
  "done",
  "blocked",
  "stalled"
];

export const activeTaskStatuses: TaskStatus[] = [
  "planning",
  "discussion",
  "development",
  "qa",
  "acceptance"
];

export const allowedTransitions: Record<TaskStatus, TaskStatus[]> = {
  planning: ["discussion", "blocked"],
  discussion: ["planning", "development", "blocked"],
  development: ["discussion", "qa", "blocked", "stalled"],
  qa: ["development", "acceptance", "blocked", "stalled"],
  acceptance: ["qa", "done", "blocked"],
  done: [],
  blocked: ["planning", "discussion", "development", "qa", "acceptance"],
  stalled: ["discussion", "development", "blocked"]
};

export function canTransition(from: TaskStatus, to: TaskStatus) {
  return allowedTransitions[from].includes(to);
}

export function transitionRequiresReason(from: TaskStatus, to: TaskStatus) {
  const regressions: Array<[TaskStatus, TaskStatus]> = [
    ["discussion", "planning"],
    ["development", "discussion"],
    ["qa", "development"],
    ["acceptance", "qa"]
  ];

  return to === "blocked" || to === "stalled" || regressions.some(([a, b]) => a === from && b === to);
}
