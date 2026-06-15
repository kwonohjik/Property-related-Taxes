import { test, expect, type Page } from "@playwright/test";

/**
 * 종합부동산세 — 재산세 감면율(지자체 조례) 사례2 E2E
 *
 * 교재 "일반 1주택자로 재산세 감면된 경우" (2022 귀속)
 *   - 과세연도 2022
 *   - 1세대1주택자 아님 (일반 1주택자)
 *   - 공시가격 10억, 재산세 감면율 25%
 *   - 직전연도 공시 9억 (자동계산 모드)
 *
 * 실측 anchor (lib/tax-engine/comprehensive-tax.ts 직접 API 호출 검증):
 *   - effectiveIncludedAssessedValue = 750,000,000 (10억 × 0.75)
 *   - taxBase = 90,000,000
 *   - calculatedTax(Step1) = 540,000
 *   - propertyTaxCredit.creditAmount(Step2) = 245,077
 *   - determinedHousingTax(Step6) = 294,923
 *   - housingRuralSpecialTax = 58,984
 *   - comp-b3-③-housing = 750,000,000
 *
 * worktree: E2E_PORT=3003 npx playwright test e2e/comprehensive-reduction-rate.spec.ts
 */

const PAGE = "/calc/comprehensive-tax";

async function clickNext(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^다음/ }).click();
}

async function calcAndWait(page: Page): Promise<void> {
  const calcResponse = page.waitForResponse(
    (r) =>
      r.url().includes("/api/calc/comprehensive") &&
      r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /계산하기/ }).click();
  const resp = await calcResponse;
  expect(resp.ok(), `계산 API 비정상 ${resp.status()}`).toBe(true);
}

/**
 * 사례2 — Step1~Step4 입력 (1세대1주택 OFF, 공시가격 10억, 감면율 25%)
 *
 * Step1: 2022 과세연도 선택, 1세대1주택 스위치 OFF (기본값) → 다음
 * Step2: 공시가격 10억, 감면율 25% 입력 → 다음
 * Step3: 합산배제 없음 → 다음
 * Step4: 토지 없음 → 다음
 */
async function fillCase2ThroughStep4(page: Page): Promise<void> {
  await page.goto(PAGE);

  // Step1: 2022 과세연도 선택 (1세대1주택 스위치 OFF — 기본값 유지)
  await page.getByRole("radio", { name: "2022" }).check();
  await clickNext(page);

  // Step2: 공시가격 10억 + 감면율 25% 입력
  // CurrencyInput placeholder="금액 입력" — 공시가격 총액
  await page.getByPlaceholder("금액 입력").first().fill("1000000000");
  // DecimalInput: nth(0)=지분율(기본100 유지), nth(1)=재산세 감면율(%)
  await page.getByPlaceholder("숫자 입력").nth(1).fill("25");
  await clickNext(page); // → Step3
  await clickNext(page); // → Step4
  await clickNext(page); // → Step5
}

// ════════════════════════════════════════════════════════════
// 메인 테스트 스위트
// ════════════════════════════════════════════════════════════

