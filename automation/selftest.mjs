// 다운로드 수집·검증 경로를 실제 Chrome으로 확인한다. 포털 대신 로컬 페이지에서 국민연금 산출내역 모양의 CSV를 받는다.
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const csv = "﻿국민연금\n순번,국민연금번호,주민번호,가입자명,정산사유,정산적용기간,결정보험료\n1,1,000000-0******,홍길동,1,2026.08 ~ 2026.08,224860\n";
const server = http.createServer((req, res) => {
  if (req.url.startsWith("/file")) { res.writeHead(200, { "content-type": "text/csv", "content-disposition": 'attachment; filename="pension.csv"' }); return res.end(csv); }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end('<a href="/file">Excel 다운로드</a><a href="/file" style="display:none">Excel 다운로드</a>');
}).listen(0);
const url = `http://localhost:${server.address().port}/`;
const out = fs.mkdtempSync(path.join(os.tmpdir(), "portal-selftest-"));
const siteFile = path.join(os.tmpdir(), "portal-selftest-site.json");
fs.writeFileSync(siteFile, JSON.stringify({ name: "셀프테스트", steps: [{ goto: url }, { download: "pension", text: "다운로드", find: ["Excel 다운로드"] }] }));
// spawnSync는 이벤트 루프를 막아 위 서버가 응답하지 못하므로 비동기로 기다린다.
const runOnce = () => new Promise((resolve) => {
  const child = spawn(process.execPath, ["download.mjs", "2026-08", "--site", "custom", "--site-file", siteFile, "--out", out, "--headless"], { cwd: path.dirname(fileURLToPath(import.meta.url)), stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PORTAL_DOWNLOAD_TIMEOUT: "20000" } });
  let stdout = "", stderr = "";
  child.stdout.on("data", (d) => { stdout += d; }); child.stderr.on("data", (d) => { stderr += d; });
  child.on("close", (status) => resolve({ status, stdout, stderr }));
});
const first = await runOnce(), second = await runOnce(); // 두 번째 실행은 이전 파일을 '이전/'으로 비켜 두어야 한다
server.close();
const files = fs.readdirSync(out).filter((f) => !f.startsWith(".") && fs.statSync(path.join(out, f)).isFile());
const olds = fs.existsSync(path.join(out, "이전")) ? fs.readdirSync(path.join(out, "이전")) : [];
console.log(second.stdout.trim().split("\n").slice(-4).join("\n"));
if (first.status !== 0 || second.status !== 0 || files.length !== 1 || olds.length !== 1 || !files[0].startsWith("2026-08_국민연금_산출내역") || !fs.readFileSync(path.join(out, files[0]), "utf8").includes("홍길동")) {
  console.error(first.stderr, second.stderr); console.error("셀프테스트 실패", { status: [first.status, second.status], files, olds }); process.exit(1);
}
console.log(`셀프테스트 통과: 자동 클릭 → 다운로드 수집 → 검증 → ${files[0]}, 재실행 시 이전 파일 보관`);
