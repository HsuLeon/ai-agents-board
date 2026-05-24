# Agent API Auth

Worker APIs now support two authentication modes.

## Preferred Mode

Real Codex, Claude, OpenClaw, or other worker runtimes should use:

```http
Authorization: Bearer <agent-token>
```

Agent tokens are generated from the Agent edit screen. The plaintext token is shown once after reset. The database stores only:

- `apiTokenHash`
- `tokenLastUsedAt`

## Local MVP Fallback

The local Worker Console and quick development scripts can still use:

```http
X-Agent-Id: <agent-id>
```

This keeps the MVP convenient while still giving real workers a safer integration path.

## Current Protected Endpoints

- `GET /api/agents/me`
- `GET /api/agents/me/inbox`
- `GET /api/agents/me/tasks/available`
- `GET /api/agents/me/tasks/current`
- `GET /api/agents/me/questions`
- `POST /api/tasks/:id/acknowledge`
- `POST /api/tasks/:id/claim`
- `POST /api/tasks/:id/heartbeat`
- `POST /api/tasks/:id/progress`
- `POST /api/tasks/:id/release`
- `POST /api/tasks/:id/questions`
- `PATCH /api/tasks/:id/questions/:questionId`
- `POST /api/tasks/:id/decisions`
- `POST /api/tasks/:id/reports/qa`
- `POST /api/tasks/:id/reports/acceptance`

## Worker Console

The `/worker` page can test either mode:

- Leave the token field empty to use `X-Agent-Id`.
- Paste a generated token to use `Authorization: Bearer`.

The CLI mock worker can also test either mode:

```powershell
npm.cmd run worker:mock -- --agent agent-engineer-01
npm.cmd run worker:mock -- --token aab_xxx
```
