# AI Agent 協作網站設計整理

本文整理目前對「多 AI Agent 工項協作網站」的討論重點，並整合既有文件中的設計方向。核心目標是建立一個可追蹤、可交接、可驗收、可恢復的 AI 團隊協作平台，而不是單純的 Agent 聊天系統。

## 1. 核心定位

這個網站應該是一個 AI Agent workflow platform，負責管理多個 AI Agent 在同一個組織中的角色、工項、狀態流轉、交接紀錄、驗測報告與人工介入點。

Agent 可以包含 Codex、Claude、OpenClaw 或未來其他工具。它們主要透過 API 操作平台，不需要使用前端介面。前端介面主要提供給人類負責人檢視專案狀態、回答阻塞問題、管理 Agent 與驗收成果。

## 2. 主要角色

### 既有環境與整合假設

目前既有討論中可參考的環境背景如下：

- 目前已有 3 個 OpenClaw agents 可作為早期協作對象。
- 人類與 Agent 的可見溝通目前可透過 Telegram 呈現。
- Agent 與 Agent 之間目前已有 RabbitMQ 通訊，每個 OpenClaw agent 可有自己的 channel 或 inbox。
- OpenClaw agent 也可能具備 GitHub 與 Gmail 存取能力。
- `openclaw-agent` Python 專案未來需要強化 computer-use 能力，並以 Ubuntu 優先、Windows 其次的跨平台能力為目標。

這些背景不應直接綁死產品架構，但很適合作為第一版整合測試的假設。平台本身仍應以 Agent provider 無關的方式設計，讓 Codex、Claude、OpenClaw 或未來其他 Agent 都能透過同一組 API 參與協作。

### 人類負責人

- 與 PM Agent 討論需求與專案方向。
- 檢視整體工項狀態與 Agent 工作負載。
- 回答 Agent 無法自行決定的需求問題。
- 查看最終成果與重要決策紀錄。

### PM Agent

- 與人類負責人討論需求與細節。
- 將需求拆分成可執行的細節工項。
- 建立每個工項的目標、背景、需求、限制與驗收標準。
- 派發工項給適合的工程師 Agent 或 QA Agent。
- 在驗收階段檢視 QA 報告，決定是否進入完工。

### 工程師 Agent

- 接收 PM 派發的工項。
- 先回報對需求的理解與開發計畫。
- 若需求不清楚，提出問題並退回討論階段。
- 開始實作後持續回報 heartbeat、進度與結果。
- 完成後提供實作摘要、PR、commit 或相關 artifact。

### QA Agent

- 在驗測階段檢視程式碼與功能結果。
- 可行時執行測試、啟動程式或檢查畫面。
- 產出結構化 QA Report。
- 若不符合需求，退回開發階段並提供明確失敗原因。

## 3. 工項狀態機

工項狀態應該被設計成明確的 state machine，避免 Agent 任意跳轉狀態。

建議主要流程：

```text
規劃階段 -> 討論階段 -> 開發階段 -> 驗測階段 -> 驗收階段 -> 完工階段
```

允許的退回流程：

```text
討論階段 -> 規劃階段
開發階段 -> 討論階段
驗測階段 -> 開發階段
驗收階段 -> 驗測階段
```

各階段責任如下：

| 階段 | 主要負責者 | 目的 | 可能轉移 |
| --- | --- | --- | --- |
| 規劃階段 | 人類負責人、PM Agent | 釐清需求、拆分工項 | 進入討論階段 |
| 討論階段 | PM Agent、工程師 Agent | 討論功能細節與技術可行性 | 退回規劃或進入開發 |
| 開發階段 | 工程師 Agent | 實作功能與回報進度 | 退回討論或進入驗測 |
| 驗測階段 | QA Agent | 檢查功能、程式碼、測試結果 | 退回開發或進入驗收 |
| 驗收階段 | PM Agent | 檢視 QA 報告與驗收條件 | 退回驗測或進入完工 |
| 完工階段 | 系統、人類負責人 | 呈現成果與歷史紀錄 | 結案 |

## 4. 工項上下文包

單一細節工項不能只有標題與描述。它應該包含足夠的上下文，讓下游 Agent 能理解上游指示、需求重點與驗收方式。

建議欄位：

```json
{
  "id": "TASK-001",
  "title": "建立登入 API",
  "status": "development",
  "currentOwner": "agent-engineer-01",
  "currentRole": "engineer",
  "goal": "讓使用者可以使用 email/password 登入",
  "background": "此功能屬於使用者系統第一階段",
  "requirements": [],
  "acceptanceCriteria": [],
  "constraints": [],
  "openQuestions": [],
  "handoffNotes": [],
  "decisionLog": [],
  "qaReports": [],
  "pmReviewNotes": [],
  "artifacts": []
}
```

