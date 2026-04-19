/**
 * /law 심층 E2E — 실사용자 플로우·체인 8종·인용 검증·모바일·특수문자
 *
 * 실행: node scripts/e2e-law-deep.mjs
 * 커버리지:
 *   [A] 리서치 체인 8종 전체
 *   [B] 인용 검증 상세 (HALLUCINATION 탐지)
 *   [C] 참조조문 chip → ArticleModal 실제 클릭
 *   [D] 모바일 뷰포트 (375×667)
 *   [E] 특수문자·긴 쿼리·XSS 시도
 *   [F] 연속 상호작용 (판례 → 조문 jumping)
 *   [G] 별표 PDF 파싱
 *   [H] 페이지네이션 경계 (첫/끝 페이지)
 *   [I] 고급 검색 옵션 (정렬·공포일자 범위)
 */

import { chromium } from "playwright";
import { mkdir, rm } from "fs/promises";
import path from "path";

const BASE = "http://localhost:3000";
const HEADED = process.argv.includes("--headed");
const SLOW = process.argv.includes("--slow") ? 400 : 0;
const ART = path.resolve("scripts/e2e-artifacts-deep");

const results = [];
const consoleErrors = [];
const networkFailures = [];
let currentSection = "init";

function pass(n, d = "") {
  results.push({ section: currentSection, name: n, status: "PASS", detail: d });
  console.log(`  ✓ ${n}${d ? ` — ${d}` : ""}`);
}
function fail(n, d) {
  results.push({ section: currentSection, name: n, status: "FAIL", detail: d });
  console.log(`  ✗ ${n} — ${d}`);
}
function warn(n, d) {
  results.push({ section: currentSection, name: n, status: "WARN", detail: d });
  console.log(`  ⚠ ${n} — ${d}`);
}

async function waitFor(page, fn, ms = 10_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      if (await fn()) return true;
    } catch {}
    await page.waitForTimeout(200);
  }
  return false;
}

