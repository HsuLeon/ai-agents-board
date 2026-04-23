# AI Agents Board

這個專案用來集中討論與設計未來的 AI 協作系統。

目前的核心場景是：多個 OpenClaw agents、Codex、人類操作者、GitHub、RabbitMQ、Telegram、Gmail，以及未來可能導入的任務平台，如何共同形成一個可追蹤、可恢復、可審查的協作工作流。

## Project Goal

設計一套讓多個 AI agents 可以可靠協作的任務與溝通系統。

重點不是只讓訊息送到 agent，而是確保：

- 任務內容有 durable source of truth。
- 任務狀態、owner、歷史紀錄、lease、heartbeat 都能被追蹤。
- Agent 看不懂、卡住、失聯、做錯方向時，系統能偵測並恢復。
- 人類可以透過 Telegram 或任務平台介入。
- Codex 可以作為設計者、reviewer、implementer、debugging partner 參與。

## Current Design Direction

目前工作結論：

- Task platform 是任務細節與狀態的 source of truth。
- RabbitMQ 只作為 wakeup / notification mechanism。
- Telegram 是 human-visible mirror 與 intervention channel。
- GitHub 保留 code、issue、PR、review、commit history。
- OpenClaw agent 應該像 durable worker，而不是 one-shot message consumer。
- Agent 必須先回報 structured understanding，再進入重要任務的實作。
- `Claimed` 與 `In Progress` 任務需要 lease 與 watchdog。

## Key Documents

- [OpenClaw collaboration workflow notes](./openclaw-collaboration-workflow-notes.md): 目前最完整的初始設計筆記。
- [Project roadmap](./docs/roadmap.md): 專案接下來要收斂的設計主題。
- [Decision log](./docs/decision-log.md): 已形成共識與仍待決策的紀錄。

## Design Questions To Resolve

- 第一版 durable task platform 要用 GitHub Issues/Projects、Plane，還是自建最小 schema？
- `Queued` 應該是全域任務狀態、per-agent queue 狀態，還是兩者都要？
- OpenClaw agent 是否允許同時處理多個任務？
- Lease timeout 與 watchdog 規則要怎麼定？
- 高風險任務的 first understanding response 要由誰 review？
- Telegram 要鏡像所有事件，還是只推送需要人類注意的事件？

## Suggested Working Style

這個 repo 可以先作為設計工作區：

1. 先收斂協作模型與狀態機。
2. 再定義 task schema、agent event schema、RabbitMQ wakeup schema。
3. 接著規劃 bridge / orchestrator 的 MVP。
4. 最後才開始拆 implementation tasks。

