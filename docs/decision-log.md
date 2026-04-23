# Decision Log

這份文件用來記錄 AI 協作系統設計中已經形成的共識與待決策事項。

## Accepted

### RabbitMQ is not the source of truth

RabbitMQ 只負責 wakeup / dispatch notification，不保存完整任務內容，也不作為任務狀態的 durable record。

原因：

- RabbitMQ message 被消費後就不應依賴它保存任務細節。
- Agent 如果看不懂、失敗、卡住，任務不能因此消失。
- 任務內容、狀態、owner、history、acceptance criteria 必須存在 task platform。

### Task platform owns durable task state

任務平台負責保存：

- Task details。
- Status。
- Assignee / owner。
- Acceptance criteria。
- Agent acknowledgement。
- Understanding and plan。
- Heartbeat。
- Lease。
- Attempt count。
- Completion result。
- History。

### Agents must acknowledge with understanding

OpenClaw agent 在進入重要任務前，必須先回寫 structured understanding。

這可以降低 agent 誤解任務後直接執行的風險，也讓人類、Codex 或其他 agent 有機會提前 review。

## Proposed

### Use GitHub Issues / Projects for the first MVP

理由：

- OpenClaw agents 已經有 GitHub access。
- Codex 可以自然透過 GitHub issue、PR、review 參與。
- 軟體開發任務的 traceability 最完整。
- 不需要一開始就部署新平台。

尚未決定：

- GitHub Projects 是否足以表達 queue、lease、watchdog metadata。
- 是否需要在 issue body/comment 中保存 structured JSON。
- 是否需要額外的小型 metadata store。

### Use leases for claimed and active work

`Claimed` 與 `In Progress` 任務應該都有 `lease_owner` 與 `lease_until`。

尚未決定：

- 預設 lease duration。
- Heartbeat interval。
- Lease expired 後是否自動 reassign。
- 多次 stalled 後是否升級給人類。

## Open

- `Queued` 是全域 status、per-agent field，還是兩者並存？
- Agent 是否可以同時處理多個任務？
- 高風險任務由誰 review first understanding？
- Telegram 事件要全部鏡像，還是只鏡像重要事件？
- Watchdog 要以固定 interval 執行，還是由 task update 觸發？
- 任務 priority 是人類手動設定、平台排序，還是 agent 可建議調整？

