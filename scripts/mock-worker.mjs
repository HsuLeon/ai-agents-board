#!/usr/bin/env node

const activeTaskStatuses = new Set(["planning", "discussion", "development", "qa", "acceptance"]);
const capacityStatuses = new Set([
  "claimed",
  "in_progress",
  "progress_reported",
  "waiting_for_pm",
  "waiting_for_engineer",
  "waiting_for_human",
  "waiting_for_qa",
  "blocked"
]);
const workerStatusRank = {
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
  queued: 7
};

function parseArgs(argv) {
  const args = {
    baseUrl: process.env.AAB_BASE_URL || "http://localhost:3000",
    agentId: process.env.AAB_AGENT_ID || "",
    token: process.env.AAB_AGENT_TOKEN || "",
    taskId: "",
    mode: "checkpoint",
    drain: false,
    releaseCurrent: false,
    heartbeat: true,
    verbose: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--base-url" && next) {
      args.baseUrl = next;
      index += 1;
    } else if (arg === "--agent" && next) {
      args.agentId = next;
      index += 1;
    } else if (arg === "--token" && next) {
      args.token = next;
      index += 1;
    } else if (arg === "--task" && next) {
      args.taskId = next;
      index += 1;
    } else if (arg === "--mode" && next) {
      args.mode = next;
      index += 1;
    } else if (arg === "--drain") {
      args.drain = true;
    } else if (arg === "--release-current") {
      args.releaseCurrent = true;
    } else if (arg === "--no-heartbeat") {
      args.heartbeat = false;
    } else if (arg === "--verbose") {
      args.verbose = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`
Mock Worker Runner

Usage:
  npm run worker:mock -- --agent agent-engineer-01
  npm run worker:mock -- --token aab_xxx

Options:
  --base-url <url>    API base URL. Defaults to AAB_BASE_URL or http://localhost:3000.
  --agent <id>        Local fallback agent id. Also supports AAB_AGENT_ID.
  --token <token>     Preferred bearer token. Also supports AAB_AGENT_TOKEN.
  --task <id>         Force a specific task id.
  --mode <mode>       checkpoint, question, waiting_pm, complete, fail, qa-pass, qa-fail, accept, or reject.
  --drain             After releasing or completing one task, try to pick the next task.
  --release-current   Release the highest-priority current capacity task before picking work.
  --no-heartbeat      Skip heartbeat call.
  --verbose           Print full JSON responses.
`);
}

function buildHeaders(args) {
  const headers = {
    "Content-Type": "application/json"
  };

  if (args.token) {
    headers.Authorization = `Bearer ${args.token}`;
  } else if (args.agentId) {
    headers["X-Agent-Id"] = args.agentId;
  } else {
    throw new Error("Provide --token, --agent, AAB_AGENT_TOKEN, or AAB_AGENT_ID.");
  }

  return headers;
}

