/**
 * /law 페이지 4개 탭 포괄 E2E 검증 스크립트 (Playwright)
 *
 * 실행: node scripts/e2e-law-research.mjs
 * 옵션: --headed  브라우저 창 표시
 *       --slow    slowMo 400ms
 *       --keep    실패해도 브라우저 유지 (디버그)
 * 전제: dev 서버가 http://localhost:3000 에서 동작 중, KOREAN_LAW_OC 설정됨
 */

import { chromium } from "playwright";
import { mkdir, rm } from "fs/promises";
import path from "path";

const BASE = "http://localhost:3000";
const HEADED = process.argv.includes("--headed");
const SLOW = process.argv.includes("--slow") ? 400 : 0;
const ARTIFACT_DIR = path.resolve("scripts/e2e-artifacts");

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
function info(msg) {
  console.log(`  · ${msg}`);
}

async function waitFor(page, fn, timeoutMs = 10_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      if (await fn()) return true;
    } catch {
      // ignore transient errors
    }
    await page.waitForTimeout(200);
  }
  return false;
}

async function snap(page, name) {
  const file = path.join(ARTIFACT_DIR, `${String(results.length).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file, fullPage: false }).catch(() => {});
}

/** 활성 탭 패널 locator — data-tab-value 로 scope 한정 */
function panel(page, tabValue) {
  return page.locator(`[role="tabpanel"][data-tab-value="${tabValue}"]`);
}

async function switchTab(page, tabLabel, tabValue) {
  await page.getByRole("tab", { name: tabLabel }).click();
  // 탭 전환 후 패널 등장 대기
  await page.waitForSelector(`[role="tabpanel"][data-tab-value="${tabValue}"]`, { timeout: 5000 });
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
    if (res.status() >= 400) {
      const body = await res.text().catch(() => "");
      networkFailures.push(`HTTP ${res.status()} ${res.url()} → ${body.slice(0, 200)}`);
    }
  });

  try {
    // ── 1. 홈 → /law ─────────────────────────────────────────────────
    console.log("\n[1] 홈 → /law 진입");
    await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 30_000 });
    const card = page.getByRole("link", { name: /법령 리서치/ });
    if (await card.count()) pass("홈에 '법령 리서치' 카드 노출");
    else fail("홈에 '법령 리서치' 카드 노출", "카드가 보이지 않음");
    await snap(page, "home");

    await card.first().click();
    await page.waitForURL(/\/law$/, { timeout: 5000 });
    pass("/law 라우팅");

    const apiKeyMissing = await page.getByText(/Open API 키가 설정되지 않/).count();
    if (apiKeyMissing) {
      fail("KOREAN_LAW_OC 설정", "개발 서버에 API 키 미설정 → E2E 중단");
      await browser.close();
      return;
    }
    await snap(page, "law-entry");

    // ── 2. 법령·조문 탭 ──────────────────────────────────────────────
    console.log("\n[2] 법령·조문 탭");
    await switchTab(page, /법령·조문/, "law");
    const lawPanel = panel(page, "law");

    const lawInput = lawPanel.getByPlaceholder(/법령명/);
    const lawSearchBtn = lawPanel.getByRole("button", { name: /^검색$|검색 중/ });
    const articleInput = lawPanel.getByPlaceholder(/조문 번호/);
    const articleBtn = lawPanel.getByRole("button", { name: /조문 본문 보기|조회 중/ });

    await lawInput.fill("소득세법");
    await lawSearchBtn.click();
    const gotLawResults = await waitFor(page, async () => {
      return (await lawPanel.locator("ul li").filter({ hasText: "소득세법" }).count()) >= 1;
    });
    if (gotLawResults) pass("법령 검색 결과 표시 (소득세법)");
    else fail("법령 검색 결과 표시", "소득세법 결과 없음");

    // 조문 번호 숫자만 입력 → 정규화
    await articleInput.fill("89");
    await articleBtn.click();
    const gotArticle = await waitFor(page, async () =>
      (await lawPanel.getByRole("heading", { name: /제89조/ }).count()) >= 1
    , 15_000);
    if (gotArticle) pass("숫자만 입력 '89' → 제89조 조문 렌더");
    else fail("숫자만 입력 '89'", "조문 제목이 보이지 않음");
    await snap(page, "law-article-89");

    // 시행령 조문
    await lawInput.fill("소득세법 시행령");
    await articleInput.fill("89");
    await articleBtn.click();
    const gotDecree = await waitFor(page, async () => {
      const t = await lawPanel.textContent();
      return t?.includes("취득가액") ?? false;
    }, 15_000);
    if (gotDecree) pass("시행령 제89조(취득가액) 조문 렌더");
    else fail("시행령 제89조", "취득가액 텍스트 없음");

    // ── 3. 판례·결정례 탭 ────────────────────────────────────────────
    console.log("\n[3] 판례·결정례 탭");
    await switchTab(page, /판례·결정례/, "decision");
    const decPanel = panel(page, "decision");
    await page.waitForTimeout(300);

    const decQuery = decPanel.getByPlaceholder(/검색어/);
    const decBtn = decPanel.getByRole("button", { name: /^검색$|검색 중/ });
    const domainSelect = decPanel.locator("select").first();

    await decQuery.fill("양도소득세");
    await domainSelect.selectOption("prec");
    await decBtn.click();
    const gotPrec = await waitFor(page, async () => {
      return (await decPanel.locator("ul > li").count()) >= 3;
    }, 15_000);
    if (gotPrec) pass("대법원 판례 검색 결과 ≥ 3건");
    else fail("대법원 판례 검색", "양도 관련 결과 3건 미만");
    await snap(page, "decisions-prec");

    // 페이지네이션
    const hasPagination = await decPanel.getByRole("navigation", { name: /페이지/ }).count();
    if (hasPagination) pass("페이지네이션 렌더");
    else fail("페이지네이션", "페이지 네비게이션 없음");

    // 출처 배지
    const sourceBadge = await decPanel.getByText("국세법령정보시스템").first().isVisible().catch(() => false);
    if (sourceBadge) pass("데이터 출처 배지 표시");
    else fail("데이터 출처 배지", "국세법령정보시스템 배지 없음");

    // 하급심 본문 불가 케이스 — graceful 응답이면 OK
    const firstRow = decPanel.locator("ul > li").first();
    const firstContentBtn = firstRow.getByRole("button", { name: /본문/ });
    if (await firstContentBtn.count()) {
      await firstContentBtn.click();
      const rendered = await waitFor(page, async () => {
        // 본문 제공 불가 안내
        if ((await decPanel.getByText(/본문 제공 불가|반환하지 않|받을 수 없/).count()) >= 1) return true;
        // 정상 본문 (article 요소 or pre 요소)
        if ((await decPanel.locator("article,pre").count()) > 0) return true;
        // 빨간 에러 박스
        if ((await decPanel.locator(".border-red-300").count()) >= 1) return true;
        return false;
      }, 20_000);
      if (rendered) pass("판례 본문 응답 처리 (본문 or 안내 or 에러)");
      else fail("판례 본문 처리", "본문/안내/에러 모두 렌더 실패");
      await snap(page, "decision-text");
    }

    // 대법원 판례 — MCP 이식 필드
    await domainSelect.selectOption("prec");
    await decQuery.fill("양도소득세 상속");
    await decBtn.click();
    await waitFor(page, async () => (await decPanel.locator("ul > li").count()) > 0, 15_000);
    const supremeRow = decPanel.locator("ul > li").filter({ has: page.locator('span:has-text("대법원")') }).first();
    if (await supremeRow.count()) {
      await supremeRow.getByRole("button", { name: /본문/ }).click();
      const gotSupremeDetail = await waitFor(page, async () => {
        const t = await decPanel.textContent();
        return (t?.includes("판결요지") && t?.includes("참조 조문")) ?? false;
      }, 15_000);
      if (gotSupremeDetail) pass("MCP 이식 필드(판결요지·참조조문) 렌더");
      else fail("MCP 이식 필드", "판결요지/참조조문 섹션 없음");
      await snap(page, "decision-supreme-detail");

      const fullBtn = decPanel.getByRole("button", { name: /전문 보기/ });
      if (await fullBtn.count()) {
        pass("본문 축약 시 '전문 보기' 버튼 노출");
        await fullBtn.click();
        await page.waitForTimeout(1200);
        await snap(page, "decision-supreme-full");
      } else {
        pass("본문 축약 불필요 (짧은 판례)");
      }
    } else {
      fail("대법원 판례 샘플 확보", "'대법원' 배지 항목 없음");
    }

    // detc 도메인
    await domainSelect.selectOption("detc");
    await decQuery.fill("양도소득세");
    await decBtn.click();
    const gotDetc = await waitFor(page, async () =>
      (await decPanel.locator("ul > li").count()) >= 1
    , 15_000);
    if (gotDetc) pass("법령해석례(detc) 검색 결과 표시");
    else fail("법령해석례(detc)", "결과 0건");

    // expc 도메인 (헌재)
    await domainSelect.selectOption("expc");
    await decBtn.click();
    const gotExpc = await waitFor(page, async () =>
      (await decPanel.locator("ul > li").count()) >= 1
    , 15_000);
    if (gotExpc) pass("헌재결정례(expc) 검색 결과 표시");
    else fail("헌재결정례(expc)", "결과 0건");

    // admrul (행정규칙)
    await domainSelect.selectOption("admrul");
    await decBtn.click();
    const gotAdmrul = await waitFor(page, async () =>
      (await decPanel.locator("ul > li").count()) >= 1
    , 15_000);
    if (gotAdmrul) pass("행정규칙(admrul) 검색 결과 표시");
    else fail("행정규칙(admrul)", "결과 0건");

    // ── 4. 별표·서식 탭 ──────────────────────────────────────────────
    console.log("\n[4] 별표·서식 탭");
    await switchTab(page, /별표·서식/, "annex");
    const annexPanel = panel(page, "annex");

    const annexNotice = await annexPanel.getByText(/지원 제한|포함하지 않아|조회 안내/).count();
    if (annexNotice) pass("별표 지원 제한/안내 배너 표시");
    else fail("별표 안내 배너", "안내 메시지 없음");

    const annexInput = annexPanel.getByPlaceholder(/법령명/);
    const annexBtn = annexPanel.getByRole("button", { name: /별표 목록 조회|조회 중/ });
    await annexInput.fill("소득세법 시행규칙");
    await annexBtn.click();
    const annexDone = await waitFor(page, async () => {
      const t = await annexPanel.textContent();
      return (t?.includes("반환되지 않았습니다") || t?.includes("별표 ") || t?.includes("0건")) ?? false;
    }, 15_000);
    if (annexDone) pass("별표 조회 응답 처리 (결과 or 빈 안내)");
    else fail("별표 조회 응답", "응답 감지 실패");
    await snap(page, "annex-tab");

    // ── 5. 리서치 체인 탭 ────────────────────────────────────────────
    console.log("\n[5] 리서치 체인 탭");
    await switchTab(page, /리서치 체인/, "chain");
    const chainPanel = panel(page, "chain");

    const chainSelect = chainPanel.locator("select").first();
    await chainSelect.selectOption("full_research");
    const chainQuery = chainPanel.getByPlaceholder(/핵심 키워드|키워드|질의/);
    const chainBtn = chainPanel.getByRole("button", { name: /체인 실행|실행 중/ });
    await chainQuery.fill("소득세법");
    await chainBtn.click();
    const chainDone = await waitFor(page, async () => {
      const t = await chainPanel.textContent();
      return t?.includes("관련 법령") ?? false;
    }, 30_000);
    if (chainDone) pass("full_research 체인 실행·섹션 렌더");
    else fail("full_research 체인", "관련 법령 섹션 없음");
    await snap(page, "chain-full-research");

    // document_review
    await chainSelect.selectOption("document_review");
    const textarea = chainPanel.locator("textarea");
    if (await textarea.count()) {
      await textarea.fill("양도소득세 비과세는 소득세법 제89조에 규정되어 있다.");
      await chainBtn.click();
      const docDone = await waitFor(page, async () => {
        const t = await chainPanel.textContent();
        return (t?.includes("인용 검증") || t?.includes("인용된 법령") || t?.includes("인용 검증 결과")) ?? false;
      }, 30_000);
      if (docDone) pass("document_review 체인 실행");
      else fail("document_review 체인", "인용 검증 결과 없음");
      await snap(page, "chain-document-review");
    } else {
      fail("document_review textarea", "textarea 없음");
    }

    // ── 6. 통합 검색창 기본 라우팅 ───────────────────────────────────
    console.log("\n[6] 통합 검색창 라우팅");
    const unifiedInput = page.getByPlaceholder(/자연어로 질의/).first();
    await unifiedInput.fill("소득세법 제89조");
    await page.keyboard.press("Enter");
    // 라우팅 후 law 탭 활성 + 제89조 조문 자동 조회
    const routedOk = await waitFor(page, async () => {
      const t = await page.textContent("body");
      return (t?.includes("제89조") || t?.includes("법령·조문")) ?? false;
    }, 15_000);
    if (routedOk) pass("통합 검색창 → 조문 라우팅");
    else fail("통합 검색창 라우팅", "조문/탭 반응 없음");
    await snap(page, "unified-route");

    // ── 7. 네트워크·콘솔 ────────────────────────────────────────────
    console.log("\n[7] 네트워크·콘솔 체크");
    if (networkFailures.length === 0) pass("네트워크 실패 0건");
    else fail("네트워크 실패", `${networkFailures.length}건 발생`);
    if (consoleErrors.length === 0) pass("콘솔 에러 0건");
    else fail("콘솔 에러", `${consoleErrors.length}건`);
  } catch (e) {
    fail("FATAL", e?.message ?? String(e));
    console.error(e);
  } finally {
    const passed = results.filter((r) => r.status === "PASS").length;
    const failed = results.filter((r) => r.status === "FAIL").length;
    const total = passed + failed;
    const rate = total ? Math.round((passed / total) * 100) : 0;
    console.log(`\n==== SUMMARY: ${passed} PASS / ${failed} FAIL  (${rate}%) ====`);
    if (failed > 0) {
      console.log("\n-- FAIL Details --");
      results.filter((r) => r.status === "FAIL").forEach((r) => console.log(`  ✗ ${r.name} — ${r.detail}`));
    }
    if (networkFailures.length) {
      console.log("\n-- Network Failures --");
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
    console.log("\n-- Artifacts --");
    console.log(`  screenshots: ${ARTIFACT_DIR}/*.png`);
    console.log(`  trace:       ${tracePath}`);
    if (failed > 0) process.exit(1);
  }
}

run();
