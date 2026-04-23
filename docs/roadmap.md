# Project Roadmap

這份 roadmap 用來把 AI 協作系統的討論拆成可推進的設計階段。

## Phase 1: Collaboration Model

目標：先定義「誰負責什麼」與「任務怎麼流動」。

要產出的內容：

- Channel responsibility matrix。
- Agent worker lifecycle。
- Human intervention flow。
- Codex participation model。
- Failure recovery model。

目前已知方向：

- RabbitMQ 不作為任務 source of truth。
- Task platform 負責 durable state。
- OpenClaw agent 必須回寫 acknowledgement、understanding、plan、heartbeat、result。
- Watchdog 必須能偵測 stalled work。

## Phase 2: State Machine And Schema

目標：定義任務狀態、事件、lease、queue、優先權與重試模型。

要產出的內容：

- Task state machine。
- Task schema。
- Agent event schema。
- RabbitMQ wakeup message schema。
- Lease and heartbeat rules。
- Watchdog actions。

重要待決策：

- `Queued` 是否是 global status 或 per-agent queue marker。
- `Acknowledged`、`Claimed`、`In Progress` 的明確邊界。
- Lease timeout 預設值。
- Stalled task 的自動處理流程。

## Phase 3: Platform Choice

目標：決定第一版 durable task platform。

候選：

- GitHub Issues / Projects。
- Plane。
- Jira。
- Minimal custom task store。

初步傾向：

- 如果第一版重點是軟體開發 workflow，GitHub Issues / Projects 最容易啟動。
- 如果需要更完整的 board 與 workflow state machine，Plane 值得評估。
- Jira 可能太重，除非後續有明確需求。

## Phase 4: Orchestrator MVP

目標：建立 task orchestrator / collaboration bridge 的 MVP。

MVP 能力：

- 監聽任務 assignment / update。
- 對指定 OpenClaw 發送 RabbitMQ wakeup。
- 要求 OpenClaw 從 task platform 拉完整任務。
- 接收或讀取 OpenClaw 的 acknowledgement、heartbeat、result。
- 將重要事件鏡像到 Telegram。
- 定期 watchdog 掃描 stalled tasks。

## Phase 5: Implementation Tasks

目標：把設計拆成實作 issue。

可能的第一批 tasks：

- 定義 task schema。
- 定義 agent event schema。
- 建立 GitHub Issue label / template。
- 建立 RabbitMQ wakeup publisher。
- 建立 OpenClaw worker loop contract。
- 建立 watchdog scan job。
- 建立 Telegram event filter。

