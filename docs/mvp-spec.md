# AI Agents Board MVP 規格

本文將 AI Agents Board 從概念整理推進到可開發規格。MVP 目標是先建立自有平台的核心資料模型、API、前端管理介面與 Agent 協作流程，讓後續可以逐步接入真實 Codex、Claude、OpenClaw 等 Agent worker。

## 1. 已確認決策

- 第一版直接做自有平台 MVP，不以 GitHub Issues/Projects 作為主要 source of truth。
- 技術選型由開發者依專案需要規劃，優先選擇適合快速迭代且可長期維護的方案。
- MVP 先做人類可操作的工項平台與 Agent API 規格，真實 Agent worker loop 放到下一階段。
- 第一版只給單一使用者使用，不做完整多使用者、organization、RBAC。
- DB/API 使用英文 enum，前端顯示中文名稱。

## 2. MVP 目標

MVP 要完成一個可本機使用的 AI Agent 協作看板，支援：

- 管理 Agent、角色與能力。
- 建立、檢視、編輯工項。
- 以固定狀態機推進或退回工項。
- 記錄工項上下文、需求、驗收標準、問題、決策、交接內容。
- 支援 Agent claim、lease、heartbeat 的資料結構與 API。
- 支援 QA report 與 PM acceptance report。
- 在前端清楚呈現工項狀態、負責 Agent、阻塞問題與驗收結果。

MVP 不要求真實 Agent 已能自動開發，只要 API 與資料模型能讓 Agent 之後接入即可。

## 3. 非目標

MVP 暫不處理：

- 多使用者登入、組織管理、權限控管。
- 真實 Codex / Claude / OpenClaw worker 自動執行。
- RabbitMQ 實際整合。
- Telegram / Gmail 通知整合。
- GitHub PR / Issue 雙向同步。
- 複雜子任務依賴圖。
- 檔案上傳與大型 artifact 儲存。
- 完整 audit compliance 或企業級安全機制。

這些能力可在 MVP 穩定後逐步加入。

## 4. 建議技術架構

建議第一版使用：

- App framework: Next.js
- Language: TypeScript
- UI: React
- API: Next.js Route Handlers
- Database: PostgreSQL
- ORM: Prisma
- Styling: Tailwind CSS 或專案既有樣式系統

目前本機 MVP 先使用 Prisma + SQLite，讓專案不依賴外部 PostgreSQL 或 Docker 就能保存資料與驗證流程。之後若切換 PostgreSQL，需要把 Prisma datasource 改回 `postgresql`，並將目前以 `String` 保存的 enum / JSON 欄位調整為 PostgreSQL enum / Json。

## 5. 核心概念

### Task Platform Is Source Of Truth

本網站資料庫是工項資料的唯一真實來源，包含：

- 工項內容
- 目前狀態
- 負責 Agent
- 上下文與需求
- 驗收標準
- 問題與決策
- 狀態轉移歷史
- claim、lease、heartbeat
- QA 與驗收報告

### Agents Use API

Agent 不需要使用前端介面。Agent 透過 API：

- 查詢可處理工項。
- claim 工項。
- 取得工項上下文。
- 回報理解、問題、進度、artifact。
- heartbeat 續租。
- 發起狀態轉移。

### Human Uses Frontend

前端主要給人類負責人使用：

- 查看各階段工項。
- 查看哪些工項卡住。
- 管理 Agent。
- 編輯工項內容。
- 檢查 QA report 與 PM acceptance report。
- 查看 timeline 與 decision log。

## 6. 狀態模型

DB/API 使用英文 enum，前端顯示中文。

| Enum | 中文顯示 | 負責角色 | 說明 |
| --- | --- | --- | --- |
| `planning` | 規劃階段 | Human, PM Agent | 釐清需求與拆分工項 |
| `discussion` | 討論階段 | PM Agent, Engineer Agent | 討論功能細節與可行性 |
| `development` | 開發階段 | Engineer Agent | 實作功能 |
| `qa` | 驗測階段 | QA Agent | 檢查功能、程式碼與測試結果 |
| `acceptance` | 驗收階段 | PM Agent | 檢視 QA 報告與驗收結果 |
| `done` | 完工階段 | Human | 顯示成果與結案紀錄 |
| `blocked` | 阻塞 | Any | 等待釐清或人工介入 |
| `stalled` | 停滯 | System | lease 過期或長時間無進展 |

## 7. 允許狀態轉移

正常流程：

```text
planning -> discussion -> development -> qa -> acceptance -> done
```

