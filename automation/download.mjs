// 4대보험 포털 자료 반자동 다운로드.
// 사용: node download.mjs [YYYY-MM] [--site jingsu|total|edi] [--browser chrome|msedge] [--out 폴더]
// 로그인은 담당자가 한다. 스크립트는 메뉴 이동을 시도하고, 다운로드를 받아 원본자료/YYYY-MM/에 검증 후 저장한다.
import { chromium } from "playwright";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { SITES, SITE_ORDER, KIND_LABELS } from "./sites.mjs";

const require = createRequire(import.meta.url);
const Importers = require("../importers.js");
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const now = new Date();
const month = args.find((a) => /^\d{4}-\d{2}$/.test(a)) || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
if (opt("--site-file")) SITES.custom = JSON.parse(fs.readFileSync(opt("--site-file"), "utf8")); // 셀프테스트·현장 보강용 외부 정의
const siteKeys = opt("--site") ? [opt("--site")] : SITE_ORDER;
const outDir = path.resolve(opt("--out", path.join(repoRoot, "원본자료", month)));
const reviewDir = path.join(outDir, "확인필요"), oldDir = path.join(outDir, "이전");
const headless = args.includes("--headless");
const profileDir = path.join(here, ".profile");
const osDownloads = path.join(os.homedir(), "Downloads");
const CLICK_TIMEOUT = 4000, DOWNLOAD_TIMEOUT = Number(process.env.PORTAL_DOWNLOAD_TIMEOUT || 10 * 60 * 1000);

for (const key of siteKeys) if (!SITES[key]) { console.error(`모르는 사이트: ${key}. 가능한 값: ${Object.keys(SITES).join(", ")}`); process.exit(2); }
fs.mkdirSync(outDir, { recursive: true });

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const waitEnter = (text) => new Promise((resolve) => rl.question(`\n  ▶ ${text}\n    끝나면 Enter를 누르세요. `, () => resolve()));
const log = (text) => console.log(text);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 다운로드는 컨텍스트 단위로 받는다(팝업·iframe에서 시작한 것 포함). 로그인 전에 등록해야 빠른 클릭도 놓치지 않는다.
const pending = [];
let waiter = null;
function onDownload(download) { if (waiter) { const w = waiter; waiter = null; w.resolve(download); } else pending.push(download); }
function nextDownload(timeout) {
  if (pending.length) return Promise.resolve(pending.shift());
  return new Promise((resolve, reject) => {
    waiter = { resolve, reject };
    setTimeout(() => { if (waiter?.resolve === resolve) { waiter = null; reject(new Error("timeout")); } }, timeout);
  });
}
function cancelWait() { if (waiter) { waiter.reject(new Error("cancelled")); waiter = null; } }

// 보안모듈이 브라우저를 거치지 않고 저장하는 경우를 위해 OS 다운로드 폴더의 새 파일·바뀐 파일도 지켜본다.
function snapshotDownloads() {
  const map = new Map();
  try { for (const f of fs.readdirSync(osDownloads)) { try { const s = fs.statSync(path.join(osDownloads, f)); map.set(f, `${s.size}:${s.mtimeMs}`); } catch {} } } catch {}
  return map;
}
async function watchFolder(before, deadline) {
  while (Date.now() < deadline) {
    await sleep(1000);
    const fresh = [...snapshotDownloads()].filter(([f, sig]) => before.get(f) !== sig && /\.(xlsx|xls|csv)$/i.test(f));
    if (!fresh.length) continue;
    const file = path.join(osDownloads, fresh[0][0]);
    // 크기와 수정시각이 두 번 연속 같으면 쓰기가 끝난 것으로 본다.
    try {
      let last = fs.statSync(file), stable = 0;
      while (stable < 2 && Date.now() < deadline) { await sleep(1000); const cur = fs.statSync(file); stable = cur.size === last.size && cur.mtimeMs === last.mtimeMs ? stable + 1 : 0; last = cur; }
      if (stable >= 2) return file;
    } catch { /* 사라졌으면 다음 폴링 */ }
  }
  throw new Error("timeout");
}