關鍵欄位說明：

- `goal`: 工項要達成的結果。
- `background`: 為什麼要做這件事。
- `requirements`: 明確需求。
- `acceptanceCriteria`: 怎樣才算完成。
- `constraints`: 技術、產品或流程限制。
- `openQuestions`: 等待釐清的問題。
- `handoffNotes`: 上游交接給下游的重點。
- `decisionLog`: 已確認的決策與理由。
- `artifacts`: Agent 產生的工作成果，例如 PR、測試報告、截圖、log。

## 5. 留言、問題與決策要分開

建議不要把所有內容都塞進 comments。平台應該區分：

- `comments`: 一般討論與補充。
- `questions`: 等待回答的阻塞問題。
- `decisions`: 已確認的重要決策。
- `handoffNotes`: 階段交接內容。
- `reports`: QA 或 PM 的正式報告。

這樣可以避免重要決策被埋在長篇對話紀錄裡。Agent 在取得工項上下文時，也可以直接讀取整理後的決策與驗收標準，而不是自己從聊天紀錄中推測。

決策紀錄範例：

```json
{
  "decision": "第一版不支援 Google OAuth，只支援 email/password",
  "decidedBy": "pm-agent",
  "source": "user-confirmation",
  "createdAt": "2026-05-23T23:30:00+08:00"
}
```

## 6. Agent 管理與能力模型

平台需要提供介面讓人類負責人增刪改查協作組織中的 Agent。

Agent 不應只有角色，也應該有能力模型：

```json
{
  "id": "agent-codex-engineer-01",
  "name": "Codex Engineer",
  "provider": "codex",
  "roles": ["engineer"],
  "capabilities": ["typescript", "react", "api", "tests", "git"],
  "status": "active",
  "maxConcurrentTasks": 1
}
```

建議欄位：

- `provider`: Codex、Claude、OpenClaw 等來源。
- `roles`: PM、engineer、QA、reviewer 等。
- `capabilities`: 技術或工作能力，例如 frontend、backend、testing、git。
- `status`: active、paused、disabled。
- `maxConcurrentTasks`: 同時可處理的工項數。
- `currentTaskIds`: 目前負責的工項。

PM Agent 派工時可依照角色與能力選擇適合的 Agent。

## 7. 任務領取、Lease 與 Heartbeat

Agent 不應只靠「看到任務屬於自己就開始做」。建議建立明確的 claim/lease 機制。

建議區分以下幾種 Agent 工作狀態，避免把「看到任務」誤認成「正在處理任務」：

```text
Acknowledged = Agent 已看到任務
Queued = Agent 已看到任務，但目前忙碌，稍後處理
Claimed = Agent 準備開始處理，已取得 lease
In Progress = Agent 正在實際執行任務
```

建議流程：

1. Agent 查詢可處理工項。
2. Agent 呼叫 claim API 領取工項。
3. 系統設定 `leaseOwner` 與 `leaseUntil`。
4. Agent 處理期間定期送 heartbeat。
5. 若 heartbeat 中斷或 lease 過期，watchdog 將工項標記為 stalled 或重新分派。

範例：

```json
{
  "taskId": "TASK-001",
  "status": "development",
  "leaseOwner": "agent-engineer-01",
  "leaseUntil": "2026-05-24T00:30:00+08:00",
  "lastHeartbeatAt": "2026-05-24T00:15:00+08:00",
  "currentAttempt": 2
}
```

這可以避免任務被多個 Agent 同時處理，也可以避免 Agent 當機後工項永久卡住。

當 Agent 正在忙碌時收到新任務，不應忽略通知，也不應直接中斷目前工作。建議行為是：

1. 拉取被指派的最新工項。
2. 判斷自己目前是否忙碌。
3. 若忙碌，將新任務 acknowledgement 寫回平台並標記為 queued。
4. 繼續完成目前任務。
5. 目前任務完成後，再領取下一個 queued 或 assigned task。

Agent worker loop 可先採用以下模式：

```text
on RabbitMQ wakeup:
  sync_assigned_tasks()
  if idle:
    claim_next_task()
  else:
    mark_new_tasks_queued()

on current task finished:
  mark_done()
  claim_next_task()

on heartbeat interval:
  renew_current_lease()
  sync_assigned_tasks()
  if idle:
    claim_next_task()
```

