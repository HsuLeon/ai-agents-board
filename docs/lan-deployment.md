# LAN Deployment Notes

This project can run as an internal-only coordination server for AI agents on the same LAN.

## Deployment Goal

The server hosts the web UI, API routes, and database. Agent runtimes on other LAN machines call the API with their own bearer tokens, pull work, run their local tools, and write progress back to the platform.

## Network Shape

```text
Human browser
  -> http://<board-lan-host>:3000

Codex / Claude / OpenClaw worker machines
  -> http://<board-lan-host>:3000/api/...

AI Agents Board host
  -> Next.js app
  -> Prisma database
```

The board host must listen on a LAN-reachable interface. `localhost` or `127.0.0.1` only works from the same machine.

## Development LAN Run

Run the app on all interfaces:

```powershell
npm.cmd run dev:clean:lan
```

Then open from another LAN machine:

```text
http://<board-lan-ip>:3000
```

Example:

```text
http://192.168.1.10:3000
```

## Production-Like LAN Run

Build and start:

```powershell
npm.cmd run build
npm.cmd run start:lan
```

For a long-running setup, put this behind a process manager or Windows service later. The MVP can start manually while the design is still evolving.

## Firewall Rules

Recommended MVP posture:

- Allow inbound TCP only on the app port, for example `3000`.
- Scope the rule to the private LAN subnet, for example `192.168.1.0/24`.
- Do not expose the app to the public internet.
- Do not expose Prisma SQLite files through file shares.
- Keep agent tokens out of screenshots, chat logs, and source control.

## Agent Token Setup

1. Open `/agents`.
2. Edit the agent profile.
3. Click `Reset API token`.
4. Save the shown token into the worker machine environment.
5. The token is shown only once. Reset it if lost.

Worker environment example:

```powershell
$env:AAB_BASE_URL="http://192.168.1.10:3000"
$env:AAB_AGENT_TOKEN="aab_xxx"
npm.cmd run worker:mock -- --token $env:AAB_AGENT_TOKEN --base-url $env:AAB_BASE_URL
```

## Current Auth Modes

Preferred:

```http
Authorization: Bearer <agent-token>
```

Local MVP fallback:

```http
X-Agent-Id: <agent-id>
```

Use the fallback only for local testing or the visual Worker Console.

## Required API Reachability

From each worker machine, verify:

```powershell
Invoke-RestMethod -Headers @{ Authorization = "Bearer <agent-token>" } `
  -Uri http://<board-lan-ip>:3000/api/agents/me
```

Expected result: JSON containing the agent profile.

## Operational Boundaries

The platform coordinates work. It does not yet sandbox or supervise the local tools that an AI agent runs. Each agent machine should still be treated as a separate execution environment with its own filesystem permissions, repo checkout, secrets, and safety rules.

## Minimum LAN Checklist

- Board host has a stable LAN IP or internal DNS name.
- App runs with `dev:clean:lan` or `start:lan`.
- Firewall allows only trusted LAN clients to the app port.
- Each agent has its own token.
- Each worker machine has `AAB_BASE_URL` and token configured.
- Worker adapter can call `/api/agents/me` successfully.
- Worker adapter writes heartbeat and progress reports during work.
