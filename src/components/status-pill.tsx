import { taskStatusLabels } from "@/lib/workflow";
import type { TaskStatus } from "@/lib/types";

export function StatusPill({ status }: { status: TaskStatus }) {
  return <span className={`pill status-${status}`}>{taskStatusLabels[status]}</span>;
}