## 8. Agent 的第一回應應該是結構化理解

Agent 接到任務後，不應直接開始做。建議先寫回 structured understanding。

範例：

```json
{
  "event": "task.acknowledged",
  "taskId": "TASK-001",
  "agent": "agent-engineer-01",
  "understanding": "需要建立 email/password 登入 API，成功時回傳 token，失敗時回傳明確錯誤。",
  "plan": [
    "確認現有使用者資料表與密碼雜湊方式",
    "建立登入 endpoint",
    "補上 validation 與錯誤處理",
    "新增 API 測試"
  ],
  "confidence": 0.86,
  "blockers": []
}
```

對高風險任務，可以要求 PM Agent、人類負責人或另一個 Agent 先 review 這份理解，再允許進入開發。

## 9. 退回上一階段時必填原因與下一步

任何退回狀態都應強制填寫：

- `reason`: 為什麼退回。
- `requestedChanges`: 要修正或釐清什麼。
- `targetStage`: 退回到哪個階段。
- `assignedToRole`: 下一棒應由哪個角色處理。
- `acceptanceHint`: 下次如何判斷通過。

退回範例：

```json
{
  "fromStatus": "qa",
  "toStatus": "development",
  "reason": "登入失敗時未回傳正確 HTTP 401",
  "requestedChanges": [
    "密碼錯誤時回傳 401",
    "補上對應測試案例"
  ],
  "assignedToRole": "engineer"
}
```

## 10. QA Report 與 PM Acceptance Report

QA Agent 在驗測階段應產出正式報告，而不是只留下簡短留言。

QA Report 範例：

```json
{
  "summary": "驗測通過",
  "checkedItems": [
    "登入 API 成功時回傳 token",
    "密碼錯誤時回傳 401",
    "缺少 email 時回傳 validation error"
  ],
  "commandsRun": ["npm test", "npm run lint"],
  "evidence": [],
  "issuesFound": [],
  "recommendation": "pass"
}
```

PM Acceptance Report 應確認：

- QA 是否覆蓋所有 acceptance criteria。
- 工程師是否提供足夠 artifact。
- 是否仍有未解問題。
- 是否可進入完工階段。

## 11. API 設計方向

API 需要同時支援人類 UI 與 Agent worker，但 Agent-friendly endpoint 很重要。

建議 endpoint：

```http
GET /agents/me
GET /agents/me/tasks/available
GET /agents/me/tasks/current
POST /tasks/:id/claim
POST /tasks/:id/heartbeat
GET /tasks/:id/context
POST /tasks/:id/comments
POST /tasks/:id/questions
POST /tasks/:id/decisions
POST /tasks/:id/artifacts
POST /tasks/:id/transition
POST /tasks/:id/reports/qa
POST /tasks/:id/reports/acceptance
```

其中 `GET /tasks/:id/context` 應回傳整理好的上下文包，讓 Agent 不必自己拼裝多個資料來源。

## 12. 前端介面建議

前端主要給人類負責人使用，重點不是讓 Agent 看，而是讓人能快速掌握專案與阻塞點。

建議視圖：

- Workflow Board: 依狀態分欄，查看各工項所在階段。
- Agent Workload: 查看每個 Agent 正在做什麼、是否閒置、是否卡住。
- Blocked Tasks: 專門列出需要人類回答或 PM 介入的問題。
- Task Detail Timeline: 單一工項從規劃到完工的完整歷程。
- Decision Log: 所有已確認的重要決策。
- QA / Acceptance View: 查看 QA 報告與 PM 驗收意見。
- Agent Admin: 管理 Agent、角色、能力、啟用狀態。

其中最重要的是 Blocked Tasks，因為人類負責人最需要快速知道「現在有哪些事情需要我決定」。

## 13. 事件、通知與外部系統整合

既有文件中提到 RabbitMQ、GitHub、Telegram、Gmail 等工具。建議分工如下：

| 系統 | 責任 |
| --- | --- |
| Task Platform / 本網站資料庫 | 工項 durable source of truth |
| RabbitMQ | 喚醒 Agent、派工通知，不保存完整任務內容 |
| GitHub | 程式碼、Issue、PR、Review、Commit 歷史 |
| Telegram | 人類可見的重要事件與人工介入通知 |
| Gmail | 非同步通知、摘要或外部溝通 |
| Agent Worker | 從平台拉取任務、回報理解、進度、成果 |

重要原則：

```text
Task Platform = 工項內容、狀態、負責人、歷史、驗收標準的唯一真實來源
RabbitMQ = wakeup / notification
GitHub = code collaboration history
Telegram = human-visible mirror and intervention channel
```

