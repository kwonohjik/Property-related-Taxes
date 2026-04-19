/**
 * /law P0+P1 개선 작업 전용 E2E 검증
 *
 * 대상: 2026-04-19 추가된
 *   - 별표 본문 변환 (/api/law/annex-content) HWPX/PDF/XLSX
 *   - 시나리오 4종 (manual/delegation/compliance/fta) 트리거
 *   - No-Result 힌트 (search-law, search-decisions, law-text)
 *   - 마커 표준화 ([NOT_FOUND]/[FAILED]/[HALLUCINATION_DETECTED])
 *
 * 전제: dev 서버 http://localhost:3000, KOREAN_LAW_OC 설정, LAW_ANNEX_BODY_ENABLED=true
 */

import { chromium } from "playwright";
import { mkdir, rm } from "fs/promises";
import path from "path";

const BASE = "http://localhost:3000";
const HEADED = process.argv.includes("--headed");
const ARTIFACT_DIR = path.resolve("scripts/e2e-artifacts-p0p1");

const results = [];
const consoleErrors = [];

function pass(name, detail = "") {
  results.push({ name, status: "PASS", detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, reason) {
  results.push({ name, status: "FAIL", detail: reason });
  console.log(`  ✗ ${name} — ${reason}`);
}
function warn(name, reason) {
  results.push({ name, status: "WARN", detail: reason });
  console.log(`  ⚠ ${name} — ${reason}`);
}

/** 원시 JSON fetch */
async function api(path) {
  const res = await fetch(`${BASE}${path}`);
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = { _raw: text };
  }
  return { status: res.status, body };
}

async function run() {
  await rm(ARTIFACT_DIR, { recursive: true, force: true });
  await mkdir(ARTIFACT_DIR, { recursive: true });

  console.log("\n==================================================");
  console.log("  P0+P1 E2E 검증 (별표·시나리오·힌트·마커)");
  console.log("==================================================\n");

  // ────────────────────────────────────────────────────────────
  // [A] No-Result 힌트
  // ────────────────────────────────────────────────────────────
  console.log("\n[A] No-Result 힌트");

  // A-1. search-law: 현실적으로 0건 반환하는 한글 쿼리
  // (완전 가상의 영문 쿼리는 법제처가 UPSTREAM 에러로 거부하므로 실제 사용자 쿼리 패턴 사용)
  {
    const r = await api(
      `/api/law/search-law?q=${encodeURIComponent("가나다마법률")}`
    );
    if (r.status !== 200) {
      warn(
        "search-law 0건 반환 → 200 기대",
        `status=${r.status} (법제처 업스트림 에러 가능)`
      );
    } else if (!Array.isArray(r.body.results) || r.body.results.length !== 0) {
      warn(
        "search-law 0건 기대했으나 결과 반환",
        `length=${r.body.results?.length ?? "?"}`
      );
    } else if (!r.body.hint) {
      fail("search-law hint 누락", JSON.stringify(r.body));
    } else {
      pass("search-law 0건 hint 반환", `hint="${r.body.hint.slice(0, 40)}..."`);
    }
  }

  // A-2. search-decisions: 0건 반환 가능성 높은 한글 쿼리
  {
    const r = await api(
      `/api/law/search-decisions?q=${encodeURIComponent("가나다라마바사아자차카타파하판례")}&domain=prec`
    );
    if (r.status !== 200) {
      warn("search-decisions 0건 → 200 유지", `status=${r.status}`);
    } else if (r.body.items && r.body.items.length !== 0) {
      warn("search-decisions 0건 기대", `length=${r.body.items.length}`);
    } else if (!r.body.hint) {
      fail("search-decisions hint 누락", JSON.stringify(r.body).slice(0, 120));
    } else if (!/💡/.test(r.body.hint)) {
      fail("search-decisions hint 포맷 (💡 누락)", r.body.hint);
    } else {
      pass("search-decisions 0건 hint 반환", `hint="${r.body.hint.slice(0, 40)}..."`);
    }
  }

  // A-3. law-text: 존재하지 않는 조문 → 404 + hint
  {
    const r = await api(
      `/api/law/law-text?lawName=${encodeURIComponent("소득세법")}&articleNo=${encodeURIComponent("제9999조")}`
    );
    if (r.status !== 404) {
      fail("law-text 없는 조문 → 404", `status=${r.status}`);
    } else if (!r.body.hint) {
      fail("law-text 404 응답 hint 누락", JSON.stringify(r.body));
    } else if (!/💡/.test(r.body.hint)) {
      fail("law-text hint 포맷", r.body.hint);
    } else {
      pass("law-text 없는 조문 404 + hint", `hint="${r.body.hint.slice(0, 40)}..."`);
    }
  }

  // ────────────────────────────────────────────────────────────
  // [B] 시나리오 4종 트리거 (체인 API로 간접 검증)
  // ────────────────────────────────────────────────────────────
  console.log("\n[B] 시나리오 4종 자동 트리거");

  async function chain(type, query, rawText) {
    const res = await fetch(`${BASE}/api/law/chain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, query, rawText }),
    });
    const body = await res.json();
    return { status: res.status, body };
  }

  // B-1. manual (절차/매뉴얼)
  {
    const r = await chain("full_research", "양도세 신청 절차 안내");
    const sections = r.body?.result?.sections ?? [];
    const manualSec = sections.find((s) =>
      /\[시나리오: manual\]/.test(s.heading ?? "")
    );
    if (r.status !== 200) fail("manual 체인 호출", `status=${r.status}`);
    else if (!manualSec) fail("manual 시나리오 섹션 미부착", `sections.len=${sections.length}`);
    else pass("manual 시나리오 트리거", manualSec.heading);
  }

  // B-2. delegation (위임입법)
  {
    const r = await chain("law_system", "소득세법 위임입법");
    const sections = r.body?.result?.sections ?? [];
    const sec = sections.find((s) =>
      /\[시나리오: delegation\]/.test(s.heading ?? "")
    );
    if (r.status !== 200) fail("delegation 체인", `status=${r.status}`);
    else if (!sec) fail("delegation 시나리오 미부착", `sections.len=${sections.length}`);
    else pass("delegation 시나리오 트리거", sec.heading);
  }

  // B-3. compliance (위헌/규제준수)
  {
    const r = await chain("full_research", "재산세 조례 위헌 여부");
    const sections = r.body?.result?.sections ?? [];
    const sec = sections.find((s) =>
      /\[시나리오: compliance\]/.test(s.heading ?? "")
    );
    if (r.status !== 200) fail("compliance 체인", `status=${r.status}`);
    else if (!sec) fail("compliance 시나리오 미부착", `sections.len=${sections.length}`);
    else pass("compliance 시나리오 트리거", sec.heading);
  }

  // B-4. fta (관세·FTA)
  {
    const r = await chain("full_research", "FTA 관세 원산지");
    const sections = r.body?.result?.sections ?? [];
    const sec = sections.find((s) =>
      /\[시나리오: fta\]/.test(s.heading ?? "")
    );
    if (r.status !== 200) fail("fta 체인", `status=${r.status}`);
    else if (!sec) fail("fta 시나리오 미부착", `sections.len=${sections.length}`);
    else pass("fta 시나리오 트리거", sec.heading);
  }

  // B-5. penalty (가산세 감경 — 기존 시나리오 회귀 체크)
  // maybeEnrich 수정으로 "감경" 중복 없이 검색 → 판례 있거나 NOT_FOUND 섹션 최소 1개 보장.
  {
    const r = await chain("action_basis", "가산세 감경");
    const sections = r.body?.result?.sections ?? [];
    const sec = sections.find((s) =>
      /\[시나리오: penalty\]/.test(s.heading ?? "")
    );
    if (!sec) fail("penalty 시나리오 회귀", `sections.len=${sections.length}`);
    else pass("penalty 시나리오 회귀", sec.heading);
  }

  // ────────────────────────────────────────────────────────────
  // [C] 마커 표준화
  // ────────────────────────────────────────────────────────────
  console.log("\n[C] 마커 포맷 표준화");

  // C-1. [NOT_FOUND] 노트 섹션 확인 (law_system 에서 존재하지 않는 법령)
  {
    const r = await chain("law_system", "존재하지않는법률XYZ12345");
    const sections = r.body?.result?.sections ?? [];
    const notFoundSec = sections.find(
      (s) => s.note && /\[NOT_FOUND\]/.test(s.note)
    );
    if (!notFoundSec) fail("NOT_FOUND 마커 노트 섹션", "섹션 없음");
    else {
      const hasIcon = /🔍|⚠️/.test(notFoundSec.note);
      const hasLlmWarning = /LLM.*추측|추측.*하지/.test(notFoundSec.note);
      if (!hasIcon) fail("NOT_FOUND 마커 아이콘", notFoundSec.note.slice(0, 80));
      else if (!hasLlmWarning) fail("NOT_FOUND LLM 경고문", notFoundSec.note.slice(0, 80));
      else pass("NOT_FOUND 마커 포맷 (아이콘 + LLM 경고)");
    }
  }

  // C-2. HALLUCINATION_DETECTED — verify_citations 로 검증
  {
    const res = await fetch(`${BASE}/api/law/verify-citations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "소득세법 제99999조(존재하지 않음)에 따라 과세한다.",
      }),
    });
    const body = await res.json();
    // 응답 envelope: { result: { header, isError, citations, ... } }
    const header = body?.result?.header ?? body?.header;
    if (res.status !== 200) fail("verify-citations 호출", `status=${res.status}`);
    else if (!/HALLUCINATION_DETECTED/.test(header ?? "")) {
      fail("HALLUCINATION 헤더", header ?? "없음");
    } else pass("HALLUCINATION_DETECTED 헤더", header);
  }

  // ────────────────────────────────────────────────────────────
  // [D] 별표 본문 변환 (/api/law/annex-content)
  // ────────────────────────────────────────────────────────────
  console.log("\n[D] 별표 본문 변환");

  // D-1. feature flag off 기본 테스트: 엔드포인트가 존재하는지 + 검증 스키마
  {
    // URL 검증 실패 케이스
    const r = await api(
      `/api/law/annex-content?url=${encodeURIComponent("https://evil.example.com/file.pdf")}`
    );
    if (r.status !== 400) {
      fail("annex-content 도메인 화이트리스트", `status=${r.status}`);
    } else {
      pass("annex-content 비법제처 URL 거부 (400)");
    }
  }

  // D-2. 실제 법령 별표 조회 → 링크 추출 → annex-content 호출
  {
    const listRes = await api(
      `/api/law/annexes?lawName=${encodeURIComponent("소득세법 시행규칙")}`
    );
    if (listRes.status !== 200) {
      fail("annexes 목록 조회", `status=${listRes.status}`);
    } else {
      const annexes = listRes.body.annexes ?? [];
      if (annexes.length === 0) {
        warn("annexes 목록 0건 — 법제처 API 특성", "D-2 skipped");
      } else {
        // 다운로드 URL 있는 첫 항목 선택
        const withUrl = annexes.find((a) => a.downloadUrl);
        if (!withUrl) {
          warn("annex downloadUrl 없음", `n=${annexes.length}`);
        } else {
          const params = new URLSearchParams({
            url: withUrl.downloadUrl,
            type: (withUrl.fileType || "").toUpperCase(),
          });
          if (withUrl.mst) params.set("mst", withUrl.mst);
          if (withUrl.annexNo) params.set("annexNo", withUrl.annexNo);
          const r = await api(`/api/law/annex-content?${params.toString()}`);
          if (r.status !== 200) {
            fail("annex-content 본문 변환", `status=${r.status} body=${JSON.stringify(r.body).slice(0, 150)}`);
          } else if (!r.body.content) {
            fail("annex-content content 필드", JSON.stringify(r.body).slice(0, 150));
          } else if (r.body.status !== "ok" && r.body.status !== "NOT_CONVERTED") {
            fail("annex-content status 값", r.body.status);
          } else {
            pass(
              `annex-content 변환 (fileType=${r.body.fileType}, status=${r.body.status})`,
              `length=${r.body.content.length}`
            );
          }
        }
      }
    }
  }

  // ────────────────────────────────────────────────────────────
  // [E] UI 실환경 — 별표 탭 본문 보기 버튼
  // ────────────────────────────────────────────────────────────
  console.log("\n[E] UI 실환경 — 별표 탭");

  const browser = await chromium.launch({ headless: !HEADED });
  const context = await browser.newContext({ locale: "ko-KR" });
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  try {
    await page.goto(`${BASE}/law`, { waitUntil: "networkidle", timeout: 30_000 });
    // 별표 탭 클릭
    await page.getByRole("tab", { name: /별표/ }).click();
    await page.waitForSelector('[role="tabpanel"][data-tab-value="annex"]', {
      timeout: 5000,
    });
    // 법령명 "소득세법 시행규칙" 입력 후 조회
    const panel = page.locator('[role="tabpanel"][data-tab-value="annex"]');
    const input = panel.locator('input[placeholder*="법령명"]');
    await input.fill("소득세법 시행규칙");
    await panel.getByRole("button", { name: /별표 목록 조회/ }).click();
    // 결과 또는 빈 안내 대기
    const ok = await page
      .waitForFunction(
        () => {
          const p = document.querySelector('[role="tabpanel"][data-tab-value="annex"]');
          if (!p) return false;
          const text = p.textContent ?? "";
          return /별표\s*\d|별표 데이터가 반환되지 않았습니다|(?:원문|검색)/.test(text);
        },
        null,
        { timeout: 20_000 }
      )
      .then(() => true)
      .catch(() => false);
    if (!ok) fail("별표 탭 조회 응답 대기", "20초 내 응답 없음");
    else pass("별표 탭 조회 응답 렌더");

    // "본문 보기" 버튼이 렌더될 때까지 최대 5초 대기
    const viewBtn = panel.getByRole("button", { name: "본문 보기" }).first();
    await viewBtn.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
    if (await viewBtn.count()) {
      await viewBtn.click();
      const opened = await page
        .waitForFunction(
          () => {
            const p = document.querySelector(
              '[role="tabpanel"][data-tab-value="annex"]'
            );
            if (!p) return false;
            const pres = p.querySelectorAll("pre");
            const hasContent = Array.from(pres).some(
              (el) => (el.textContent ?? "").length > 0
            );
            const hasMarker = /본문 변환 실패|NOT_CONVERTED/.test(p.textContent ?? "");
            return hasContent || hasMarker;
          },
          null,
          { timeout: 30_000 }
        )
        .then(() => true)
        .catch(() => false);
      if (!opened) fail("'본문 보기' 클릭 → 본문/마커 렌더", "30초 내 미노출");
      else pass("'본문 보기' 버튼 클릭 후 렌더");
    } else {
      warn("'본문 보기' 버튼 없음", "지원 포맷 별표 부재");
    }
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "annex-tab.png"), fullPage: true }).catch(() => {});
  } catch (e) {
    fail("UI 별표 탭 E2E", String(e).slice(0, 200));
  }

  // ────────────────────────────────────────────────────────────
  // [F] SectionView 마커 UI 렌더 검증 (체인 탭)
  // ────────────────────────────────────────────────────────────
  console.log("\n[F] 체인 탭 마커 UI");

  try {
    await page.goto(`${BASE}/law`, { waitUntil: "networkidle" });
    await page.getByRole("tab", { name: /리서치 체인/ }).click();
    await page.waitForSelector('[role="tabpanel"][data-tab-value="chain"]');
    const panel = page.locator('[role="tabpanel"][data-tab-value="chain"]');
    // 법체계 + 존재하지 않는 법령 → NOT_FOUND 배너 유도
    await panel.locator("select").selectOption("law_system");
    const q = panel.locator('input[placeholder*="키워드"]');
    await q.fill("가나다마법률");
    await panel.getByRole("button", { name: /체인 실행/ }).click();
    const ok = await page
      .waitForFunction(
        () => {
          const p = document.querySelector(
            '[role="tabpanel"][data-tab-value="chain"]'
          );
          if (!p) return false;
          return /NOT_FOUND|조회 결과 없음|법령 없음/.test(p.textContent ?? "");
        },
        null,
        { timeout: 30_000 }
      )
      .then(() => true)
      .catch(() => false);
    if (!ok) fail("체인 NOT_FOUND UI 렌더", "미표시");
    else pass("체인 NOT_FOUND 마커 UI 표시");
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "chain-marker.png"), fullPage: true }).catch(() => {});
  } catch (e) {
    fail("UI 체인 마커", String(e).slice(0, 200));
  }

  // ────────────────────────────────────────────────────────────
  // [G] LawSearchTab 0건 힌트 UI
  // ────────────────────────────────────────────────────────────
  console.log("\n[G] LawSearchTab 0건 힌트 UI");
  try {
    await page.goto(`${BASE}/law`, { waitUntil: "networkidle" });
    await page.getByRole("tab", { name: /법령·조문/ }).click();
    await page.waitForSelector('[role="tabpanel"][data-tab-value="law"]');
    const panel = page.locator('[role="tabpanel"][data-tab-value="law"]');
    const input = panel.locator('input[placeholder*="법령명"]').first();
    await input.fill("가나다마법률");
    await panel.getByRole("button", { name: /^검색$/ }).first().click();
    const ok = await page
      .waitForFunction(
        () => {
          const p = document.querySelector(
            '[role="tabpanel"][data-tab-value="law"]'
          );
          if (!p) return false;
          const text = p.textContent ?? "";
          // "법제처에 요청 중..." 로딩 인디케이터가 사라진 뒤에만 판정
          if (/법제처에 요청 중/.test(text)) return false;
          return /검색 결과가 없습니다/.test(text) && /💡/.test(text);
        },
        null,
        { timeout: 60_000 }
      )
      .then(() => true)
      .catch(() => false);
    if (!ok) fail("LawSearchTab 0건 힌트 UI", "검색 결과 없음 + 💡 미표시");
    else pass("LawSearchTab 0건 힌트 UI");
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "law-zero-hint.png"), fullPage: true }).catch(() => {});
  } catch (e) {
    fail("LawSearchTab 힌트 UI", String(e).slice(0, 200));
  }

  await context.close();
  await browser.close();

  // ─────────────── SUMMARY ───────────────
  const pCount = results.filter((r) => r.status === "PASS").length;
  const fCount = results.filter((r) => r.status === "FAIL").length;
  const wCount = results.filter((r) => r.status === "WARN").length;
  console.log(`\n==== P0P1 SUMMARY: ${pCount} PASS / ${fCount} FAIL / ${wCount} WARN ====\n`);
  if (fCount > 0) {
    console.log("-- FAIL --");
    for (const r of results.filter((r) => r.status === "FAIL")) {
      console.log(`  ✗ ${r.name} — ${r.detail}`);
    }
  }
  if (wCount > 0) {
    console.log("-- WARN --");
    for (const r of results.filter((r) => r.status === "WARN")) {
      console.log(`  ⚠ ${r.name} — ${r.detail}`);
    }
  }
  if (consoleErrors.length > 0) {
    console.log(`\n-- Console Errors (${consoleErrors.length}) --`);
    for (const e of consoleErrors.slice(0, 10)) console.log(`  ${e}`);
  }

  process.exit(fCount > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