允許退回：

```text
discussion -> planning
development -> discussion
qa -> development
acceptance -> qa
```

例外狀態：

```text
any active state -> blocked
blocked -> previous active state
development -> stalled
qa -> stalled
stalled -> discussion
stalled -> development
```

所有退回都必須填寫：

- `reason`
- `requestedChanges`
- `assignedToRole`

## 8. Agent 工作狀態

工項主狀態描述 workflow 階段；Agent 工作狀態描述該工項對某個 Agent 的處理狀況。

| Enum | 說明 |
| --- | --- |
| `assigned` | 已指派給 Agent，但 Agent 尚未確認 |
| `acknowledged` | Agent 已看到任務 |
| `queued` | Agent 忙碌中，任務已排隊 |
| `claimed` | Agent 已領取任務並取得 lease |
| `in_progress` | Agent 正在處理 |
| `released` | Agent 釋放任務 |
| `completed` | Agent 完成該階段工作 |
| `failed` | Agent 回報失敗 |

## 9. 資料模型初版

### agents

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | string / cuid | Agent ID |
| `name` | string | 顯示名稱 |
| `provider` | enum | `codex`, `claude`, `openclaw`, `manual`, `other` |
| `status` | enum | `active`, `paused`, `disabled` |
| `maxConcurrentTasks` | int | 同時處理工項數，MVP 預設 1 |
| `notes` | text | 備註 |
| `createdAt` | datetime | 建立時間 |
| `updatedAt` | datetime | 更新時間 |

### agent_roles

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | string / cuid | ID |
| `agentId` | string | Agent ID |
| `role` | enum | `pm`, `engineer`, `qa`, `reviewer`, `observer` |

### agent_capabilities

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | string / cuid | ID |
| `agentId` | string | Agent ID |
| `capability` | string | 例如 `typescript`, `react`, `api`, `tests`, `git` |

### tasks

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | string / cuid | 工項 ID |
| `title` | string | 標題 |
| `status` | enum | workflow 狀態 |
| `priority` | int | 優先級，數字越大越優先 |
| `currentOwnerAgentId` | string nullable | 目前負責 Agent |
| `currentOwnerRole` | enum nullable | 目前負責角色 |
| `previousStatus` | enum nullable | blocked/stalled 回復時使用 |
| `createdAt` | datetime | 建立時間 |
| `updatedAt` | datetime | 更新時間 |

### task_contexts

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `taskId` | string | 工項 ID |
| `goal` | text | 目標 |
| `background` | text | 背景 |
| `requirements` | json | 需求列表 |
| `constraints` | json | 限制列表 |
| `handoffNotes` | json | 交接重點 |

### acceptance_criteria

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | string / cuid | ID |
| `taskId` | string | 工項 ID |
| `description` | text | 驗收標準 |
| `checked` | boolean | 是否已確認 |

### task_questions

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | string / cuid | ID |
| `taskId` | string | 工項 ID |
| `askedByAgentId` | string nullable | 提問 Agent |
| `question` | text | 問題內容 |
| `status` | enum | `open`, `answered`, `cancelled` |
| `answer` | text nullable | 回答 |
| `createdAt` | datetime | 建立時間 |
| `answeredAt` | datetime nullable | 回答時間 |

### task_decisions

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | string / cuid | ID |
| `taskId` | string | 工項 ID |
| `decision` | text | 決策內容 |
| `decidedBy` | string | 決策者，MVP 可用文字 |
| `source` | string nullable | 來源 |
| `createdAt` | datetime | 建立時間 |

### task_comments

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | string / cuid | ID |
| `taskId` | string | 工項 ID |
| `authorType` | enum | `human`, `agent`, `system` |
| `authorAgentId` | string nullable | Agent 作者 |
| `body` | text | 內容 |
| `createdAt` | datetime | 建立時間 |

### task_leases

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | string / cuid | ID |
| `taskId` | string | 工項 ID |
| `agentId` | string | Agent ID |
| `status` | enum | Agent 工作狀態 |
| `leaseUntil` | datetime nullable | lease 到期時間 |
| `lastHeartbeatAt` | datetime nullable | 最後 heartbeat |
| `attempt` | int | 第幾次嘗試 |
| `createdAt` | datetime | 建立時間 |
| `updatedAt` | datetime | 更新時間 |