RabbitMQ 訊息應該很小，只包含 task id、assignee、reason、revision 等資訊。Agent 收到 wakeup 後，應回到 task platform 拉取完整內容。

RabbitMQ message 範例：

```json
{
  "type": "task.wakeup",
  "taskId": "TASK-001",
  "assignee": "agent-engineer-01",
  "reason": "assigned_or_updated",
  "revision": 7
}
```

## 14. Watchdog 與失敗恢復

平台應該有 watchdog job 定期掃描異常狀態。

應檢查：

- 已 claim 但 lease 過期的工項。
- 開發中但 heartbeat 中斷的工項。
- 排隊太久未開始的工項。
- 派發後沒有 acknowledgement 的工項。
- 反覆退回或失敗的工項。

可能動作：

- 標記為 `stalled`。
- 通知 Telegram 或前端。
- 重新分派給其他 Agent。
- 要求 PM Agent 或人類負責人釐清。
- 要求 Codex 或 reviewer Agent 檢查卡住原因。

## 15. 資料庫核心表建議

MVP 可先使用關聯式資料庫，例如 PostgreSQL。

建議資料表：

- `agents`: Agent 基本資料、provider、狀態。
- `agent_roles`: Agent 可扮演的角色。
- `agent_capabilities`: Agent 能力標籤。
- `tasks`: 工項主資料與目前狀態。
- `task_contexts`: goal、background、requirements、constraints。
- `acceptance_criteria`: 驗收標準。
- `task_questions`: 待釐清問題。
- `task_decisions`: 決策紀錄。
- `task_comments`: 一般留言。
- `task_transitions`: 狀態轉移歷史。
- `task_leases`: claim、lease、heartbeat 資訊。
- `task_artifacts`: PR、測試報告、截圖、log 等成果。
- `qa_reports`: QA 驗測報告。
- `acceptance_reports`: PM 驗收報告。
- `events`: Agent event 與系統事件。

## 16. 平台選型

有兩條可行路線。

### 路線 A: 先使用 GitHub Issues / Projects 作為 MVP

優點：

- 適合軟體開發任務。
- PR、Review、Commit、Issue 自然連在一起。
- Codex 與 OpenClaw 類工具容易參與。
- 可快速驗證 workflow。

風險：

- GitHub Projects 對複雜 workflow、lease、watchdog metadata 的支援有限。
- 可能需要把 structured JSON 放在 issue body/comment 或另外建 metadata store。

### 路線 B: 建立自有 task platform

優點：

- 可完整控制狀態機、Agent 管理、lease、heartbeat、QA report。
- 前端可完全針對 AI Agent 協作設計。
- 長期更符合產品定位。

風險：

- 第一版開發成本較高。
- 需要自己處理權限、通知、整合與資料一致性。

建議策略：

```text
若目標是快速驗證流程，可先 GitHub Issues/Projects + 小型 Orchestrator。
若目標是打造長期產品，應以自有資料庫與 API 作為 source of truth。
```

## 17. MVP 範圍建議

第一版不需要做成完整 Jira 或 Slack。建議先完成：

1. Agent 管理：新增、編輯、停用 Agent，設定角色與能力。
2. Task 管理：建立工項、拆子工項、狀態流轉。
3. 工項上下文：需求、驗收標準、限制、問題、交接紀錄。
4. Agent API：查詢可處理工項、領取工項、更新狀態、回報問題。
5. Claim / Lease / Heartbeat：避免重複處理與永久卡住。
6. QA Report：驗測階段產生結構化報告。
7. PM Acceptance Report：驗收階段記錄通過或退回原因。
8. 前端看板：依狀態與負責 Agent 顯示工項。
9. Blocked Tasks 視圖：讓人類負責人快速回答卡住的問題。
10. Watchdog：掃描 stalled tasks 並通知。

## 18. 建議實作階段

### Phase 1: Collaboration Model

- 定義角色責任矩陣。
- 定義工項生命週期。
- 定義人類介入流程。
- 定義 Agent worker lifecycle。

### Phase 2: State Machine And Schema

- 建立 task state machine。
- 建立 task schema。
- 建立 agent event schema。
- 定義 lease、heartbeat、watchdog 規則。

### Phase 3: API And Database MVP

- 建立 agents、tasks、events、reports 等核心資料表。
- 實作 Agent-friendly API。
- 實作狀態轉移驗證。

### Phase 4: Frontend Board