function sniff(file) {
  const head = Buffer.alloc(8); const fd = fs.openSync(file, "r"); fs.readSync(fd, head, 0, 8, 0); fs.closeSync(fd);
  if (head.subarray(0, 2).toString("latin1") === "PK") return "xlsx";
  if (head.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]))) return "xls";
  return "csv";
}
// 앱(importers.js)이 이 파일을 기대한 자료로 인식하는지, 자료 월이 다르지 않은지 확인한다. 원래 파일명으로 검사해야 파일명 속 월도 반영된다.
async function verify(file, ext, kind, originalName) {
  if (ext === "xls") return { ok: false, note: "구형 xls 형식입니다. Excel에서 xlsx로 다시 저장해야 앱에서 읽을 수 있습니다." };
  try {
    const sheets = ext === "xlsx"
      ? await Importers.readXlsx(((b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))(fs.readFileSync(file)))
      : [{ name: "표", rows: ((t) => Importers.parseDelimited(t, t.includes("\t") ? "\t" : ","))(Importers.decodeText(fs.readFileSync(file))) }];
    const analysis = Importers.analyzeSheets(sheets, originalName);
    const kinds = analysis.groups.map((g) => g.kind);
    if (!kinds.includes(kind)) return { ok: false, note: kinds.length ? `기대한 자료(${KIND_LABELS[kind]})가 아니라 ${kinds.map((k) => KIND_LABELS[k] || k).join(", ")}로 인식됩니다.` : "앱이 인식하는 표를 찾지 못했습니다." };
    if (analysis.month && analysis.month !== month) return { ok: false, note: `자료의 월(${analysis.month})이 급여월(${month})과 다릅니다. 포털에서 월을 다시 선택하세요.` };
    return { ok: true, note: `인식된 자료: ${KIND_LABELS[kind]}${analysis.month ? `, 월 ${analysis.month}` : ""}` };
  } catch (error) { return { ok: false, note: `내용 확인 실패: ${error.message}` }; }
}
function place(source, dir, base, ext) {
  fs.mkdirSync(dir, { recursive: true });
  let target = path.join(dir, `${base}.${ext}`), n = 2;
  while (fs.existsSync(target)) target = path.join(dir, `${base}-${n++}.${ext}`);
  fs.renameSync(source, target);
  return target;
}
async function store(kind, temp, originalName) {
  const ext = sniff(temp), size = fs.statSync(temp).size;
  const check = size < 64 ? { ok: false, note: `파일이 너무 작습니다(${size}바이트). 오류 페이지일 수 있습니다.` } : await verify(temp, ext, kind, originalName);
  const base = `${month}_${KIND_LABELS[kind]}`;
  if (!check.ok) return { kind, ok: false, size, file: place(temp, reviewDir, base, ext), note: check.note };
  // 같은 자료를 다시 받으면 이전 파일은 '이전/'으로 비켜 두어 폴더 전체를 끌어놓아도 중복되지 않게 한다.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  for (const other of fs.readdirSync(outDir)) if (other.startsWith(`${base}.`)) place(path.join(outDir, other), oldDir, `${base}_${stamp}`, path.extname(other).slice(1));
  const final = path.join(outDir, `${base}.${ext}`);
  fs.renameSync(temp, final);
  return { kind, ok: true, size, file: final, note: check.note };
}

// 폴더 스냅샷은 클릭 전에 찍어야 빠른 다운로드도 잡는다. 브라우저 이벤트와 폴더 감시 중 먼저 성공한 쪽을 쓴다.
async function receiveDownload(kind, trigger) {
  const before = snapshotDownloads(), deadline = Date.now() + DOWNLOAD_TIMEOUT;
  const temp = path.join(outDir, `.${kind}.part`);
  let originalName = "";
  const viaBrowser = nextDownload(DOWNLOAD_TIMEOUT).then(async (download) => { originalName = download.suggestedFilename(); await download.saveAs(temp); return temp; });
  const viaFolder = watchFolder(before, deadline).then((file) => { originalName = path.basename(file); fs.copyFileSync(file, temp); return temp; });
  await trigger();
  try { await Promise.any([viaBrowser, viaFolder]); }
  catch { cancelWait(); return { kind, ok: false, note: "다운로드를 받지 못했습니다(시간 초과)." }; }
  cancelWait();
  return store(kind, temp, originalName);
}