async function snap(page, name) {
  const f = path.join(ART, `${String(results.length).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: f, fullPage: false }).catch(() => {});
}

function panel(page, v) {
  return page.locator(`[role="tabpanel"][data-tab-value="${v}"]`);
}

async function switchTab(page, label, value) {
  await page.getByRole("tab", { name: label }).click();
  await page.waitForSelector(`[role="tabpanel"][data-tab-value="${value}"]`, { timeout: 5000 });
}

// ─────────────────────────────────────────────────────────────────
// [A] 리서치 체인 8종 전체
// ─────────────────────────────────────────────────────────────────
async function testChainAllTypes(page) {
  currentSection = "A. 체인 8종";
  console.log(`\n[${currentSection}]`);

  const cases = [
    { type: "full_research", query: "양도소득세 비과세", expectAny: /관련 법령|판례|조문/ },
    { type: "law_system", query: "소득세법", expectAny: /상위|시행령|시행규칙|체계/ },
    { type: "action_basis", query: "부동산 취득세", expectAny: /행정규칙|근거|판례/ },
    { type: "dispute_prep", query: "양도소득세 가산세", expectAny: /심판|헌재|결정|분쟁/ },
    { type: "amendment_track", query: "종합부동산세법", expectAny: /개정|타임라인|연혁|공포/ },
    { type: "ordinance_compare", query: "취득세", expectAny: /자치법규|조례|지방/ },
    { type: "procedure_detail", query: "양도소득세 신고", expectAny: /절차|서식|제출|별지/ },
  ];

  for (const c of cases) {
    try {
      const res = await page.request.post(`${BASE}/api/law/chain`, {
        data: { type: c.type, query: c.query },
        headers: { "Content-Type": "application/json" },
        timeout: 30_000,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok()) {
        fail(`chain "${c.type}"`, `HTTP ${res.status()} — ${data.error ?? ""}`);
        continue;
      }
      const result = data.result;
      if (!result || !Array.isArray(result.sections)) {
        fail(`chain "${c.type}"`, `result.sections 배열 없음`);
        continue;
      }
      const combined = JSON.stringify(result.sections);
      if (result.sections.length === 0) {
        warn(`chain "${c.type}"`, `sections 0개 (쿼리 "${c.query}")`);
      } else if (c.expectAny.test(combined)) {
        pass(`chain "${c.type}" (${result.sections.length} sections)`);
      } else {
        warn(`chain "${c.type}"`, `예상 키워드 미포함 (sections=${result.sections.length})`);
      }
    } catch (e) {
      fail(`chain "${c.type}"`, e?.message ?? String(e));
    }
  }

  // document_review (별도 rawText 필요)
  try {
    const res = await page.request.post(`${BASE}/api/law/chain`, {
      data: {
        type: "document_review",
        query: "양도소득세",
        rawText: "양도소득세 비과세 요건은 소득세법 제89조에 따른다.",
      },
      headers: { "Content-Type": "application/json" },
      timeout: 30_000,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok()) fail(`chain "document_review"`, `HTTP ${res.status()}`);
    else if (data.result?.sections?.length > 0) pass(`chain "document_review" (${data.result.sections.length} sections)`);
    else warn(`chain "document_review"`, `sections 0개`);
  } catch (e) {
    fail(`chain "document_review"`, e?.message ?? String(e));
  }
}

// ─────────────────────────────────────────────────────────────────
// [B] 인용 검증 상세 — HALLUCINATION 탐지
// ─────────────────────────────────────────────────────────────────
async function testVerifyCitations(page) {
  currentSection = "B. 인용 검증";
  console.log(`\n[${currentSection}]`);

  // 모든 인용이 존재함
  try {
    const r1 = await page.request.post(`${BASE}/api/law/verify-citations`, {
      data: { text: "소득세법 제89조 제1항 제3호는 1세대 1주택 비과세 규정이다." },
      headers: { "Content-Type": "application/json" },
      timeout: 30_000,
    });
    const d1 = await r1.json().catch(() => ({}));
    if (!r1.ok()) {
      fail("모든 인용 존재 케이스", `HTTP ${r1.status()}`);
    } else {
      const hdr = d1.result?.header;
      if (hdr === "[VERIFIED]") pass(`VERIFIED 헤더 정상 (${d1.result.verifiedCount}건)`);
      else warn("VERIFIED 헤더", `actual=${hdr}, verified=${d1.result?.verifiedCount}/${d1.result?.totalCount}`);
    }
  } catch (e) {
    fail("VERIFIED 케이스", e?.message ?? String(e));
  }

  // HALLUCINATION 탐지 — 없는 조문
  try {
    const r2 = await page.request.post(`${BASE}/api/law/verify-citations`, {
      data: { text: "소득세법 제9999조는 가상의 조문이며, 상증법 제8888조도 존재하지 않는다." },
      headers: { "Content-Type": "application/json" },
      timeout: 30_000,
    });
    const d2 = await r2.json().catch(() => ({}));
    if (!r2.ok()) {
      fail("HALLUCINATION 탐지", `HTTP ${r2.status()}`);
    } else {
      const hdr = d2.result?.header;
      const hCount = d2.result?.hallucinationCount;
      if (hdr === "[HALLUCINATION_DETECTED]" && hCount >= 1) {
        pass(`HALLUCINATION_DETECTED 헤더 + ${hCount}건 탐지`);
      } else {
        fail("HALLUCINATION 탐지", `header=${hdr}, hallucination=${hCount}`);
      }
    }
  } catch (e) {
    fail("HALLUCINATION 케이스", e?.message ?? String(e));
  }

  // 혼합 (일부 실존·일부 환각)
  try {
    const r3 = await page.request.post(`${BASE}/api/law/verify-citations`, {
      data: {
        text: "소득세법 제89조는 실존하지만 소득세법 제99999조는 존재하지 않는다.",
      },
      headers: { "Content-Type": "application/json" },
      timeout: 30_000,
    });
    const d3 = await r3.json().catch(() => ({}));
    if (!r3.ok()) fail("혼합 케이스", `HTTP ${r3.status()}`);
    else {
      const hdr = d3.result?.header;
      if (hdr === "[PARTIAL_VERIFIED]" || hdr === "[HALLUCINATION_DETECTED]") {
        pass(`혼합 케이스 헤더 ${hdr} (verified=${d3.result.verifiedCount}, halluc=${d3.result.hallucinationCount})`);
      } else {
        warn("혼합 케이스", `header=${hdr}`);
      }
    }
  } catch (e) {
    fail("혼합 케이스", e?.message ?? String(e));
  }

  // 인용 없음
  try {
    const r4 = await page.request.post(`${BASE}/api/law/verify-citations`, {
      data: { text: "이 문장에는 법령 인용이 없습니다." },
      headers: { "Content-Type": "application/json" },
      timeout: 30_000,
    });
    const d4 = await r4.json().catch(() => ({}));
    if (!r4.ok()) fail("인용 없음 케이스", `HTTP ${r4.status()}`);
    else if (d4.result?.totalCount === 0) pass("인용 0건 graceful 처리");
    else warn("인용 없음 케이스", `totalCount=${d4.result?.totalCount}`);
  } catch (e) {
    fail("인용 없음 케이스", e?.message ?? String(e));
  }
}

// ─────────────────────────────────────────────────────────────────
// [C] 참조조문 chip → ArticleModal 클릭
// ─────────────────────────────────────────────────────────────────
async function testArticleModal(page) {
  currentSection = "C. ArticleModal";
  console.log(`\n[${currentSection}]`);

  await page.goto(`${BASE}/law`, { waitUntil: "networkidle" });
  await switchTab(page, /판례·결정례/, "decision");
  const decPanel = panel(page, "decision");
  await decPanel.getByPlaceholder(/검색어/).fill("양도소득세 상속");
  await decPanel.locator("select").first().selectOption("prec");
  await decPanel.getByRole("button", { name: /^검색$|검색 중/ }).click();
  await waitFor(page, async () => (await decPanel.locator("ul > li").count()) > 0, 15_000);

  // 대법원 판례 본문 열기
  const supremeRow = decPanel.locator("ul > li").filter({ has: page.locator('span:has-text("대법원")') }).first();
  if (!(await supremeRow.count())) {
    fail("대법원 판례 샘플 없음", "skip chip 테스트");
    return;
  }
  await supremeRow.getByRole("button", { name: /본문/ }).click();
  await waitFor(page, async () => {
    const t = await decPanel.textContent();
    return (t?.includes("판결요지") && t?.includes("참조 조문")) ?? false;
  }, 15_000);

  // 참조조문 chip 렌더 확인 — rounded-full 스타일의 버튼이 존재해야 함
  const chipCount = await decPanel.locator("button.rounded-full").count();
  if (chipCount >= 1) pass(`참조조문 chip ${chipCount}개 렌더`);
  else {
    fail("참조조문 chip 렌더", "chip 0건");
    return;
  }

  // 첫 번째 클릭 가능한 chip 클릭
  const firstChip = decPanel.locator("button.rounded-full:not([disabled])").first();
  if (await firstChip.count()) {
    await firstChip.click();
    // ArticleModal 열림 — role="dialog"
    const modalOpened = await waitFor(page, async () =>
      (await page.locator('[role="dialog"]').count()) > 0
    , 8_000);
    if (modalOpened) {
      pass("참조조문 chip 클릭 → ArticleModal 열림");
      await snap(page, "article-modal");
      // 본문 로딩 완료 or 에러 표시
      const loaded = await waitFor(page, async () => {
        const t = await page.locator('[role="dialog"]').textContent();
        return (t?.includes("제") || t?.includes("조") || t?.includes("찾") || t?.includes("오류")) ?? false;
      }, 10_000);
      if (loaded) pass("모달 내 조문 본문 or 에러 렌더");
      else fail("모달 본문 로딩", "본문/에러 없음");

      // ESC 닫기
      await page.keyboard.press("Escape");
      const closed = await waitFor(page, async () =>
        (await page.locator('[role="dialog"]').count()) === 0
      , 3_000);
      if (closed) pass("ESC 키로 모달 닫기");
      else fail("ESC 모달 닫기", "모달 여전히 열림");
    } else {
      warn("ArticleModal 열림", "role=dialog 요소 없음 (chip이 링크일 수 있음)");
    }
  } else {
    warn("클릭 가능 chip", "없음");
  }
}

// ─────────────────────────────────────────────────────────────────
// [D] 모바일 뷰포트
// ─────────────────────────────────────────────────────────────────
async function testMobileViewport(browser) {
  currentSection = "D. 모바일";
  console.log(`\n[${currentSection}]`);

  const mobileCtx = await browser.newContext({
    viewport: { width: 375, height: 667 },
    locale: "ko-KR",
    deviceScaleFactor: 2,
  });
  const page = await mobileCtx.newPage();

  try {
    await page.goto(`${BASE}/law`, { waitUntil: "networkidle" });
    // 탭 노출 확인
    const tabsVisible = await page.getByRole("tab").first().isVisible();
    if (tabsVisible) pass("모바일 탭 렌더");
    else fail("모바일 탭 렌더", "탭 보이지 않음");
    await snap(page, "mobile-home");

    // 통합 검색창 입력
    await page.getByPlaceholder(/자연어로 질의/).fill("소득세법 제89조");
    await page.keyboard.press("Enter");
    const routed = await waitFor(page, async () => {
      const t = await page.textContent("body");
      return (t?.includes("제89조") || t?.includes("양도")) ?? false;
    }, 15_000);
    if (routed) pass("모바일 통합검색 라우팅");
    else fail("모바일 통합검색", "결과 없음");
    await snap(page, "mobile-route");

    // 판례 탭 이동
    await page.getByRole("tab", { name: /판례/ }).click();
    const decPanel = page.locator(`[role="tabpanel"][data-tab-value="decision"]`);
    const decInput = decPanel.getByPlaceholder(/검색어/);
    if (await decInput.isVisible()) pass("모바일 판례 탭 렌더");
    else fail("모바일 판례 탭", "input 미표시");
  } catch (e) {
    fail("모바일 시나리오", e?.message ?? String(e));
  } finally {
    await mobileCtx.close();
  }
}

// ─────────────────────────────────────────────────────────────────
// [E] 특수문자·긴 쿼리·XSS
// ─────────────────────────────────────────────────────────────────
async function testSpecialCharsXss(page) {
  currentSection = "E. 특수문자·XSS";
  console.log(`\n[${currentSection}]`);

  const cases = [
    { q: "<script>alert(1)</script>", label: "XSS script 태그" },
    { q: "'; DROP TABLE laws; --", label: "SQL injection 흉내" },
    { q: "소득세법%20시행령", label: "URL 인코딩된 공백" },
    { q: "a".repeat(500), label: "500자 쿼리" },
    { q: "a".repeat(1000), label: "1000자 쿼리 (Zod max 초과 예상)" },
    { q: "소득세법\n제89조", label: "개행 포함 쿼리" },
    { q: "소득세법!@#$%^&*()_+", label: "특수문자 혼합" },
  ];

  for (const c of cases) {
    try {
      const r = await page.request.get(
        `${BASE}/api/law/search-law?q=${encodeURIComponent(c.q)}`,
        { timeout: 15_000 }
      );
      if (r.status() >= 500) {
        fail(`search-law "${c.label}"`, `5xx 에러 (${r.status()})`);
      } else if (r.status() === 400) {
        pass(`search-law "${c.label}" → 400 검증 실패 (예상 동작)`);
      } else if (r.ok()) {
        pass(`search-law "${c.label}" → ${r.status()} (crash 없음)`);
      } else {
        pass(`search-law "${c.label}" → ${r.status()} (graceful)`);
      }
    } catch (e) {
      fail(`search-law "${c.label}"`, e?.message ?? String(e));
    }
  }

  // UI에서 XSS 스크립트가 실행되지 않는지
  await page.goto(`${BASE}/law`, { waitUntil: "networkidle" });
  let alertFired = false;
  page.once("dialog", async (d) => {
    alertFired = true;
    await d.dismiss();
  });
  await panel(page, "law").getByPlaceholder(/법령명/).fill("<img src=x onerror=alert(1)>");
  await panel(page, "law").getByRole("button", { name: /^검색$|검색 중/ }).click();
  await page.waitForTimeout(2000);
  if (!alertFired) pass("XSS 페이로드 렌더 — alert 발생 안 함");
  else fail("XSS 방어", "alert 발생!");
}

// ─────────────────────────────────────────────────────────────────
// [F] 연속 상호작용 — 판례 → 조문 jumping
// ─────────────────────────────────────────────────────────────────
async function testContinuousInteraction(page) {
  currentSection = "F. 연속 상호작용";
  console.log(`\n[${currentSection}]`);

  await page.goto(`${BASE}/law`, { waitUntil: "networkidle" });

  // 1) 법령 탭: 소득세법 제89조
  await switchTab(page, /법령·조문/, "law");
  const lawPanel = panel(page, "law");
  await lawPanel.getByPlaceholder(/법령명/).fill("소득세법");
  await lawPanel.getByPlaceholder(/조문 번호/).fill("89");
  await lawPanel.getByRole("button", { name: /조문 본문 보기/ }).click();
  const ok1 = await waitFor(page, async () =>
    (await lawPanel.getByRole("heading", { name: /제89조/ }).count()) >= 1
  , 15_000);
  if (ok1) pass("1단계: 소득세법 제89조 조회");
  else fail("1단계: 제89조", "조문 렌더 실패");

  // 2) 판례 탭 이동 후 검색
  await switchTab(page, /판례·결정례/, "decision");
  const decPanel = panel(page, "decision");
  await decPanel.getByPlaceholder(/검색어/).fill("1세대 1주택");
  await decPanel.locator("select").first().selectOption("prec");
  await decPanel.getByRole("button", { name: /^검색$|검색 중/ }).click();
  const ok2 = await waitFor(page, async () =>
    (await decPanel.locator("ul > li").count()) >= 1
  , 15_000);
  if (ok2) pass("2단계: '1세대 1주택' 판례 검색");
  else fail("2단계: 판례 검색", "결과 없음");

  // 3) 법령 탭으로 돌아왔을 때 상태 유지
  await switchTab(page, /법령·조문/, "law");
  const stillHasArticle = await lawPanel.getByRole("heading", { name: /제89조/ }).count();
  if (stillHasArticle >= 1) pass("3단계: 탭 이동 후에도 조문 상태 유지");
  else warn("3단계: 상태 유지", "제89조 사라짐 (탭 전환 시 state 초기화)");

  // 4) 빠른 연속 검색 (race condition 확인)
  await lawPanel.getByPlaceholder(/법령명/).fill("상증법");
  await lawPanel.getByPlaceholder(/조문 번호/).fill("53");
  // 3회 빠른 클릭
  const btn = lawPanel.getByRole("button", { name: /조문 본문 보기|조회 중/ });
  await btn.click();
  await page.waitForTimeout(100);
  await lawPanel.getByPlaceholder(/조문 번호/).fill("18의2");
  await btn.click();
  await page.waitForTimeout(100);
  await lawPanel.getByPlaceholder(/조문 번호/).fill("44");
  await btn.click();
  // 최종 "제44조"가 렌더되어야 함
  const finalOk = await waitFor(page, async () => {
    const hasHeading = (await lawPanel.getByRole("heading").allTextContents()).join(" ");
    return hasHeading.includes("제44조");
  }, 20_000);
  if (finalOk) pass("4단계: 빠른 연속 검색 — 최종 조문 일치");
  else {
    const actual = await lawPanel.getByRole("heading").allTextContents();
    warn("4단계: 빠른 연속", `최종 heading: ${actual.join(" | ")}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// [G] 별표 PDF 파싱
// ─────────────────────────────────────────────────────────────────
async function testAnnexParse(page) {
  currentSection = "G. 별표 파싱";
  console.log(`\n[${currentSection}]`);

  // 빈 body
  try {
    const r = await page.request.post(`${BASE}/api/law/annexes/parse`, {
      data: {},
      headers: { "Content-Type": "application/json" },
    });
    if (r.status() === 400) pass("annexes/parse 빈 body → 400");
    else warn("빈 body", `expected 400, got ${r.status()}`);
  } catch (e) {
    fail("빈 body 처리", e?.message ?? String(e));
  }

  // 유효 URL but PDF 아님
  try {
    const r = await page.request.post(`${BASE}/api/law/annexes/parse`, {
      data: { annexId: "test-1", fileUrl: "https://example.com/file.hwpx" },
      headers: { "Content-Type": "application/json" },
    });
    const d = await r.json().catch(() => ({}));
    if (r.status() === 400 && d.code === "UNSUPPORTED_FORMAT") {
      pass("HWPX 확장자 → 400 UNSUPPORTED_FORMAT");
    } else {
      warn("HWPX 처리", `status=${r.status()} code=${d.code}`);
    }
  } catch (e) {
    fail("HWPX 처리", e?.message ?? String(e));
  }

  // 잘못된 URL 형식
  try {
    const r = await page.request.post(`${BASE}/api/law/annexes/parse`, {
      data: { annexId: "test-2", fileUrl: "not-a-url" },
      headers: { "Content-Type": "application/json" },
    });
    if (r.status() === 400) pass("잘못된 URL → 400");
    else warn("잘못된 URL", `status=${r.status()}`);
  } catch (e) {
    fail("잘못된 URL 처리", e?.message ?? String(e));
  }
}

// ─────────────────────────────────────────────────────────────────
// [H] 페이지네이션 경계
// ─────────────────────────────────────────────────────────────────
async function testPaginationBoundaries(page) {
  currentSection = "H. 페이지네이션";
  console.log(`\n[${currentSection}]`);

  // page=1
  try {
    const r1 = await page.request.get(
      `${BASE}/api/law/search-decisions?q=양도&domain=prec&page=1&pageSize=5`
    );
    const d1 = await r1.json().catch(() => ({}));
    if (r1.ok() && d1.items?.length <= 5 && d1.totalCount > 0) {
      pass(`page=1 → items=${d1.items.length}, total=${d1.totalCount}`);
    } else fail("page=1", `status=${r1.status()}`);
  } catch (e) {
    fail("page=1", e?.message ?? String(e));
  }

  // 매우 큰 페이지 번호
  try {
    const r2 = await page.request.get(
      `${BASE}/api/law/search-decisions?q=양도&domain=prec&page=9999&pageSize=5`
    );
    const d2 = await r2.json().catch(() => ({}));
    if (r2.ok()) pass(`page=9999 → graceful (items=${d2.items?.length ?? 0})`);
    else pass(`page=9999 → ${r2.status()} (서버가 경계 거부)`);
  } catch (e) {
    fail("page=9999", e?.message ?? String(e));
  }

  // page=0 (invalid)
  try {
    const r3 = await page.request.get(
      `${BASE}/api/law/search-decisions?q=양도&domain=prec&page=0&pageSize=5`
    );
    if (r3.status() === 400) pass("page=0 → 400");
    else warn("page=0", `expected 400, got ${r3.status()}`);
  } catch (e) {
    fail("page=0", e?.message ?? String(e));
  }

  // page=음수
  try {
    const r4 = await page.request.get(
      `${BASE}/api/law/search-decisions?q=양도&domain=prec&page=-1&pageSize=5`
    );
    if (r4.status() === 400) pass("page=-1 → 400");
    else warn("page=-1", `expected 400, got ${r4.status()}`);
  } catch (e) {
    fail("page=-1", e?.message ?? String(e));
  }

  // pageSize 과다
  try {
    const r5 = await page.request.get(
      `${BASE}/api/law/search-decisions?q=양도&domain=prec&page=1&pageSize=9999`
    );
    const d5 = await r5.json().catch(() => ({}));
    if (r5.status() === 400) pass("pageSize=9999 → 400 (경계 방어)");
    else if (r5.ok() && (d5.items?.length ?? 0) <= 100) pass(`pageSize=9999 → 정상 응답 (items=${d5.items?.length})`);
    else warn("pageSize=9999", `status=${r5.status()}`);
  } catch (e) {
    fail("pageSize=9999", e?.message ?? String(e));
  }
}

// ─────────────────────────────────────────────────────────────────
// [I] 고급 검색 옵션
// ─────────────────────────────────────────────────────────────────
async function testAdvancedOptions(page) {
  currentSection = "I. 고급 검색";
  console.log(`\n[${currentSection}]`);

  // 정렬
  try {
    const r = await page.request.get(
      `${BASE}/api/law/search-law?q=소득세법&sort=promulgation_desc`
    );
    if (r.ok()) pass("정렬 promulgation_desc 응답");
    else fail("정렬", `HTTP ${r.status()}`);
  } catch (e) {
    fail("정렬", e?.message ?? String(e));
  }

  // 공포일자 범위
  try {
    const r = await page.request.get(
      `${BASE}/api/law/search-law?q=소득세법&ancYd=20200101~20241231`
    );
    if (r.ok()) pass("공포일자 범위 필터 응답");
    else fail("공포일자 범위", `HTTP ${r.status()}`);
  } catch (e) {
    fail("공포일자 범위", e?.message ?? String(e));
  }

  // 잘못된 정렬값
  try {
    const r = await page.request.get(
      `${BASE}/api/law/search-law?q=소득세법&sort=invalid_sort`
    );
    if (r.status() === 400) pass("잘못된 sort → 400");
    else warn("잘못된 sort", `status=${r.status()}`);
  } catch (e) {
    fail("잘못된 sort", e?.message ?? String(e));
  }
}

// ─────────────────────────────────────────────────────────────────
// [J] UI 고급 옵션 토글 + 정렬
// ─────────────────────────────────────────────────────────────────
async function testUiAdvancedToggle(page) {
  currentSection = "J. UI 고급옵션";
  console.log(`\n[${currentSection}]`);

  await page.goto(`${BASE}/law`, { waitUntil: "networkidle" });
  await switchTab(page, /법령·조문/, "law");
  const lawPanel = panel(page, "law");

  // 고급 옵션 펼치기
  const toggleBtn = lawPanel.getByRole("button", { name: /고급 검색 옵션|정렬|공포일자/ });
  if (await toggleBtn.count()) {
    await toggleBtn.first().click();
    const sortSelect = lawPanel.locator("select").first();
    if (await sortSelect.count()) {
      await sortSelect.selectOption("promulgation_desc");
      pass("고급 옵션: 정렬 드롭다운 선택");
    } else {
      fail("정렬 드롭다운", "select 없음");
    }
    await snap(page, "advanced-options");
  } else {
    fail("고급 옵션 토글", "버튼 없음");
  }
}

// ─────────────────────────────────────────────────────────────────
// 메인
// ─────────────────────────────────────────────────────────────────
async function run() {
  await rm(ART, { recursive: true, force: true });
  await mkdir(ART, { recursive: true });

  const browser = await chromium.launch({ headless: !HEADED, slowMo: SLOW });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "ko-KR",
    recordVideo: { dir: ART, size: { width: 1280, height: 900 } },
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
    await testChainAllTypes(page);
    await testVerifyCitations(page);
    await testArticleModal(page);
    await testMobileViewport(browser);
    await testSpecialCharsXss(page);
    await testContinuousInteraction(page);
    await testAnnexParse(page);
    await testPaginationBoundaries(page);
    await testAdvancedOptions(page);
    await testUiAdvancedToggle(page);
  } catch (e) {
    fail("FATAL", e?.message ?? String(e));
    console.error(e);
  } finally {
    const P = results.filter((r) => r.status === "PASS").length;
    const F = results.filter((r) => r.status === "FAIL").length;
    const W = results.filter((r) => r.status === "WARN").length;
    const total = P + F + W;
    const rate = total ? Math.round((P / total) * 100) : 0;
    console.log(`\n==== SUMMARY: ${P} PASS / ${F} FAIL / ${W} WARN  (PASS ${rate}%) ====`);

    if (F > 0) {
      console.log("\n-- FAIL --");
      results.filter((r) => r.status === "FAIL").forEach((r) =>
        console.log(`  ✗ [${r.section}] ${r.name} — ${r.detail}`)
      );
    }
    if (W > 0) {
      console.log("\n-- WARN --");
      results.filter((r) => r.status === "WARN").forEach((r) =>
        console.log(`  ⚠ [${r.section}] ${r.name} — ${r.detail}`)
      );
    }
    if (networkFailures.length) {
      console.log("\n-- Network 5xx --");
      networkFailures.slice(0, 20).forEach((n) => console.log(" ", n));
    }
    if (consoleErrors.length) {
      console.log("\n-- Console Errors (첫 10) --");
      consoleErrors.slice(0, 10).forEach((e) => console.log(" ", e));
    }

    const tracePath = path.join(ART, "trace.zip");
    await context.tracing.stop({ path: tracePath }).catch(() => {});
    await context.close();
    await browser.close();
    if (F > 0) process.exit(1);
  }
}

run();
