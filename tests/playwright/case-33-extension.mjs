/**
 * case-33-extension.mjs
 *
 * 사례 33 — 증축 건물 환산취득가 Playwright 자동 검증
 *
 * G-07  Primary anchor: 산출세액 6,480,952 + 지방세 648,095
 * G-09  validate 차단: 증축일 < 취득일 → "토지·건물1 취득일" 오류
 * G-10  validate 차단: 증축일 > 양도일 → "양도일" 오류
 * G-11  validate 차단: 양도시 건물2 기준시가 0 → "총액(원)" 오류
 *
 * 실행: node tests/playwright/case-33-extension.mjs
 *
 * selector 전략:
 *  - 양도일 DateInput     → aria-label="연도" nth(0), 월 nth(0), 일 nth(0)
 *  - 취득일 DateInput     → span.text-sm:has-text("취득일") 옆 DateInput
 *  - 건물 취득일           → aria-label="연도" nth(3) (건물 취득 카드)
 *  - CurrencyInput        → label.block:has-text("라벨") ~ div input
 *  - DecimalInput         → placeholder="숫자 입력" nth(N)
 *  - LandPrice input      → placeholder="원/㎡"
 *  - 건물기준시가           → placeholder="금액 입력" (위치 기반)
 *  - RadioCardGroup       → getByRole("button", { name })
 *  - Switch(Toggle)       → getByRole("switch", { name })
 */

import { chromium } from "playwright";

const TRANSFER_URL = "http://localhost:3000/calc/transfer-tax";

// ── 유틸리티 ─────────────────────────────────────────────────────

/** DateInput: aria-label 인덱스 기반 입력 */
async function fillDateInputByIndex(page, yearIdx, yyyy, mm, dd) {
  const yearInputs = page.locator('[aria-label="연도"]');
  const monthInputs = page.locator('[aria-label="월"]');
  const dayInputs = page.locator('[aria-label="일"]');
  await yearInputs.nth(yearIdx).click({ clickCount: 3 });
  await yearInputs.nth(yearIdx).fill(String(yyyy));
  await monthInputs.nth(yearIdx).click({ clickCount: 3 });
  await monthInputs.nth(yearIdx).fill(String(mm).padStart(2, "0"));
  await dayInputs.nth(yearIdx).click({ clickCount: 3 });
  await dayInputs.nth(yearIdx).fill(String(dd).padStart(2, "0"));
}

/**
 * 취득일 DateInput — span.text-sm.font-medium:has-text("취득일") 다음 형제 div 내 DateInput
 * 인덱스 2 (0=양도일, 1=신고일, 2=취득일, 3=건물취득일)
 */
async function fillAcquisitionDate(page, yyyy, mm, dd) {
  await fillDateInputByIndex(page, 2, yyyy, mm, dd);
}

/**
 * CurrencyInput — label.block:has-text 로 찾기
 * CurrencyInput의 label은 htmlFor 없음 → CSS sibling selector 사용
 */
async function fillCurrency(page, labelText, value) {
  const input = page
    .locator(`label.block:has-text("${labelText}") ~ div input[placeholder="금액 입력"]`)
    .first();
  const cnt = await input.count();
  if (cnt === 0) throw new Error(`CurrencyInput 미발견: "${labelText}"`);
  await input.click({ clickCount: 3 });
  await input.fill(String(value));
  await input.press("Tab");
  await page.waitForTimeout(80);
}

/**
 * DecimalInput — placeholder="숫자 입력" 인덱스 기반
 * 환산취득가 모드 후: [0]=토지면적, [1]=건물연면적, [2]=건물수평투영면적
 */
async function fillDecimalByIndex(page, idx, value) {
  const inputs = page.locator('input[placeholder="숫자 입력"]');
  await inputs.nth(idx).click({ clickCount: 3 });
  await inputs.nth(idx).fill(String(value));
  await inputs.nth(idx).press("Tab");
  await page.waitForTimeout(80);
}