test.describe("종합부동산세 재산세 감면율(사례2) — 폼→결과 전수 검증", () => {
  /**
   * R-1: 사례2 핵심 anchor — 납부할세액 294,923 + 감면후 공시가격 7.5억 bullet
   *
   * 검증:
   * - 결과 화면 노출 (294,923 텍스트)
   * - 산출근거 카드 펼침 → Step1 감면후 공시가격 750,000,000 bullet
   * - Step6 최종 납부할세액 294,923
   * - 과세표준 90,000,000 (주택분 과세표준 계산 섹션)
   */
  test("R-1: 사례2 — 납부할세액 294,923 + 감면후 공시가격 bullet 검증", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const consoleErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

    await fillCase2ThroughStep4(page);

    // Step5: 자동계산 모드 + 직전 공시가격 9억
    await page.getByTestId("cap-mode-auto").click();
    await page.getByPlaceholder("0").first().fill("900000000");
    // 직전연도 1세대1주택 스위치 OFF (기본값 — 일반 1주택자)
    await calcAndWait(page);

    // 결과 화면 노출 확인
    await expect(page.getByText(/294,923/).first()).toBeVisible({
      timeout: 30_000,
    });

    // ── 산출근거 카드(payable-step1~step6) ──
    const card = page.getByTestId("housing-payable-calc");
    await card.scrollIntoViewIfNeeded();

    // 기본 접힘 — Step6 숨김
    await expect(page.getByTestId("payable-step6")).toBeHidden();

    // 펼침
    await card
      .getByRole("button", { name: /종합부동산세 납부할 세액 산출 근거/ })
      .click();

    // Step1: 재산세공제전 종부세액 = 540,000
    await expect(page.getByTestId("payable-step1")).toContainText("540,000원");

    // Step1 영역(StepLine + 형제 Bullet들)에서 과세 공시가격 bullet 확인
    // Bullet은 StepLine의 형제이므로 housing-payable-calc 카드 전체에서 검색
    // eok() 함수가 750,000,000 → "7.5억원"으로 렌더링
    // [라벨 변경] "감면후 공시가격" → "과세 공시가격" (지분+감면 모든 케이스 정확한 중립어)
    await expect(card).toContainText("과세 공시가격");
    await expect(card).toContainText("7.5억원");

    // Step2: 공제할 재산세액 = 245,077
    await expect(page.getByTestId("payable-step2")).toContainText("245,077원");

    // Step6: 납부할세액 = 294,923
    await expect(page.getByTestId("payable-step6")).toContainText("294,923원");

    expect(consoleErrors, `콘솔 에러: ${consoleErrors.join("\n")}`).toEqual([]);
  });

  /**
   * R-2: 과세표준 + 별지 부표3 ③ 감면후 공시가격 검증
   *
   * 검증:
   * - "주택분 과세표준 계산" 섹션: 공제 후 = 750,000,000 - 600,000,000 = 150,000,000 / 과세표준 90,000,000
   * - 신고서 서식 펼침 → comp-b3-③-housing = 750,000,000 (감면후 공시가격)
   */
  test("R-2: 사례2 — 과세표준 90,000,000 + 별지부표3 ③ 감면후 공시가격 검증", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const consoleErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

    await fillCase2ThroughStep4(page);

    // Step5: 자동계산 모드 + 직전 공시가격 9억
    await page.getByTestId("cap-mode-auto").click();
    await page.getByPlaceholder("0").first().fill("900000000");
    await calcAndWait(page);

    await expect(page.getByText(/294,923/).first()).toBeVisible({
      timeout: 30_000,
    });

    // 과세표준 90,000,000 — 주택분 과세표준 계산 섹션
    // TaxRow "공정시장가액비율 적용" 행에 표시됨
    await expect(page.getByText(/90,000,000/).first()).toBeVisible();

    // 신고서 서식 펼침
    await page.getByRole("button", { name: /신고서 서식/ }).click();

    // 별지 부표3 ③ 감면후 공시가격 = 750,000,000
    await expect(
      page.locator('[data-besshi-cell="comp-b3-③-housing"]'),
    ).toContainText("750,000,000");

    expect(consoleErrors, `콘솔 에러: ${consoleErrors.join("\n")}`).toEqual([]);
  });

  /**
   * R-3: 감면율 0% (미입력) — 일반 과세 (감면후 공시가격 bullet 미노출)
   *
   * 감면율 미입력 시 effectiveIncludedAssessedValue = includedAssessedValue → bullet 미노출 확인.
   */
  test("R-3: 감면율 0% — 감면후 공시가격 bullet 미노출", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto(PAGE);

    // Step1: 2022 과세연도, 1세대1주택 OFF
    await page.getByRole("radio", { name: "2022" }).check();
    await clickNext(page);

    // Step2: 공시가격 10억, 감면율 미입력
    await page.getByPlaceholder("금액 입력").first().fill("1000000000");
    // 감면율 입력란을 비워둠 (기본 미입력)
    await clickNext(page); // → Step3
    await clickNext(page); // → Step4
    await clickNext(page); // → Step5

    // Step5: 직접입력 모드 (기본) — 전년도 세액 입력 없이 바로 계산
    await calcAndWait(page);

    await expect(page.getByText(/납부할/).first()).toBeVisible({
      timeout: 30_000,
    });

    const card = page.getByTestId("housing-payable-calc");
    await card.scrollIntoViewIfNeeded();
    await card
      .getByRole("button", { name: /종합부동산세 납부할 세액 산출 근거/ })
      .click();

    // 과세 공시가격 bullet 미노출 (hasReduction = false)
    await expect(page.getByTestId("payable-step1")).not.toContainText(
      "과세 공시가격",
    );
  });
});

/**
 * 사례12 회귀 — 기존 1세대1주택 케이스가 이번 기능 추가 후에도 동작하는지 확인.
 * comprehensive-payable-calc.spec.ts의 P-1을 최소 범위로 재검증.
 */
test.describe("종합부동산세 사례12 회귀 (감면율 기능 추가 후)", () => {
  test("REGR-1: 사례12 납부할세액 302,400 (1세대1주택, 감면율 없음)", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const consoleErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

    await page.goto(PAGE);

    // Step1: 2022, 1세대1주택 ON + 생년·취득일
    await page.getByRole("radio", { name: "2022" }).check();
    await page.getByRole("switch").first().click();
    await page.getByLabel("연도").first().fill("1955");
    await page.getByLabel("월").first().fill("3");
    await page.getByLabel("일").first().fill("1");
    await page.getByLabel("연도").nth(1).fill("2012");
    await page.getByLabel("월").nth(1).fill("1");
    await page.getByLabel("일").nth(1).fill("1");
    await clickNext(page);

    // Step2: 공시가격 15억, 감면율 미입력
    await page.getByPlaceholder("금액 입력").first().fill("1500000000");
    await page.getByPlaceholder("0.00").first().fill("168");
    await clickNext(page); // → Step3
    await clickNext(page); // → Step4
    await clickNext(page); // → Step5

    // Step5: 자동모드 + 14억 + 직전 1세대1주택
    await page.getByTestId("cap-mode-auto").click();
    await page.getByPlaceholder("0").first().fill("1400000000");
    await page.getByRole("switch").last().click();

    const calcResponse = page.waitForResponse(
      (r) =>
        r.url().includes("/api/calc/comprehensive") &&
        r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: /계산하기/ }).click();
    const resp = await calcResponse;
    expect(resp.ok()).toBe(true);

    await expect(page.getByText(/302,400/).first()).toBeVisible({
      timeout: 30_000,
    });

    // 과세 공시가격 bullet 미노출 (사례12는 감면율/지분 없음)
    const card = page.getByTestId("housing-payable-calc");
    await card
      .getByRole("button", { name: /종합부동산세 납부할 세액 산출 근거/ })
      .click();
    await expect(page.getByTestId("payable-step1")).not.toContainText(
      "과세 공시가격",
    );
    await expect(page.getByTestId("payable-step6")).toContainText("302,400원");

    expect(consoleErrors, `콘솔 에러: ${consoleErrors.join("\n")}`).toEqual([]);
  });
});
