import { taskStatusLabels } from "./workflow";
import type { Task } from "./types";

export type ActivityItem = {
  id: string;
  at: string;
  type: "transition" | "question" | "decision" | "qa" | "acceptance" | "artifact";
  title: string;
  body?: string;
};

export function taskActivity(task: Task): ActivityItem[] {
  const items: ActivityItem[] = [];

  for (const transition of task.transitions) {
    items.push({
      id: `transition-${transition.id}`,
      at: transition.createdAt,
      type: "transition",
      title: transition.fromStatus
        ? `${taskStatusLabels[transition.fromStatus]} -> ${taskStatusLabels[transition.toStatus]}`
        : `Created in ${taskStatusLabels[transition.toStatus]}`,
      body: transition.reason
    });
  }

  for (const question of task.questions) {
    items.push({
      id: `question-${question.id}`,
      at: question.createdAt,
      type: "question",
      title: question.status === "answered" ? "Question answered" : "Question opened",
      body: question.answer ? `${question.question} / ${question.answer}` : question.question
    });
  }

  for (const decision of task.decisions) {
    items.push({
      id: `decision-${decision.id}`,
      at: decision.createdAt,
      type: "decision",
      title: `Decision by ${decision.decidedBy}`,
      body: decision.decision
    });
  }

  for (const comment of task.comments) {
    items.push({
      id: `comment-${comment.id}`,
      at: comment.createdAt,
      type: comment.authorType === "system" ? "transition" : "artifact",
      title: `${comment.authorType} comment`,
      body: comment.body
    });
  }

  for (const report of task.qaReports) {
    items.push({
      id: `qa-${report.id}`,
      at: report.createdAt,
      type: "qa",
      title: `QA report: ${report.recommendation}`,
      body: report.summary
    });
  }

  for (const report of task.progressReports) {
    items.push({
      id: `progress-${report.id}`,
      at: report.createdAt,
      type: "artifact",
      title: `Progress: ${report.workerStatus}`,
      body: report.nextAction ? `${report.summary} / Next: ${report.nextAction}` : report.summary
    });
  }

  for (const report of task.acceptanceReports) {
    items.push({
      id: `acceptance-${report.id}`,
      at: report.createdAt,
      type: "acceptance",
      title: `Acceptance: ${report.decision}`,
      body: report.reason ? `${report.summary} / ${report.reason}` : report.summary
    });
  }

  for (const artifact of task.artifacts) {
    items.push({
      id: `artifact-${artifact.id}`,
      at: artifact.createdAt,
      type: "artifact",
      title: `Artifact: ${artifact.title}`
    });
  }

  return items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}