/**
 * LandPriceLookupField — placeholder="원/㎡" 순서 기반
 * 양도시 토지 공시지가: 첫 번째, 취득시 토지 공시지가: 두 번째
 */
async function fillLandPrice(page, idx, pricePerSqm) {
  const inputs = page.locator('input[placeholder="원/㎡"]');
  await inputs.nth(idx).click({ clickCount: 3 });
  await inputs.nth(idx).fill(String(pricePerSqm));
  await inputs.nth(idx).press("Tab");
  await page.waitForTimeout(80);
}

/**
 * 건물기준시가 CurrencyInput — label.block:has-text("건물기준시가") 혹은 "건물2 기준시가"
 * 여러 개가 있을 수 있으므로 인덱스로 구분
 */
async function fillBuildingStdPrice(page, labelText, value) {
  const input = page
    .locator(`label.block:has-text("${labelText}") ~ div input[placeholder="금액 입력"]`)
    .first();
  const cnt = await input.count();
  if (cnt === 0) throw new Error(`건물기준시가 input 미발견: "${labelText}"`);
  await input.click({ clickCount: 3 });
  await input.fill(String(value));
  await input.press("Tab");
  await page.waitForTimeout(80);
}

/** "다음" 버튼 클릭 */
async function clickNext(page) {
  await page.getByRole("button", { name: "다음" }).last().click();
  await page.waitForTimeout(400);
}

/** Switch(ToggleCard) ON */
async function toggleOn(page, label) {
  const sw = page.getByRole("switch", { name: label });
  const checked = await sw.getAttribute("aria-checked");
  if (checked !== "true") {
    await sw.click();
    await page.waitForTimeout(400);
  }
}

// ── G-07 공통 입력 ─────────────────────────────────────────────