### task_transitions

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | string / cuid | ID |
| `taskId` | string | 工項 ID |
| `fromStatus` | enum nullable | 原狀態 |
| `toStatus` | enum | 新狀態 |
| `reason` | text nullable | 原因 |
| `requestedChanges` | json nullable | 要求修改 |
| `actorType` | enum | `human`, `agent`, `system` |
| `actorAgentId` | string nullable | Agent |
| `createdAt` | datetime | 建立時間 |

### task_artifacts

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | string / cuid | ID |
| `taskId` | string | 工項 ID |
| `createdByAgentId` | string nullable | 建立 Agent |
| `type` | enum | `plan`, `implementation_summary`, `qa_report`, `acceptance_report`, `link`, `log`, `other` |
| `title` | string | 標題 |
| `content` | json | 內容 |
| `url` | string nullable | 外部連結 |
| `createdAt` | datetime | 建立時間 |

### qa_reports

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | string / cuid | ID |
| `taskId` | string | 工項 ID |
| `agentId` | string nullable | QA Agent |
| `summary` | text | 摘要 |
| `checkedItems` | json | 檢查項目 |
| `commandsRun` | json | 執行命令 |
| `issuesFound` | json | 問題 |
| `recommendation` | enum | `pass`, `fail`, `needs_human_review` |
| `createdAt` | datetime | 建立時間 |

### acceptance_reports

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | string / cuid | ID |
| `taskId` | string | 工項 ID |
| `agentId` | string nullable | PM Agent |
| `summary` | text | 摘要 |
| `decision` | enum | `accepted`, `rejected`, `needs_more_qa` |
| `reason` | text nullable | 拒絕原因 |
| `createdAt` | datetime | 建立時間 |

## 10. API 規格初版

### Agents

```http
GET /api/agents
POST /api/agents
GET /api/agents/:id
PATCH /api/agents/:id
DELETE /api/agents/:id
```

### Tasks

```http
GET /api/tasks
POST /api/tasks
GET /api/tasks/:id
PATCH /api/tasks/:id
POST /api/tasks/:id/transition
```

### Task Context

```http
GET /api/tasks/:id/context
PUT /api/tasks/:id/context
POST /api/tasks/:id/acceptance-criteria
PATCH /api/tasks/:id/acceptance-criteria/:criteriaId
DELETE /api/tasks/:id/acceptance-criteria/:criteriaId
```

### Questions And Decisions

```http
POST /api/tasks/:id/questions
PATCH /api/tasks/:id/questions/:questionId
POST /api/tasks/:id/decisions
POST /api/tasks/:id/comments
```

### Agent Worker API

```http
GET /api/agents/me
GET /api/agents/me/tasks/available
GET /api/agents/me/tasks/current
POST /api/tasks/:id/acknowledge
POST /api/tasks/:id/claim
POST /api/tasks/:id/heartbeat
POST /api/tasks/:id/release
POST /api/tasks/:id/artifacts
POST /api/tasks/:id/reports/qa
POST /api/tasks/:id/reports/acceptance
```

MVP 可先用簡單 agent token 或 local-only header 模擬 Agent 身分，例如：

```http
X-Agent-Id: agent-codex-engineer-01
```

## 11. 前端頁面

### Dashboard

首頁顯示：

- 各狀態工項數量。
- blocked / stalled 工項。
- 目前 active agents。
- 最近狀態變更。

### Workflow Board

依狀態欄位顯示工項：

- 規劃
- 討論
- 開發
- 驗測
- 驗收
- 完工
- 阻塞
- 停滯

卡片應顯示：

- 標題
- 優先級
- 目前負責 Agent
- 目前負責角色
- 未解問題數
- 最近更新時間

### Task Detail

單一工項頁面包含：

- 基本資料與目前狀態。
- goal、background、requirements、constraints。
- acceptance criteria。
- open questions。
- decision log。
- comments。
- handoff notes。
- lease / heartbeat 狀態。
- artifacts。
- QA reports。
- acceptance reports。
- timeline。

### Blocked Tasks

專門顯示需要人類介入的項目：

- open questions。
- blocked tasks。
- stalled tasks。
- rejected acceptance。
- failed QA。

### Agent Admin

管理：

- Agent 基本資料。
- provider。
- roles。
- capabilities。
- status。
- max concurrent tasks。
- 目前負責工項。

### Reports

檢視：

- QA report。
- PM acceptance report。
- pass/fail 統計。
- 最近失敗原因。

## 12. 使用流程

### 建立工項

1. 人類或 PM Agent 建立工項。
2. 填入 title、goal、background、requirements、acceptance criteria。
3. 狀態為 `planning`。
4. 確認需求後轉到 `discussion`。

