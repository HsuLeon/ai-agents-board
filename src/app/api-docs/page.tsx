import Link from "next/link";
import { BookOpenCheck, Code2, KeyRound } from "lucide-react";
import { openApiSpec } from "@/lib/openapi";

export const dynamic = "force-static";

function methodClass(method: string) {
  return `method-badge method-${method.toLowerCase()}`;
}

function stringify(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function getRequestExample(operation: Record<string, any>) {
  return operation.requestBody?.content?.["application/json"]?.example;
}

function getResponseExample(operation: Record<string, any>) {
  const responses = operation.responses ?? {};
  const preferred = responses["200"] ?? responses["201"] ?? Object.values(responses)[0];
  return (preferred as any)?.content?.["application/json"]?.example;
}

const paths = Object.entries(openApiSpec.paths).flatMap(([path, methods]) =>
  Object.entries(methods).map(([method, operation]) => ({
    path,
    method,
    operation: operation as Record<string, any>,
    tag: ((operation as Record<string, any>).tags?.[0] ?? "API") as string
  }))
);

const grouped = paths.reduce<Record<string, typeof paths>>((groups, item) => {
  groups[item.tag] = [...(groups[item.tag] ?? []), item];
  return groups;
}, {});

export default function ApiDocsPage() {
  return (
    <>
      <section className="page-heading">
        <div>
          <h1>Agent API Docs</h1>
          <p>
            Swagger-compatible OpenAPI contract for worker adapters. Use this page for examples, and use the JSON endpoint
            for tooling.
          </p>
        </div>
        <div className="actions">
          <Link className="button primary" href="/api/openapi.json" target="_blank">
            <Code2 size={16} />
            OpenAPI JSON
          </Link>
          <Link className="button" href="/worker">
            <BookOpenCheck size={16} />
            Worker console
          </Link>
        </div>
      </section>

      <section className="grid-two">
        <div className="stack">
          {Object.entries(grouped).map(([tag, operations]) => (
            <section className="panel" key={tag}>
              <h2>{tag}</h2>
              <div className="stack">
                {operations.map(({ path, method, operation }) => {
                  const requestExample = getRequestExample(operation);
                  const responseExample = getResponseExample(operation);

                  return (
                    <article className="api-operation" id={`${method}-${path}`} key={`${method}-${path}`}>
                      <div className="api-operation-heading">
                        <span className={methodClass(method)}>{method.toUpperCase()}</span>
                        <code>{path}</code>
                      </div>
                      <h3>{operation.summary}</h3>
                      {operation.description ? <p className="muted">{operation.description}</p> : null}
                      {operation.security ? (
                        <div className="inline-list">
                          <span className="pill">
                            <KeyRound size={13} />
                            bearer token
                          </span>
                          <span className="pill">X-Agent-Id fallback</span>
                        </div>
                      ) : null}
                      {requestExample !== undefined ? (
                        <div>
                          <strong>Request example</strong>
                          <pre>{stringify(requestExample)}</pre>
                        </div>
                      ) : null}
                      {responseExample !== undefined ? (
                        <div>
                          <strong>Response example</strong>
                          <pre>{stringify(responseExample)}</pre>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <aside className="stack">
          <section className="panel">
            <h2>Authentication</h2>
            <p className="muted">Real workers should use bearer tokens. Local MVP scripts may use X-Agent-Id.</p>
            <pre>{`Authorization: Bearer <agent-token>
X-Agent-Id: agent-engineer-01`}</pre>
          </section>

          <section className="panel subtle-panel">
            <h2>Maintenance Rule</h2>
            <p>
              未來新增或修改 AI Agent 使用的 API 時，也要同步更新 <code>src/lib/openapi.ts</code>，並確認
              <code>/api/openapi.json</code> 與 <code>/api-docs</code> 正常。
            </p>
          </section>

          <section className="panel">
            <h2>Worker Loop</h2>
            <div className="stack">
              <p>1. GET current tasks</p>
              <p>2. GET available tasks</p>
              <p>3. Acknowledge task</p>
              <p>4. Claim task</p>
              <p>5. Heartbeat and progress</p>
              <p>6. Ask questions or submit reports</p>
            </div>
          </section>
        </aside>
      </section>
    </>
  );
}