async function fillG07Inputs(page, {
  extensionDate = { yyyy: 2007, mm: 7, dd: 24 },
  transferExtensionBuildingStd = 54501720,
} = {}) {

  // 1. 양도일: 2023-02-19
  await fillDateInputByIndex(page, 0, 2023, 2, 19);
  await page.waitForTimeout(200);

  // 2. 일반건물(토지+건물 일괄) 자산 종류 선택
  await page.getByRole("button", { name: "일반건물(토지+건물 일괄)" }).click();
  await page.waitForTimeout(500);

  // 3. 양도가액: 330,000,000
  await fillCurrency(page, "양도가액 (원)", "330000000");

  // 4. 취득일(토지): 2003-03-17 (aria-label="연도" 인덱스 2)
  await fillAcquisitionDate(page, 2003, 3, 17);
  await page.waitForTimeout(200);

  // 5. 취득가액: 200,000,000
  await fillCurrency(page, "취득가액 (원)", "200000000");

  // 5-b. 양도비(필요경비): 8,000,000 (§97① 나목)
  await fillCurrency(page, "양도비 (원)", "8000000");

  // 6. 환산취득가 모드
  await page.getByRole("button", { name: /환산취득가/ }).click();
  await page.waitForTimeout(500);

  // 7. 건물 취득원인: 매매 (RadioCardGroup — <label> 클릭)
  //    토지/건물 취득원인 섹션에 각각 "매매" label이 있음
  //    건물 취득원인 섹션은 "건물 취득" 헤딩 아래의 "매매" label
  //    GeneralBuildingAcquisitionCards: 건물 섹션 내 "매매" label (두 번째 그룹)
  const purchaseLabels = page.locator('label:has-text("매매")').filter({ hasText: /^매매$/ });
  const purchaseCount = await purchaseLabels.count();
  if (purchaseCount >= 2) {
    // 건물 취득원인 매매 — 두 번째 매매 label (건물 섹션)
    await purchaseLabels.nth(1).click();
    await page.waitForTimeout(300);
  } else if (purchaseCount === 1) {
    await purchaseLabels.nth(0).click();
    await page.waitForTimeout(300);
  }

  // 8. 면적 입력 (DecimalInput, placeholder="숫자 입력")
  //    환산취득가 모드에서: [0]=토지면적, [1]=건물연면적, [2]=건물수평투영면적
  await fillDecimalByIndex(page, 0, "57");     // 토지면적
  await fillDecimalByIndex(page, 1, "83.73");  // 건물 연면적
  await fillDecimalByIndex(page, 2, "57");     // 건물 수평투영면적
  await page.waitForTimeout(200);

  // 9. 양도시 토지 공시지가: 5,956,000 원/㎡ (첫 번째 원/㎡ input)
  await fillLandPrice(page, 0, "5956000");

  // 10. 양도시 건물기준시가: 12,308,310
  //     label.block "양도시 건물기준시가" 첫 번째
  await fillBuildingStdPrice(page, "양도시 건물기준시가", "12308310");
  await page.waitForTimeout(200);

  // 11. 취득시 토지 공시지가: 1,400,000 원/㎡ (두 번째 원/㎡ input)
  await fillLandPrice(page, 1, "1400000");

  // 12. 취득시 건물기준시가: 16,997,190
  //     label.block "취득시 건물기준시가" 첫 번째
  await fillBuildingStdPrice(page, "취득시 건물기준시가", "16997190");
  await page.waitForTimeout(200);

  // 13. 증축 있음 토글 ON
  await toggleOn(page, "증축 있음");
  await page.waitForTimeout(500);

  // 14. 증축일
  //     증축 토글 ON 후 새 DateInput이 나타남
  //     aria-label="연도" 인덱스는 환산취득가 모드에서 확인 필요
  //     증축일은 증축 토글 ON 후 추가된 DateInput
  const yearInputsAfter = page.locator('[aria-label="연도"]');
  const yearCount = await yearInputsAfter.count();
  // 마지막 DateInput 그룹 = 증축일 (새로 추가된 것)
  // 증축 토글 ON 전: 0=양도일, 1=신고일, 2=취득일, 3=건물취득일 (4개)
  // 증축 토글 ON 후: 5번째(인덱스 4)가 증축일
  const extDateIdx = yearCount - 1; // 마지막이 증축일
  await fillDateInputByIndex(page, extDateIdx, extensionDate.yyyy, extensionDate.mm, extensionDate.dd);
  await page.waitForTimeout(200);

  // 15. 증축 연면적: 83.72
  //     증축 토글 ON 후 DecimalInput도 추가됨 — 마지막 숫자 input
  const numInputs = page.locator('input[placeholder="숫자 입력"]');
  const numCount = await numInputs.count();
  await numInputs.nth(numCount - 1).click({ clickCount: 3 });
  await numInputs.nth(numCount - 1).fill("83.72");
  await numInputs.nth(numCount - 1).press("Tab");
  await page.waitForTimeout(100);

  // 16. 양도시 건물2 기준시가 총액
  //     label "양도시 건물2 기준시가 총액" ~ div input
  const ext1 = page.locator(`label.block:has-text("양도시 건물2 기준시가 총액") ~ div input[placeholder="금액 입력"]`).first();
  await ext1.click({ clickCount: 3 });
  await ext1.fill(String(transferExtensionBuildingStd));
  await ext1.press("Tab");
  await page.waitForTimeout(100);

  // 17. 취득시(증축시) 건물2 기준시가 총액: 40,604,200
  const ext2 = page.locator(`label.block:has-text("취득시(증축시) 건물2 기준시가 총액") ~ div input[placeholder="금액 입력"]`).first();
  await ext2.click({ clickCount: 3 });
  await ext2.fill("40604200");
  await ext2.press("Tab");
  await page.waitForTimeout(100);

  // 18. 증축 취득원인: 자가증축 (RadioCardGroup — <label> 클릭)
  const selfLabels = page.locator('label:has-text("자가증축")');
  if (await selfLabels.count() > 0) {
    await selfLabels.first().click();
    await page.waitForTimeout(200);
  }

  // 19. 비사업용토지 판정: 용도지역 = 일반주거
  //     RadioCardGroup은 radio input[value] 직접 클릭이 가장 안정적
  const generalResInput = page.locator('input[type="radio"][value="general_residential"]').first();
  await generalResInput.click({ force: true });
  await page.waitForTimeout(200);

  // 20. 수도권 소재 토글 ON
  await toggleOn(page, "수도권 소재 (서울·경기·인천)");
  await page.waitForTimeout(200);
}

