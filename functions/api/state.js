// 공유 상태 저장 API (Cloudflare Pages Functions + Workers KV). 경로: /api/state
// 인증은 Pages 프로젝트에 건 Cloudflare Access가 담당한다. Access를 통과한 요청에만
// Cf-Access-Authenticated-User-Email 헤더가 붙으므로 그 존재만 확인한다. Access를 끄면 이 API는 잠긴다.
const KEY = "state";
const user = (request) => request.headers.get("cf-access-authenticated-user-email");

export async function onRequestGet({ request, env }) {
  if (!user(request)) return new Response("unauthorized", { status: 401 });
  const { value, metadata } = await env.STATE.getWithMetadata(KEY);
  if (value === null) return new Response("empty", { status: 404 });
  return Response.json({ revision: metadata.revision, savedAt: metadata.savedAt, savedBy: metadata.savedBy, state: JSON.parse(value) });
}

export async function onRequestPut({ request, env }) {
  const email = user(request);
  if (!email) return new Response("unauthorized", { status: 401 });
  const current = await env.STATE.getWithMetadata(KEY);
  const currentRevision = current.value === null ? "" : current.metadata.revision;
  // ponytail: KV는 최종 일관성이라 수 초 내 동시 저장은 둘 다 통과할 수 있다. 엄격히 막아야 하면 D1로 교체.
  if ((request.headers.get("if-match") || "") !== currentRevision) return new Response("conflict", { status: 409 });
  const body = await request.text();
  let parsed;
  try { parsed = JSON.parse(body); } catch { return new Response("bad json", { status: 400 }); }
  if (!parsed || !Number.isInteger(parsed.schemaVersion) || !Array.isArray(parsed.employees) || typeof parsed.months !== "object") return new Response("bad state", { status: 400 });
  const revision = crypto.randomUUID();
  await env.STATE.put(KEY, body, { metadata: { revision, savedAt: new Date().toISOString(), savedBy: email } });
  return Response.json({ revision });
}
