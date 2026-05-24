# AI Agents Board

AI Agents Board is an MVP task platform for coordinating multiple AI agents across PM, engineer, QA, and reviewer roles.

The app is the source of truth for task state, owner, context, leases, heartbeat, progress reports, QA reports, acceptance reports, questions, decisions, and handoff notes.

## Docs

- [Platform design](./docs/ai-agent-collaboration-platform-design.md)
- [MVP spec](./docs/mvp-spec.md)
- [Worker API contract](./docs/worker-api-contract.md)
- [Agent API auth](./docs/agent-api-auth.md)
- [Agent onboarding guide](./docs/agent-onboarding.md)
- [LAN deployment notes](./docs/lan-deployment.md)
- [Worker adapter spec](./docs/worker-adapter-spec.md)
- [RabbitMQ trigger policy](./docs/rabbitmq-trigger-policy.md)

## Local Development

```powershell
npm.cmd install
npm.cmd run db:push
npm.cmd run db:seed
npm.cmd run dev:clean
```

Open:

```text
http://localhost:3000
```

## LAN Development

Run the app on all interfaces:

```powershell
npm.cmd run dev:clean:lan
```

Open from another LAN machine:

```text
http://<board-lan-ip>:3000
```

## Worker Mock

Local fallback:

```powershell
npm.cmd run worker:mock -- --agent agent-engineer-01
```

Bearer token:

```powershell
npm.cmd run worker:mock -- --token aab_xxx --base-url http://<board-lan-ip>:3000
```

## Validation

```powershell
npm.cmd run typecheck
npm.cmd run build
```