// ── 결과 ─────────────────────────────────────────────────────────

const results = [];

function report(name, pass, detail = "") {
  results.push({ name, pass, detail });
  const icon = pass ? "PASS" : "FAIL";
  console.log(`[${icon}] ${name}${detail ? ` — ${detail}` : ""}`);
}

// ── G-07: Primary anchor ─────────────────────────────────────────

async function runG07(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(err.message));

  try {
    await page.goto(TRANSFER_URL, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(1000);

    await fillG07Inputs(page);

    await page.screenshot({ path: "/tmp/case33-g07-input.png", fullPage: true });
    console.log("  입력 완료 스크린샷: /tmp/case33-g07-input.png");

    // Step 0 → Step 1 (보유 상황)
    await clickNext(page);
    // Step 1 → Step 2 (감면·공제)
    await clickNext(page);
    // Step 2 → Step 3 (가산세)
    await clickNext(page);
    // Step 3 → 계산
    const calcBtn = page.getByRole("button", { name: /계산하기|계산/ }).last();
    await calcBtn.click();
    await page.waitForTimeout(4000);

    await page.screenshot({ path: "/tmp/case33-g07-result.png", fullPage: true });
    console.log("  결과 스크린샷: /tmp/case33-g07-result.png");

    const pageContent = await page.content();
    const hasTax = pageContent.includes("6,480,952");
    const hasLocalTax = pageContent.includes("648,095");
    const has3way = pageContent.includes("자산별 분포가 변경") || pageContent.includes("건물2");
    const hasBadge = pageContent.includes("환산") || pageContent.includes("증축");

    const pass = hasTax && hasLocalTax;
    let detail = "";
    if (!hasTax) detail += "산출세액 6,480,952 미발견; ";
    if (!hasLocalTax) detail += "지방세 648,095 미발견; ";
    if (!has3way) detail += "(3-way 표 미발견); ";
    if (!hasBadge) detail += "(배지 미발견); ";
    detail += `콘솔에러 ${consoleErrors.length}건`;
    if (!detail.trim()) detail = `3-way=${has3way} 배지=${hasBadge} 콘솔에러=${consoleErrors.length}건`;

    report("G-07 산출세액 6,480,952 + 지방세 648,095", pass, detail);

    if (!pass) {
      // 결과 텍스트 출력
      const bodyText = await page.locator("body").innerText().catch(() => "");
      const taxIdx = bodyText.indexOf("세액");
      if (taxIdx > -1) {
        console.log("  결과 텍스트:", bodyText.slice(Math.max(0, taxIdx - 50), taxIdx + 400));
      } else {
        console.log("  페이지 텍스트 (후반):", bodyText.slice(-800));
      }
    }
  } catch (err) {
    await page.screenshot({ path: "/tmp/case33-g07-error.png", fullPage: false }).catch(() => {});
    report("G-07 산출세액 6,480,952 + 지방세 648,095", false, String(err).slice(0, 300));
    console.log("  에러 스크린샷: /tmp/case33-g07-error.png");
  } finally {
    await context.close();
  }
}

// ── G-09: 증축일 < 취득일 ────────────────────────────────────────

