const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const now = new Date();
const leaseUntil = new Date(now.getTime() + 30 * 60 * 1000);

async function main() {
  await prisma.acceptanceReport.deleteMany();
  await prisma.qaReport.deleteMany();
  await prisma.taskArtifact.deleteMany();
  await prisma.taskTransition.deleteMany();
  await prisma.taskLease.deleteMany();
  await prisma.taskComment.deleteMany();
  await prisma.taskDecision.deleteMany();
  await prisma.taskQuestion.deleteMany();
  await prisma.acceptanceCriteria.deleteMany();
  await prisma.taskContext.deleteMany();
  await prisma.task.deleteMany();
  await prisma.agentCapability.deleteMany();
  await prisma.agentRoleRecord.deleteMany();
  await prisma.agent.deleteMany();

  await prisma.agent.create({
    data: {
      id: "agent-pm-01",
      name: "Claude PM",
      provider: "claude",
      status: "active",
      maxConcurrentTasks: 1,
      notes: "負責需求拆解、工項交接與驗收判斷。",
      roles: { create: [{ role: "pm" }] },
      capabilities: {
        create: [{ capability: "requirements" }, { capability: "planning" }, { capability: "handoff" }]
      }
    }
  });

  await prisma.agent.create({
    data: {
      id: "agent-engineer-01",
      name: "Codex Engineer",
      provider: "codex",
      status: "active",
      maxConcurrentTasks: 1,
      notes: "負責實作、程式碼修改與技術規劃。",
      roles: { create: [{ role: "engineer" }, { role: "reviewer" }] },
      capabilities: {
        create: [
          { capability: "typescript" },
          { capability: "react" },
          { capability: "api" },
          { capability: "tests" },
          { capability: "git" }
        ]
      }
    }
  });

  await prisma.agent.create({
    data: {
      id: "agent-qa-01",
      name: "OpenClaw QA",
      provider: "openclaw",
      status: "paused",
      maxConcurrentTasks: 1,
      notes: "未來用於驗測畫面、操作流程與測試報告。",
      roles: { create: [{ role: "qa" }] },
      capabilities: {
        create: [{ capability: "browser" }, { capability: "manual-test" }, { capability: "reporting" }]
      }
    }
  });

  await prisma.task.create({
    data: {
      id: "task-001",
      title: "建立 Agent 管理與能力模型",
      status: "development",
      priority: 90,
      currentOwnerAgentId: "agent-engineer-01",
      currentOwnerRole: "engineer",
      context: {
        create: {
          goal: "讓人類負責人可以管理協作組織中的 Agent、角色與能力。",
          background: "Agent 派工需要知道每個 Agent 的 provider、role、capability 與啟用狀態。",
          requirements: JSON.stringify([
            "支援新增、檢視、編輯 Agent",
            "支援 roles 與 capabilities",
            "前端可看到 active、paused、disabled 狀態"
          ]),
          constraints: JSON.stringify(["MVP 先不做多人權限", "provider 使用固定 enum"]),
          handoffNotes: JSON.stringify(["下游 API 需要能依 role 查詢可用 Agent。"])
        }
      },
      acceptanceCriteria: {
        create: [
          { id: "ac-001", description: "Agent Admin 能列出所有 Agent" },
          { id: "ac-002", description: "每個 Agent 顯示 provider、role、capability 與 status" }
        ]
      },
      decisions: {
        create: [
          {
            id: "dec-001",
            decision: "MVP 先採單一使用者，不做 organization/RBAC。",
            decidedBy: "human",
            source: "planning discussion",
            createdAt: now
          }
        ]
      },
      leases: {
        create: [
          {
            id: "lease-001",
            agentId: "agent-engineer-01",
            status: "in_progress",
            leaseUntil,
            lastHeartbeatAt: now,
            attempt: 1
          }
        ]
      },
      transitions: {
        create: [
          {
            id: "tr-001",
            fromStatus: "discussion",
            toStatus: "development",
            actorType: "human",
            createdAt: now
          }
        ]
      },
      createdAt: now,
      updatedAt: now
    }
  });

  await prisma.task.create({
    data: {
      id: "task-002",
      title: "定義工項狀態機與轉移規則",
      status: "qa",
      priority: 85,
      currentOwnerAgentId: "agent-qa-01",
      currentOwnerRole: "qa",
      context: {
        create: {
          goal: "確保工項只能依允許流程前進或退回。",
          background: "Agent 不能任意跳過驗測或驗收階段。",
          requirements: JSON.stringify(["建立 workflow enum", "建立 transition guard", "退回時必填原因"]),
          constraints: JSON.stringify(["DB/API 使用英文 enum", "UI 顯示中文 label"]),
          handoffNotes: JSON.stringify(["QA 應檢查非法轉移是否被擋下。"])
        }
      },
      acceptanceCriteria: {
        create: [
          { id: "ac-003", description: "正常流程 planning 到 done 可依序推進", checked: true },
          { id: "ac-004", description: "development 不能直接轉 done" }
        ]
      },
      createdAt: now,
      updatedAt: now
    }
  });

  await prisma.task.create({
    data: {
      id: "task-003",
      title: "確認 Agent API token 策略",
      status: "blocked",
      priority: 65,
      currentOwnerRole: "pm",
      previousStatus: "discussion",
      context: {
        create: {
          goal: "決定 MVP 中 Agent 呼叫 API 時如何辨識身分。",
          background: "MVP 是單人本機使用，可先用簡化 header，但後續要能升級成 token。",
          requirements: JSON.stringify(["定義 X-Agent-Id header", "保留未來 agent token 欄位"]),
          constraints: JSON.stringify(["暫不做完整 OAuth 或多使用者登入"]),
          handoffNotes: JSON.stringify(["需要人類確認是否接受 local-only header。"])
        }
      },
      acceptanceCriteria: {
        create: [{ id: "ac-005", description: "API 文件明確描述 Agent 身分識別方式" }]
      },
      questions: {
        create: [
          {
            id: "q-001",
            question: "MVP 是否接受使用 X-Agent-Id header 作為本機 Agent 身分？",
            targetRole: "pm",
            status: "open",
            createdAt: now
          }
        ]
      },
      createdAt: now,
      updatedAt: now
    }
  });

  await prisma.task.create({
    data: {
      id: "task-004",
      title: "Dispatch unowned engineer task",
      status: "discussion",
      priority: 70,
      currentOwnerRole: "engineer",
      context: {
        create: {
          goal: "Provide a seed task that can be assigned by the orchestrator.",
          background: "This task has an owner role but no owner agent, so dispatch can match it to Codex Engineer.",
          requirements: JSON.stringify(["Dispatch should select an active engineer", "Dispatch should create an assigned lease"]),
          constraints: JSON.stringify(["No worker should be required before dispatch"]),
          handoffNotes: JSON.stringify(["Use this task to verify orchestrator dispatch."])
        }
      },
      acceptanceCriteria: {
        create: [{ id: "ac-006", description: "Dispatch assigns this task to an active engineer agent." }]
      },
      createdAt: now,
      updatedAt: now
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