async function request(args, path, options = {}) {
  const response = await fetch(new URL(path, args.baseUrl), {
    ...options,
    headers: {
      ...buildHeaders(args),
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${path} failed (${response.status}): ${JSON.stringify(body)}`);
  }

  if (args.verbose) {
    console.log(`${options.method || "GET"} ${path}`);
    console.log(JSON.stringify(body, null, 2));
  }

  return body;
}

function pickTask(tasks, forcedTaskId) {
  const activeTasks = tasks.filter((task) => activeTaskStatuses.has(task.status));

  if (forcedTaskId) {
    return activeTasks.find((task) => task.id === forcedTaskId) || tasks.find((task) => task.id === forcedTaskId);
  }

  return sortTasks(activeTasks)[0] || sortTasks(tasks)[0];
}

function latestLeaseForTask(task) {
  return [...(task.leases || [])].sort((a, b) => {
    const aTime = a.lastHeartbeatAt || a.leaseUntil || "";
    const bTime = b.lastHeartbeatAt || b.leaseUntil || "";
    return bTime.localeCompare(aTime);
  })[0];
}

function taskWorkerStatus(task) {
  return latestLeaseForTask(task)?.status || "";
}

function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    const aRank = workerStatusRank[taskWorkerStatus(a)] ?? 99;
    const bRank = workerStatusRank[taskWorkerStatus(b)] ?? 99;
    return aRank - bRank || b.priority - a.priority || String(b.updatedAt).localeCompare(String(a.updatedAt));
  });
}

function isCapacityTask(task) {
  return capacityStatuses.has(taskWorkerStatus(task));
}

async function findTask(args) {
  const current = await request(args, "/api/agents/me/tasks/current");
  const currentTask = pickTask(current.tasks || [], args.taskId);
  if (currentTask) {
    return { task: currentTask, source: "current" };
  }

  const available = await request(args, "/api/agents/me/tasks/available");
  const availableTask = pickTask(available.tasks || [], args.taskId);
  if (availableTask) {
    return { task: availableTask, source: "available" };
  }

  if (args.taskId) {
    const taskDetail = await request(args, `/api/tasks/${args.taskId}`);
    if (taskDetail.task && activeTaskStatuses.has(taskDetail.task.status)) {
      return { task: taskDetail.task, source: "direct" };
    }
  }

  return { task: undefined, source: "none" };
}

async function releaseCurrentCapacityTask(args) {
  const current = await request(args, "/api/agents/me/tasks/current");
  const task = sortTasks(current.tasks || []).find(isCapacityTask);
  if (!task) {
    console.log("No current capacity task to release.");
    return undefined;
  }

  await request(args, `/api/tasks/${task.id}/release`, {
    method: "POST",
    body: JSON.stringify({ reason: "Mock worker released current capacity task before draining queue." })
  });

  console.log(`Released current capacity task ${task.id}.`);
  return task;
}

function questionTargetRole(agent) {
  if ((agent.roles || []).includes("qa")) {
    return "engineer";
  }

  if ((agent.roles || []).includes("engineer")) {
    return "pm";
  }

  return "pm";
}

function progressPayload(task, mode, agent) {
  if (mode === "question") {
    const targetRole = questionTargetRole(agent);
    return {
      workerStatus: targetRole === "engineer" ? "waiting_for_engineer" : "waiting_for_pm",
      summary: `Mock worker asked ${targetRole} a question for ${task.id}.`,
      nextAction: `Wait for the ${targetRole} answer, then continue from the decision log.`,
      needsResponse: true,
      expectedResponderRole: targetRole,
      handoffReady: true,
      continuationPrompt: `Resume ${task.id} after the open question is answered and converted into a decision if needed.`
    };
  }

  if (mode === "waiting_pm") {
    return {
      workerStatus: "waiting_for_pm",
      summary: `Mock worker needs PM input before continuing ${task.id}.`,
      nextAction: "Wait for PM decision and resume from the latest progress report.",
      needsResponse: true,
      expectedResponderRole: "pm",
      handoffReady: true,
      continuationPrompt: `Resume ${task.id} after PM resolves the open decision.`
    };
  }

  if (mode === "complete") {
    return {
      workerStatus: "completed",
      summary: `Mock worker completed its assigned slice for ${task.id}.`,
      nextAction: "Move the task to the next workflow stage when artifacts are accepted.",
      needsResponse: false,
      handoffReady: true,
      continuationPrompt: `Review artifacts and progress reports for ${task.id}.`
    };
  }

  if (mode === "fail") {
    return {
      workerStatus: "failed",
      summary: `Mock worker failed while processing ${task.id}.`,
      nextAction: "Inspect the latest report and reassign or retry.",
      needsResponse: true,
      expectedResponderRole: "pm",
      handoffReady: true,
      continuationPrompt: `Resume ${task.id} by reading the failure report and deciding retry steps.`
    };
  }

  return {
    workerStatus: "progress_reported",
    summary: `Mock worker checkpoint for ${task.id}. PM response is not required.`,
    nextAction: "Continue the next implementation step and report another checkpoint.",
    needsResponse: false,
    handoffReady: true,
    continuationPrompt: `Continue ${task.id} by reading task context, latest progress report, artifacts, and open questions.`
  };
}

function qaPayload(task, recommendation) {
  return {
    summary:
      recommendation === "pass"
        ? `Mock QA passed ${task.id}.`
        : `Mock QA found issues in ${task.id}.`,
    checkedItems: ["Task context reviewed", "Acceptance criteria reviewed"],
    commandsRun: ["mock-worker qa check"],
    issuesFound: recommendation === "fail" ? [`Mock issue for ${task.id}`] : [],
    recommendation
  };
}

function acceptancePayload(task, decision) {
  return {
    summary:
      decision === "accepted"
        ? `Mock PM accepted ${task.id}.`
        : `Mock PM rejected ${task.id}.`,
    decision,
    reason: decision === "accepted" ? undefined : `Mock acceptance issue for ${task.id}.`
  };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const agent = await request(args, "/api/agents/me");
  if (args.releaseCurrent) {
    await releaseCurrentCapacityTask(args);
  }

  const { task, source } = await findTask(args);

  if (!task) {
    console.log(`No available task for ${agent.agent.name}.`);
    return;
  }

  console.log(`Worker ${agent.agent.name} picked ${task.id} from ${source}: ${task.title}`);

  if (args.mode === "qa-pass" || args.mode === "qa-fail") {
    const recommendation = args.mode === "qa-pass" ? "pass" : "fail";
    const result = await request(args, `/api/tasks/${task.id}/reports/qa`, {
      method: "POST",
      body: JSON.stringify(qaPayload(task, recommendation))
    });
    console.log(JSON.stringify({ agentId: agent.agent.id, taskId: task.id, qaRecommendation: result.report.recommendation }, null, 2));
    return;
  }

  if (args.mode === "accept" || args.mode === "reject") {
    const decision = args.mode === "accept" ? "accepted" : "rejected";
    const result = await request(args, `/api/tasks/${task.id}/reports/acceptance`, {
      method: "POST",
      body: JSON.stringify(acceptancePayload(task, decision))
    });
    console.log(JSON.stringify({ agentId: agent.agent.id, taskId: task.id, acceptanceDecision: result.report.decision }, null, 2));
    return;
  }

  await request(args, `/api/tasks/${task.id}/acknowledge`, {
    method: "POST",
    body: JSON.stringify({
      understanding: `Mock worker read task ${task.id} and can proceed with an API-only workflow.`,
      plan: ["Read task context", "Claim or resume the task", "Send heartbeat", "Write progress report"],
      confidence: 0.8,
      blockers: []
    })
  });

  const claim = await request(args, `/api/tasks/${task.id}/claim`, {
    method: "POST"
  });

  if (claim.queued) {
    console.log(`Task ${task.id} queued because the agent is at concurrency limit.`);
    return;
  }

  if (args.heartbeat) {
    await request(args, `/api/tasks/${task.id}/heartbeat`, {
      method: "POST",
      body: JSON.stringify({ note: "Mock worker heartbeat." })
    });
  }

  if (args.mode === "question") {
    const targetRole = questionTargetRole(agent.agent);
    await request(args, `/api/tasks/${task.id}/questions`, {
      method: "POST",
      body: JSON.stringify({
        question: `Mock worker question for ${task.id}: should this task continue with the current implementation approach?`,
        targetRole
      })
    });
  }

  const progress = await request(args, `/api/tasks/${task.id}/progress`, {
    method: "POST",
    body: JSON.stringify(progressPayload(task, args.mode, agent.agent))
  });

  console.log(
    JSON.stringify(
      {
        agentId: agent.agent.id,
        taskId: task.id,
        workerStatus: progress.report.workerStatus,
        needsResponse: progress.report.needsResponse,
        reportId: progress.report.id
      },
      null,
      2
    )
  );

  if (args.drain) {
    const next = await findTask(args);
    if (!next.task || next.task.id === task.id) {
      console.log("No next queued or assigned task to drain.");
      return;
    }

    console.log(`Drain candidate: ${next.task.id} from ${next.source}: ${next.task.title}`);
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
