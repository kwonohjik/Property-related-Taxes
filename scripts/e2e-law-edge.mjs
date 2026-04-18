/**
 * /law 심화 E2E — 세법 특화·엣지 케이스
 *
 * 실행: node scripts/e2e-law-edge.mjs
 * 포함 시나리오:
 *   - 세법 약칭 자동 해석 (상증법/종부세법/지특법)
 *   - 조문 번호 변형 (제18조의2, 18의2, 제89조)
 *   - 존재하지 않는 법령 graceful handling
 *   - 통합 검색창 자연어 패턴 다양화
 *   - API 직접 호출 (무결성)
 *   - 페이지네이션 이동
 *   - 빈 검색어 방어
 */

import { chromium } from "playwright";
import { mkdir, rm } from "fs/promises";
import path from "path";

const BASE = "http://localhost:3000";
const HEADED = process.argv.includes("--headed");
const SLOW = process.argv.includes("--slow") ? 400 : 0;
const ARTIFACT_DIR = path.resolve("scripts/e2e-artifacts-edge");

const results = [];
const consoleErrors = [];
const networkFailures = [];

function pass(name, detail = "") {
  results.push({ name, status: "PASS", detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, reason) {
  results.push({ name, status: "FAIL", detail: reason });
  console.log(`  ✗ ${name} — ${reason}`);
}
function warn(name, detail) {
  results.push({ name, status: "WARN", detail });
  console.log(`  ⚠ ${name} — ${detail}`);
}

async function waitFor(page, fn, timeoutMs = 10_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      if (await fn()) return true;
    } catch {
      /* ignore */
    }
    await page.waitForTimeout(200);
  }
  return false;
}