- 建立 workflow board。
- 建立 task detail timeline。
- 建立 Agent workload 與 blocked tasks view。
- 建立 Agent admin。

### Phase 5: Orchestrator And Integrations

- 加入 RabbitMQ wakeup publisher。
- 加入 GitHub PR/Issue 連結。
- 加入 Telegram 通知。
- 加入 watchdog job。

## 19. 尚待決策的問題

- 第一版 source of truth 要用自有資料庫，還是先用 GitHub Issues/Projects？
- `Queued` 應該是全域任務狀態，還是 per-agent queue marker？
- Agent 是否允許同時處理多個工項？
- Lease timeout 預設要多長？
- 高風險任務的 structured understanding 由誰 review？
- 工項 priority 要由 PM Agent、人類負責人或系統自動決定？
- 子工項依賴關係是否要在 MVP 就支援？
- RabbitMQ wakeup 遺失時，Agent 應多久主動 poll 一次？
- Telegram 要同步所有事件，還是只同步阻塞、失敗、完工等重要事件？

## 20. 工作結論

這個系統最重要的設計原則是：

```text
不要把它做成 AI 聊天室。
要把它做成有狀態、有交接、有驗收、有責任邊界的 Agent workflow platform。
```

只要工項上下文、狀態機、Agent claim、lease、heartbeat、QA report、PM acceptance、decision log 這幾個核心概念穩定存在，即使未來 Agent 從 Codex、Claude、OpenClaw 換成其他工具，整個協作流程仍然可以持續運作。

## 21. Codex 類互動式工程師 Agent 的 checkpoint 問題

Codex 這類工程師 Agent 常見工作模式是「完成一個段落後回報，並等待下一步指示」。這對人機協作很自然，但放進多 Agent workflow 時，若沒有額外狀態，PM Agent 或 QA Agent 可能會誤以為工程師仍在開發，或誤以為工程師已完成可交棒，導致整體流程卡住。

因此平台不能只管理工項階段，還要管理 Agent 執行狀態。

### 回報不等於停工

Agent 的進度回報應明確區分：

```json
{
  "workerStatus": "progress_reported",
  "summary": "已完成 Agent CRUD 與 Task CRUD",
  "nextAction": "繼續實作 QA Report 與 Acceptance Report",
  "needsResponse": false,
  "handoffReady": false
}
```

這代表 Agent 只是回報進度，但仍應繼續，不需要 PM 或人類回覆。

若真的需要指示，應明確標記：

```json
{
  "workerStatus": "waiting_for_pm",
  "summary": "已完成基本 QA Report，但截圖保存策略未定",
  "nextAction": "等待 PM 決定是否支援截圖 artifact",
  "needsResponse": true,
  "expectedResponderRole": "pm",
  "question": "QA Report 是否需要支援截圖上傳？"
}
```

### 建議 Worker 狀態

```text
assigned
acknowledged
queued
claimed
in_progress
progress_reported
waiting_for_pm
waiting_for_human
waiting_for_qa
blocked
completed
released
failed
```

其中：

- `progress_reported`: 有進度回報，但 Agent 應繼續。
- `waiting_for_pm`: 等 PM Agent 回覆。
- `waiting_for_human`: 等人類負責人回覆。
- `waiting_for_qa`: 等 QA Agent 釐清或驗測。
- `completed`: 該階段真的完成，可交給下一階段。

### Continuation Contract

對 Codex 工程師，平台應保存可續跑內容：

```json
{
  "continuationPrompt": "繼續完成 task-123 的開發。上一輪已完成 Agent CRUD，下一步請實作 QA Report API 與 UI。不要等待使用者確認，除非遇到需求不明或高風險變更。",
  "needsHumanInput": false
}
```

這樣即使 Codex 停在一次回報後，平台仍能知道它不是完成，而是可續跑。

### PM / QA 應同時看工項階段與 Worker 狀態

PM 或 QA 不應只看：

```text
task.status = development
```

還應看：

```text
workerStatus = waiting_for_pm
needsResponse = true
expectedResponderRole = pm
```

也就是說，工項可能仍在開發階段，但實際阻塞責任在 PM 或人類。

### Agent 設定建議

Codex 工程師 Agent 可加入 execution mode：

```json
{
  "executionMode": "autonomous_until_blocked",
  "autoContinue": true,
  "checkpointInterval": "major_milestone"
}
```

初期建議使用 `autonomous_until_blocked`：只要沒有需求不明、測試失敗、破壞性操作或重大架構決策，Codex 工程師應繼續推進，不應每完成一小段就等待指示。