// 모든 후보를 합쳐 화면에 보이는 일치 요소가 정확히 하나일 때만 자동 클릭한다. 여러 개거나 없으면 담당자에게 넘긴다.
async function tryClick(page, candidates) {
  const hits = [];
  for (const candidate of candidates || []) {
    for (const frame of page.frames()) {
      const locators = typeof candidate === "string"
        ? [frame.getByRole("button", { name: candidate, exact: true }), frame.getByRole("link", { name: candidate, exact: true }), frame.getByText(candidate, { exact: true })]
        : [frame.locator(candidate.css)];
      for (const locator of locators) {
        const count = await locator.count().catch(() => 0);
        const visible = [];
        for (let i = 0; i < count; i++) if (await locator.nth(i).isVisible().catch(() => false)) visible.push(locator.nth(i));
        if (visible.length) { hits.push(...visible); break; } // 같은 요소가 role·text 양쪽에 잡히는 중복을 피한다
      }
    }
  }
  if (hits.length !== 1) return false;
  try { await hits[0].click({ timeout: CLICK_TIMEOUT }); return true; } catch { return false; }
}

async function runSite(context, key, results, journal) {
  const site = SITES[key];
  log(`\n■ ${site.name}`);
  let page = context.pages()[0] || await context.newPage();
  const follow = (p) => { page = p; }; context.on("page", follow);
  for (const step of site.steps) {
    const text = (step.text || step.manual || step.click || step.login || "").replace("{month}", month);
    if (step.goto) { await page.goto(step.goto, { waitUntil: "domcontentloaded" }).catch(() => log(`  페이지를 열지 못했습니다. 브라우저에서 직접 이동하세요: ${step.goto}`)); continue; }
    if (step.login) { await waitEnter(`[로그인] ${text}`); continue; }
    if (step.manual) { await waitEnter(text); continue; }
    if (step.click) {
      const auto = await tryClick(page, step.find);
      journal.push({ site: site.name, step: text, auto });
      if (!auto) await waitEnter(text);
      continue;
    }
    if (step.download) {
      const result = await receiveDownload(step.download, async () => {
        const auto = await tryClick(page, step.find);
        journal.push({ site: site.name, step: text, auto });
        log(auto ? `  자동 클릭: ${text}` : `\n  ▶ ${text}\n    파일이 내려오면 자동으로 저장합니다.`);
      });
      results.push(result);
      log(result.ok ? `  ✓ ${path.basename(result.file)} (${result.size.toLocaleString("ko-KR")}바이트) ${result.note}` : `  ✗ ${KIND_LABELS[step.download]}: ${result.note}${result.file ? ` → ${result.file}` : ""}`);
    }
  }
  context.off("page", follow);
}

async function launch() {
  const channels = opt("--browser") ? [opt("--browser")] : ["chrome", "msedge"];
  let lastError;
  for (const channel of channels) {
    try { return await chromium.launchPersistentContext(profileDir, { channel, headless, acceptDownloads: true, viewport: null, args: ["--start-maximized"] }); }
    catch (error) { lastError = error; }
  }
  throw new Error(`브라우저를 열 수 없습니다(${channels.join(", ")}). Chrome 또는 Edge를 설치하세요. ${lastError?.message?.split("\n")[0] || ""}`);
}

(async () => {
  log(`급여월 ${month} 자료를 ${outDir} 에 저장합니다.`);
  log("포털의 '부과월/당월'이 급여월과 같은지 화면에서 확인하세요. 인증서와 비밀번호는 저장되지 않으며 로그인은 직접 합니다.");
  const context = await launch();
  context.on("download", onDownload);
  const results = [], journal = [];
  try {
    for (const key of siteKeys) await runSite(context, key, results, journal);
  } finally {
    await context.close().catch(() => {});
    rl.close();
  }
  log("\n■ 요약");
  for (const entry of journal) log(`  ${entry.auto ? "자동" : "수동"}  ${entry.site} · ${entry.step}`);
  const expected = siteKeys.flatMap((k) => SITES[k].steps.filter((s) => s.download).map((s) => s.download));
  const missing = expected.filter((kind) => !results.some((r) => r.kind === kind && r.ok));
  for (const r of results) log(`  ${r.ok ? "✓" : "✗"}  ${KIND_LABELS[r.kind]}${r.file ? `  ${r.file}` : ""}  ${r.note || ""}`);
  if (missing.length) { log(`\n받지 못했거나 검증에 실패한 자료: ${missing.map((k) => KIND_LABELS[k]).join(", ")}. 실패 파일은 ${reviewDir} 에 있습니다.`); process.exit(1); }
  log(`\n완료. 앱의 '자료 가져오기'에 ${outDir} 안의 파일을 끌어놓으세요.`);
})().catch((error) => { console.error(`\n실행 중단: ${error.message}`); process.exit(1); });