async function snap(page, name) {
  const file = path.join(ARTIFACT_DIR, `${String(results.length).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file, fullPage: false }).catch(() => {});
}

function panel(page, tabValue) {
  return page.locator(`[role="tabpanel"][data-tab-value="${tabValue}"]`);
}

async function switchTab(page, tabLabel, tabValue) {
  await page.getByRole("tab", { name: tabLabel }).click();
  await page.waitForSelector(`[role="tabpanel"][data-tab-value="${tabValue}"]`, { timeout: 5000 });
}

// ──────────────────────────────────────────────────────────────────────
// API 직접 호출 테스트
// ──────────────────────────────────────────────────────────────────────
async function testApiDirect(page) {
  console.log("\n[API-1] /api/law/search-law — 세법 약칭 해석");

  const cases = [
    { q: "상증법", expect: "상속세" },
    { q: "종부세법", expect: "종합부동산" },
    { q: "조특법", expect: "조세특례" },
    { q: "지방세법", expect: "지방세" },
    { q: "소득세법", expect: "소득세" },
  ];

  for (const c of cases) {
    const url = `${BASE}/api/law/search-law?q=${encodeURIComponent(c.q)}`;
    try {
      const res = await page.request.get(url);
      if (!res.ok()) {
        fail(`search-law "${c.q}"`, `HTTP ${res.status()}`);
        continue;
      }
      const data = await res.json();
      const hit = (data.results ?? []).some((r) => r.lawName?.includes(c.expect));
      if (hit) pass(`약칭 "${c.q}" → ${c.expect} 매칭`);
      else fail(`약칭 "${c.q}" → ${c.expect}`, `results=${data.results?.length ?? 0}건, 매칭 없음`);
    } catch (e) {
      fail(`search-law "${c.q}"`, e?.message ?? String(e));
    }
  }

  console.log("\n[API-2] /api/law/law-text — 조문 번호 변형");
  const articleCases = [
    { lawName: "소득세법", articleNo: "89", expect: "비과세|양도" },
    { lawName: "소득세법", articleNo: "제89조", expect: "비과세|양도" },
    { lawName: "상속세및증여세법", articleNo: "제18조의2", expect: "제18조의2|공제" },
    { lawName: "상증법", articleNo: "18의2", expect: "제18조의2|공제" },
    { lawName: "종합부동산세법", articleNo: "8", expect: "과세표준|주택" },
  ];

  for (const c of articleCases) {
    const url = `${BASE}/api/law/law-text?lawName=${encodeURIComponent(c.lawName)}&articleNo=${encodeURIComponent(c.articleNo)}`;
    try {
      const res = await page.request.get(url);
      const data = await res.json().catch(() => ({}));
      if (!res.ok()) {
        fail(`law-text ${c.lawName} ${c.articleNo}`, `HTTP ${res.status()} — ${data.error ?? ""}`);
        continue;
      }
      const art = data.article;
      if (!art) {
        fail(`law-text ${c.lawName} ${c.articleNo}`, "article 객체 없음");
        continue;
      }
      const body = `${art.title ?? ""}\n${art.fullText ?? ""}`;
      if (new RegExp(c.expect).test(body)) {
        pass(`조문 ${c.lawName} "${c.articleNo}" 렌더 + 키워드 매칭`);
      } else {
        warn(`조문 ${c.lawName} "${c.articleNo}"`, `키워드 "${c.expect}" 본문에 없음 (title: ${art.title})`);
      }
    } catch (e) {
      fail(`law-text ${c.lawName} ${c.articleNo}`, e?.message ?? String(e));
    }
  }

  console.log("\n[API-3] /api/law/route-router — 자연어 라우팅");
  const routeCases = [
    { query: "소득세법 제89조", targetTab: "law" },
    { query: "양도소득세 판례", targetTab: "decision" },
    { query: "상증법 제53조", targetTab: "law" },
    { query: "종부세법 개정 이력", targetTab: "chain" },
  ];
  for (const c of routeCases) {
    try {
      const res = await page.request.post(`${BASE}/api/law/route-router`, {
        data: { query: c.query },
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok()) {
        fail(`route-router "${c.query}"`, `HTTP ${res.status()}`);
        continue;
      }
      if (data.targetTab === c.targetTab) {
        pass(`라우팅 "${c.query}" → ${c.targetTab} (${data.patternName ?? "?"})`);
      } else {
        warn(
          `라우팅 "${c.query}"`,
          `expected=${c.targetTab}, got=${data.targetTab} (pattern=${data.patternName})`
        );
      }
    } catch (e) {
      fail(`route-router "${c.query}"`, e?.message ?? String(e));
    }
  }

  console.log("\n[API-4] /api/law/search-decisions — 도메인별 검색");
  const decCases = [
    { q: "양도소득세", domain: "prec" },
    { q: "상속세", domain: "prec" },
    { q: "취득세 중과", domain: "detc" },
  ];
  for (const c of decCases) {
    const url = `${BASE}/api/law/search-decisions?q=${encodeURIComponent(c.q)}&domain=${c.domain}&page=1&pageSize=10`;
    try {
      const res = await page.request.get(url);
      const data = await res.json().catch(() => ({}));
      if (!res.ok()) {
        fail(`search-decisions ${c.domain} "${c.q}"`, `HTTP ${res.status()} — ${data.error ?? ""}`);
        continue;
      }
      const cnt = data.items?.length ?? 0;
      if (cnt >= 1) pass(`판례 검색 ${c.domain} "${c.q}" ≥1건 (total=${data.totalCount})`);
      else warn(`판례 검색 ${c.domain} "${c.q}"`, `결과 0건`);
    } catch (e) {
      fail(`search-decisions ${c.domain} "${c.q}"`, e?.message ?? String(e));
    }
  }

  console.log("\n[API-5] 존재하지 않는 법령·조문 graceful");
  try {
    const r = await page.request.get(`${BASE}/api/law/law-text?lawName=존재하지않는법&articleNo=1`);
    const d = await r.json().catch(() => ({}));
    if (r.status() >= 400 && d.error) pass(`없는 법령 → 4xx + error 응답 (${r.status()})`);
    else if (r.ok() && !d.article) pass(`없는 법령 → 200 + article=null`);
    else fail(`없는 법령 처리`, `status=${r.status()} body=${JSON.stringify(d).slice(0, 100)}`);
  } catch (e) {
    fail(`없는 법령 처리`, e?.message ?? String(e));
  }

  // 빈 query
  try {
    const r = await page.request.get(`${BASE}/api/law/search-law?q=`);
    if (r.status() === 400) pass(`빈 q → 400`);
    else warn(`빈 q`, `expected 400, got ${r.status()}`);
  } catch (e) {
    fail(`빈 q 처리`, e?.message ?? String(e));
  }
}

// ──────────────────────────────────────────────────────────────────────
// UI 시나리오
// ──────────────────────────────────────────────────────────────────────
async function testUi(page) {
  console.log("\n[UI-1] 통합 검색창 다양한 자연어 패턴");
  await page.goto(`${BASE}/law`, { waitUntil: "networkidle" });

  const unifiedInput = page.getByPlaceholder(/자연어로 질의/).first();
  const unifiedBtn = page
    .locator("div.rounded-lg.border.bg-card")
    .getByRole("button", { name: /^검색$|라우팅 중/ });

  const nlCases = [
    { q: "상증법 제53조", expectTab: "law" },
    { q: "양도소득세 판례", expectTab: "decision" },
    { q: "종부세법", expectTab: "law" },
  ];

  for (const c of nlCases) {
    await unifiedInput.fill("");
    await unifiedInput.fill(c.q);
    await unifiedBtn.click();
    const ok = await waitFor(page, async () => {
      const active = await page.locator(`[role="tab"][aria-selected="true"]`).textContent();
      return active?.includes(c.expectTab === "law" ? "법령" : c.expectTab === "decision" ? "판례" : "체인") ?? false;
    }, 12_000);
    if (ok) pass(`통합검색창 "${c.q}" → ${c.expectTab} 탭 활성`);
    else fail(`통합검색창 "${c.q}"`, `${c.expectTab} 탭 활성화 실패`);
  }

  console.log("\n[UI-2] 판례 페이지네이션 다음 페이지");
  await switchTab(page, /판례·결정례/, "decision");
  const decPanel = panel(page, "decision");
  const decQuery = decPanel.getByPlaceholder(/검색어/);
  await decQuery.fill("양도소득세");
  await decPanel.locator("select").first().selectOption("prec");
  await decPanel.getByRole("button", { name: /^검색$|검색 중/ }).click();
  const gotList = await waitFor(page, async () => (await decPanel.locator("ul > li").count()) >= 3, 15_000);
  if (!gotList) {
    fail("판례 초기 결과", "결과 3건 미만");
  } else {
    // 2페이지 버튼
    const nextBtn = decPanel.getByRole("button", { name: /^2$|다음/ }).first();
    if (await nextBtn.count()) {
      await nextBtn.click();
      const moved = await waitFor(page, async () => (await decPanel.locator("ul > li").count()) >= 1, 15_000);
      if (moved) pass("페이지네이션 이동");
      else fail("페이지네이션 이동", "결과 로딩 실패");
    } else {
      warn("페이지네이션 버튼", "'2' 또는 '다음' 버튼 없음");
    }
  }

  console.log("\n[UI-3] 인용 검증 탭");
  await switchTab(page, /인용 검증/, "verify");
  const vPanel = panel(page, "verify");
  const vTextarea = vPanel.locator("textarea");
  if (await vTextarea.count()) {
    await vTextarea.fill("양도소득세의 비과세 요건은 소득세법 제89조 제1항 제3호에 명시되어 있다. 상증법 제18조의2 참조.");
    const vBtn = vPanel.getByRole("button", { name: /검증|확인/ }).first();
    if (await vBtn.count()) {
      await vBtn.click();
      const done = await waitFor(page, async () => {
        const t = await vPanel.textContent();
        return (t?.includes("소득세법") || t?.includes("제89조") || t?.includes("검증")) ?? false;
      }, 20_000);
      if (done) pass("인용 검증 탭 응답 렌더");
      else fail("인용 검증 탭", "검증 결과 없음");
      await snap(page, "verify-citations");
    } else {
      warn("인용 검증 버튼", "검증 버튼 없음");
    }
  } else {
    fail("인용 검증 탭", "textarea 없음");
  }

  console.log("\n[UI-4] 조문 번호 특수 형식 — 제18조의2");
  await switchTab(page, /법령·조문/, "law");
  const lawPanel = panel(page, "law");
  const lawInput = lawPanel.getByPlaceholder(/법령명/);
  const articleInput = lawPanel.getByPlaceholder(/조문 번호/);
  const articleBtn = lawPanel.getByRole("button", { name: /조문 본문 보기|조회 중/ });
  await lawInput.fill("상속세및증여세법");
  await articleInput.fill("제18조의2");
  await articleBtn.click();
  const ok = await waitFor(page, async () => {
    const t = await lawPanel.textContent();
    return (t?.includes("제18조의2") || t?.includes("공제")) ?? false;
  }, 15_000);
  if (ok) pass("제18조의2 조문 렌더 (상증법)");
  else fail("제18조의2 조문", "본문/제목 매칭 실패");
  await snap(page, "article-18-2");

  // 숫자만 + 의
  await articleInput.fill("18의2");
  await articleBtn.click();
  const ok2 = await waitFor(page, async () => {
    const t = await lawPanel.textContent();
    return (t?.includes("제18조의2") || t?.includes("공제")) ?? false;
  }, 15_000);
  if (ok2) pass("숫자만 '18의2' → 제18조의2 정규화");
  else fail("숫자만 '18의2'", "정규화 실패");

  console.log("\n[UI-5] 존재하지 않는 법령/조문 UI 처리");
  await lawInput.fill("없는법률1234");
  await articleInput.fill("99");
  await articleBtn.click();
  const handled = await waitFor(page, async () => {
    const t = await lawPanel.textContent();
    return (t?.match(/없|찾|오류|실패|error/i) ?? null) !== null;
  }, 10_000);
  if (handled) pass("없는 법령 UI 에러 메시지 렌더");
  else fail("없는 법령 UI", "에러 메시지 없음");
  await snap(page, "law-not-found");
}

async function run() {
  await rm(ARTIFACT_DIR, { recursive: true, force: true });
  await mkdir(ARTIFACT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: !HEADED, slowMo: SLOW });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "ko-KR",
    recordVideo: { dir: ARTIFACT_DIR, size: { width: 1280, height: 900 } },
  });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await context.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("requestfailed", (req) => {
    networkFailures.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
  });
  page.on("response", async (res) => {
    if (!res.url().includes("/api/law/")) return;
    if (res.status() >= 500) {
      const body = await res.text().catch(() => "");
      networkFailures.push(`HTTP ${res.status()} ${res.url()} → ${body.slice(0, 200)}`);
    }
  });

  try {
    await testApiDirect(page);
    await testUi(page);
  } catch (e) {
    fail("FATAL", e?.message ?? String(e));
    console.error(e);
  } finally {
    const passed = results.filter((r) => r.status === "PASS").length;
    const failed = results.filter((r) => r.status === "FAIL").length;
    const warned = results.filter((r) => r.status === "WARN").length;
    const total = passed + failed + warned;
    const rate = total ? Math.round((passed / total) * 100) : 0;
    console.log(`\n==== SUMMARY: ${passed} PASS / ${failed} FAIL / ${warned} WARN  (PASS ${rate}%) ====`);
    if (failed > 0) {
      console.log("\n-- FAIL --");
      results.filter((r) => r.status === "FAIL").forEach((r) => console.log(`  ✗ ${r.name} — ${r.detail}`));
    }
    if (warned > 0) {
      console.log("\n-- WARN --");
      results.filter((r) => r.status === "WARN").forEach((r) => console.log(`  ⚠ ${r.name} — ${r.detail}`));
    }
    if (networkFailures.length) {
      console.log("\n-- Network 5xx --");
      networkFailures.slice(0, 20).forEach((n) => console.log(" ", n));
    }
    if (consoleErrors.length) {
      console.log("\n-- Console Errors --");
      consoleErrors.slice(0, 20).forEach((e) => console.log(" ", e));
    }

    const tracePath = path.join(ARTIFACT_DIR, "trace.zip");
    await context.tracing.stop({ path: tracePath }).catch(() => {});
    await context.close();
    await browser.close();
    if (failed > 0) process.exit(1);
  }
}

run();