### 派工給工程師 Agent

1. PM Agent 或人類選擇負責 Agent。
2. 工項進入 `discussion` 或 `development`。
3. Agent acknowledge 並提交 structured understanding。
4. 若有問題，建立 question 並轉為 `blocked` 或退回 `discussion`。
5. 若無問題，Agent claim 並開始工作。

### 開發完成

1. 工程師 Agent 新增 implementation artifact。
2. 工項轉到 `qa`。
3. QA Agent claim 工項。

### 驗測

1. QA Agent 建立 QA report。
2. 若失敗，工項退回 `development`，附上 reason 與 requested changes。
3. 若通過，工項進入 `acceptance`。

### 驗收

1. PM Agent 檢視 QA report。
2. 若驗收失敗，退回 `qa`。
3. 若驗收通過，建立 acceptance report 並轉到 `done`。

## 13. Watchdog 規則

MVP 可先實作手動觸發或簡單定時 job。

檢查規則：

- `claimed` 或 `in_progress` 且 `leaseUntil` 已過期。
- `lastHeartbeatAt` 超過預期時間。
- `assigned` 後長時間沒有 acknowledged。
- `queued` 太久沒有 claimed。

處理方式：

- 標記 task 為 `stalled`。
- 新增 system comment。
- 保留 previousStatus。
- 前端 blocked/stalled view 顯示。

## 14. 第一階段開發任務

### Phase 1: Project Foundation

- 建立 Next.js + TypeScript 專案。
- 建立資料庫與 Prisma。
- 建立基礎 layout 與導航。
- 建立 enum 與狀態轉移規則。

### Phase 2: Agents

- 建立 Agent schema。
- 建立 Agent CRUD API。
- 建立 Agent Admin 前端。
- 支援 roles 與 capabilities。

### Phase 3: Tasks

- 建立 Task schema。
- 建立 Task CRUD API。
- 建立 Workflow Board。
- 建立 Task Detail。
- 實作狀態轉移驗證。

### Phase 4: Context And Collaboration Records

- 建立 task context。
- 建立 acceptance criteria。
- 建立 questions、decisions、comments。
- 建立 timeline。

### Phase 5: Agent Worker API

- 建立 available/current task API。
- 實作 acknowledge、claim、heartbeat、release。
- 實作 lease attempt 記錄。

### Phase 6: QA And Acceptance

- 建立 QA report API 與 UI。
- 建立 acceptance report API 與 UI。
- 實作 QA fail / acceptance reject 的退回流程。

### Phase 7: Blocked And Watchdog

- 建立 blocked tasks view。
- 實作簡單 watchdog scan。
- 顯示 stalled tasks。

## 15. 待後續決策

- 第一版資料庫開發環境使用 PostgreSQL 還是先 SQLite。
- 是否需要 local-only 簡易登入保護。
- Agent API 的 token 格式。
- Artifact 是否只存 JSON/link，還是要支援檔案上傳。
- 是否要在 MVP 後立刻接 RabbitMQ。
- 是否要先接 OpenClaw，還是先寫 mock worker。

## 17. Codex 工程師 Checkpoint 規則

Codex 類 Agent 可能在完成一段開發後回報並等待下一步。MVP 需要避免 PM / QA 誤判工項狀態，因此工項階段之外，還要保存 worker execution status。

新增 worker 狀態：

```text
progress_reported
waiting_for_pm
waiting_for_human
waiting_for_qa
blocked
completed
```

Agent progress report 應包含：

- `workerStatus`
- `summary`
- `nextAction`
- `needsResponse`
- `expectedResponderRole`
- `handoffReady`
- `continuationPrompt`

判斷原則：

- `needsResponse = false` 且 `handoffReady = false`: 只是進度回報，Agent 應繼續。
- `needsResponse = true`: 顯示在 Waiting / Blocked 視圖，交由指定角色回覆。
- `handoffReady = true`: 表示該階段可交棒，例如開發完成可進 QA。
- `workerStatus = completed`: 代表 Agent 真的完成該階段工作，不只是 checkpoint。

## 18. 建議下一步

下一步可以開始建立專案骨架，優先完成：

1. App scaffold。
2. Prisma schema。
3. 狀態 enum 與 transition guard。
4. Agent CRUD。
5. Task CRUD。
6. Workflow Board。

完成這些後，就能開始用人類操作方式模擬 PM、工程師、QA Agent 的完整工項流轉。