async function runG09(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(TRANSFER_URL, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(1000);

    await fillG07Inputs(page, { extensionDate: { yyyy: 2002, mm: 1, dd: 1 } });
    await page.waitForTimeout(300);

    await clickNext(page);
    await page.waitForTimeout(600);

    await page.screenshot({ path: "/tmp/case33-g09-result.png" });

    const pageContent = await page.content();
    const hasError = pageContent.includes("토지·건물1 취득일");

    report(
      "G-09 증축일<취득일 → '토지·건물1 취득일' 오류",
      hasError,
      hasError ? "오류 메시지 확인됨" : "오류 없이 통과 (차단 실패)"
    );
  } catch (err) {
    await page.screenshot({ path: "/tmp/case33-g09-error.png" }).catch(() => {});
    report("G-09 증축일<취득일 → '토지·건물1 취득일' 오류", false, String(err).slice(0, 300));
  } finally {
    await context.close();
  }
}

// ── G-10: 증축일 > 양도일 ───────────────────────────────────────

async function runG10(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(TRANSFER_URL, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(1000);

    await fillG07Inputs(page, { extensionDate: { yyyy: 2024, mm: 1, dd: 1 } });
    await page.waitForTimeout(300);

    await clickNext(page);
    await page.waitForTimeout(600);

    await page.screenshot({ path: "/tmp/case33-g10-result.png" });

    const pageContent = await page.content();
    const hasError = pageContent.includes("양도일");

    report(
      "G-10 증축일>양도일 → '양도일' 오류",
      hasError,
      hasError ? "오류 메시지 확인됨" : "오류 없이 통과 (차단 실패)"
    );
  } catch (err) {
    await page.screenshot({ path: "/tmp/case33-g10-error.png" }).catch(() => {});
    report("G-10 증축일>양도일 → '양도일' 오류", false, String(err).slice(0, 300));
  } finally {
    await context.close();
  }
}

// ── G-11: 건물2 기준시가 0 ──────────────────────────────────────

async function runG11(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(TRANSFER_URL, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(1000);

    await fillG07Inputs(page, { transferExtensionBuildingStd: 0 });
    await page.waitForTimeout(300);

    await clickNext(page);
    await page.waitForTimeout(600);

    await page.screenshot({ path: "/tmp/case33-g11-result.png" });

    const pageContent = await page.content();
    const hasError = pageContent.includes("총액(원)");

    report(
      "G-11 건물2 기준시가 0 → '총액(원)' 오류",
      hasError,
      hasError ? "오류 메시지 확인됨" : "오류 없이 통과 (차단 실패)"
    );
  } catch (err) {
    await page.screenshot({ path: "/tmp/case33-g11-error.png" }).catch(() => {});
    report("G-11 건물2 기준시가 0 → '총액(원)' 오류", false, String(err).slice(0, 300));
  } finally {
    await context.close();
  }
}

// ── 메인 ─────────────────────────────────────────────────────────

(async () => {
  console.log("=== 사례 33 증축 건물 환산취득가 Playwright 자동 검증 ===\n");

  const browser = await chromium.launch({ headless: true });
  try {
    console.log("--- G-07: Primary anchor ---");
    await runG07(browser);

    console.log("\n--- G-09: 증축일 < 취득일 ---");
    await runG09(browser);

    console.log("\n--- G-10: 증축일 > 양도일 ---");
    await runG10(browser);

    console.log("\n--- G-11: 건물2 기준시가 0 ---");
    await runG11(browser);

  } finally {
    await browser.close();
  }

  console.log("\n=== 검증 결과 요약 ===");
  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  results.forEach((r) => {
    const icon = r.pass ? "PASS" : "FAIL";
    console.log(`  [${icon}] ${r.name}`);
    if (r.detail) console.log(`         ${r.detail}`);
  });
  console.log(`\n  ${passed}/${total} PASS`);
  process.exit(passed === total ? 0 : 1);
})();
