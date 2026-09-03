import assert from "node:assert/strict";
const { onRequestGet, onRequestPut } = await import("../functions/api/state.js");

const kv = new Map();
const env = { STATE: {
  getWithMetadata: async (k) => kv.get(k) ?? { value: null, metadata: null },
  put: async (k, value, { metadata }) => { kv.set(k, { value, metadata }); },
} };
const req = (method, { auth = true, ifMatch, body } = {}) => new Request("https://x/api/state", {
  method, body,
  headers: { ...(auth ? { "cf-access-authenticated-user-email": "a@b.kr" } : {}), ...(ifMatch !== undefined ? { "if-match": ifMatch } : {}) },
});
const state = JSON.stringify({ schemaVersion: 3, employees: [], months: {} });

assert.equal((await onRequestGet({ request: req("GET", { auth: false }), env })).status, 401);
assert.equal((await onRequestGet({ request: req("GET"), env })).status, 404);
assert.equal((await onRequestPut({ request: req("PUT", { body: "{" }), env })).status, 400);
assert.equal((await onRequestPut({ request: req("PUT", { body: "{}" }), env })).status, 400);
const first = await onRequestPut({ request: req("PUT", { body: state }), env });
assert.equal(first.status, 200);
const { revision } = await first.json();
assert.equal((await onRequestPut({ request: req("PUT", { body: state }), env })).status, 409, "빈 if-match는 충돌");
assert.equal((await onRequestPut({ request: req("PUT", { body: state, ifMatch: "stale" }), env })).status, 409);
const second = await onRequestPut({ request: req("PUT", { body: state, ifMatch: revision }), env });
assert.equal(second.status, 200);
const got = await (await onRequestGet({ request: req("GET"), env })).json();
assert.equal(got.revision, (await second.json()).revision);
assert.equal(got.savedBy, "a@b.kr");
assert.deepEqual(got.state, JSON.parse(state));
console.log("state-api ok");
