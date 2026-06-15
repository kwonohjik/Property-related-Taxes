import { test, expect, type Page } from "@playwright/test";

/**
 * 종합부동산세 — 공유지분(지분율) 사례3 E2E
 *
 * 교재 제3편 종합부동산세 사례3 "공유지분이 있는 경우(≠1세대1주택자)"
 *   - 과세연도 2022
 *   - 1세대1주택자 아님 (일반 1주택자)
 *   - 공시가격 15억, 지분율 70%, 감면 없음
 *   - 직전연도 공시 13억 (자동계산 모드, 지분율 70% 동일)
 *
 * 실측 anchor (comprehensive-case3-anchor.test.ts):
 *   - effectiveIncludedAssessedValue = 1,050,000,000 (15억 × 0.7)
 *   - taxBase = 270,000,000
 *   - determinedHousingTax = 907,200
 *   - comp-b3-③-housing = 1,050,000,000
 *
 * worktree: E2E_PORT=3003 npx playwright test e2e/comprehensive-ownership-ratio.spec.ts
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
 * 사례3 — Step1~Step4 입력 (1세대1주택 OFF, 공시가격 15억, 지분율 70%)
 *
 * Step1: 2022 과세연도 선택, 1세대1주택 스위치 OFF → 다음
 * Step2: 공시가격 15억, 지분율 70% 입력 → 다음
 * Step3: 합산배제 없음 → 다음
 * Step4: 토지 없음 → 다음
 */
async function fillCase3ThroughStep4(page: Page): Promise<void> {
  await page.goto(PAGE);

  // Step1: 2022 과세연도 선택 (1세대1주택 스위치 OFF — 기본값 유지)
  await page.getByRole("radio", { name: "2022" }).check();
  await clickNext(page);

  // Step2: 공시가격 15억 + 지분율 70%
  // CurrencyInput placeholder="금액 입력" — 공시가격 총액
  await page.getByPlaceholder("금액 입력").first().fill("1500000000");
  // DecimalInput: nth(0)=지분율(%), nth(1)=재산세 감면율(기본 미입력)
  await page.getByPlaceholder("숫자 입력").nth(0).fill("70");
  await clickNext(page); // → Step3
  await clickNext(page); // → Step4
  await clickNext(page); // → Step5
}

// ════════════════════════════════════════════════════════════
// 메인 테스트 스위트
// ════════════════════════════════════════════════════════════

test.describe("종합부동산세 공유지분(사례3) — 폼→결과 전수 검증", () => {
  /**
   * C3-E1: 사례3 핵심 anchor — 납부할세액 907,200 + 안분 공시 bullet "10.5억"
   *
   * 검증:
   * - 결과 화면 노출 (907,200 텍스트)
   * - 산출근거 카드 펼침 → Step1 지분율 bullet "10.5억원" 포함
   * - Step6 최종 납부할세액 907,200
   */
  test("C3-E1: 사례3 — 납부할세액 907,200 + 지분율 70% 안분 bullet 검증", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const consoleErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

    await fillCase3ThroughStep4(page);

    // Step5: 자동계산 모드 + 직전 공시가격 13억 (지분 동일)
    await page.getByTestId("cap-mode-auto").click();
    await page.getByPlaceholder("0").first().fill("1300000000");
    // 직전연도 1세대1주택 스위치 OFF (기본값)
    await calcAndWait(page);

    // 결과 화면 노출 확인
    await expect(page.getByText(/907,200/).first()).toBeVisible({
      timeout: 30_000,
    });

    // ── 산출근거 카드(payable-step1~step6) ──
    const card = page.getByTestId("housing-payable-calc");
    await card.scrollIntoViewIfNeeded();

    // 기본 접힘 — Step6 숨김 확인
    await expect(page.getByTestId("payable-step6")).toBeHidden();

    // 펼침
    await card
      .getByRole("button", { name: /종합부동산세 납부할 세액 산출 근거/ })
      .click();

    // Step1: 재산세공제전 종부세액 = 1,620,000
    await expect(page.getByTestId("payable-step1")).toContainText("1,620,000원");

    // Step1 안분 공시가격 bullet — 지분율 70%, 10.5억원
    // Bullet testId="payable-step1-ownership"
    await expect(page.getByTestId("payable-step1-ownership")).toBeVisible();
    await expect(page.getByTestId("payable-step1-ownership")).toContainText("70%");
    await expect(page.getByTestId("payable-step1-ownership")).toContainText("10.5억원");

    // Step6: 납부할세액 = 907,200
    await expect(page.getByTestId("payable-step6")).toContainText("907,200원");

    expect(consoleErrors, `콘솔 에러: ${consoleErrors.join("\n")}`).toEqual([]);
  });

  /**
   * C3-E2: 별지 부표3 ③ 과세 공시가격 = 1,050,000,000 검증
   *
   * 지분율 70% 적용 후 effectiveIncludedAssessedValue = 1,050,000,000.
   * 부표3 ③칸 라벨 "과세 공시가격"(변경된 라벨) + 값 1,050,000,000.
   */
  test("C3-E2: 사례3 — 부표3 ③ 과세 공시가격 1,050,000,000 검증", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const consoleErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

    await fillCase3ThroughStep4(page);

    // Step5: 자동계산 모드 + 직전 공시가격 13억
    await page.getByTestId("cap-mode-auto").click();
    await page.getByPlaceholder("0").first().fill("1300000000");
    await calcAndWait(page);

    await expect(page.getByText(/907,200/).first()).toBeVisible({
      timeout: 30_000,
    });

    // 신고서 서식 펼침
    await page.getByRole("button", { name: /신고서 서식/ }).click();

    // 별지 부표3 ③ 과세 공시가격 = 1,050,000,000
    await expect(
      page.locator('[data-besshi-cell="comp-b3-③-housing"]'),
    ).toContainText("1,050,000,000");

    // 라벨 "과세 공시가격" 확인 (라벨 변경 회귀 방어)
    await expect(page.getByText("과세 공시가격").first()).toBeVisible();

    expect(consoleErrors, `콘솔 에러: ${consoleErrors.join("\n")}`).toEqual([]);
  });

  /**
   * C3-E3: 지분율 미입력(100% 기본) → 사례12 동작 보존
   *
   * 지분율 미입력 시 ownershipRatio=100이 API에 undefined로 전달
   * → effectiveIncludedAssessedValue = 원공시 합산 → 기존 동작과 동일.
   * bullet "70%"가 미노출됨을 확인.
   */
  test("C3-E3: 지분율 기본값(100%) — 안분 bullet 미노출 + 기존 동작 보존", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await page.goto(PAGE);

    // Step1: 2022, 1세대1주택 OFF
    await page.getByRole("radio", { name: "2022" }).check();
    await clickNext(page);

    // Step2: 공시가격 15억, 지분율 미입력 (기본 100% 표시)
    await page.getByPlaceholder("금액 입력").first().fill("1500000000");
    // 지분율 입력란 클리어 후 100을 그대로 유지 (기본값 건드리지 않음)
    await clickNext(page); // → Step3
    await clickNext(page); // → Step4
    await clickNext(page); // → Step5

    // Step5: 직접입력 모드 (기본) — 전년도 세액 미입력
    await calcAndWait(page);

    await expect(page.getByText(/납부할/).first()).toBeVisible({
      timeout: 30_000,
    });

    // 산출근거 카드 펼침
    const card = page.getByTestId("housing-payable-calc");
    await card.scrollIntoViewIfNeeded();
    await card
      .getByRole("button", { name: /종합부동산세 납부할 세액 산출 근거/ })
      .click();

    // 지분율 안분 bullet 미노출 (100% = 단독 소유)
    await expect(page.getByTestId("payable-step1-ownership")).not.toBeVisible();
  });
});

/**
 * 사례2 감면율 회귀 — 지분율 위젯 추가 후에도 감면율 동작 보존 확인.
 * comprehensive-reduction-rate.spec.ts의 R-1 최소 재검증.
 */
test.describe("사례2 감면율 회귀 (지분율 위젯 추가 후)", () => {
  test("REGR-2: 사례2 감면율 25% — 납부할세액 294,923 + bullet 존재 (지분율 위젯 추가 후 회귀)", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const consoleErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

    await page.goto(PAGE);

    // Step1: 2022, 1세대1주택 OFF
    await page.getByRole("radio", { name: "2022" }).check();
    await clickNext(page);

    // Step2: 공시가격 10억 + 감면율 25% (지분율은 기본 100% 유지)
    await page.getByPlaceholder("금액 입력").first().fill("1000000000");
    // DecimalInput: nth(0)=지분율(기본 100유지), nth(1)=감면율 25%
    await page.getByPlaceholder("숫자 입력").nth(1).fill("25");
    await clickNext(page); // → Step3
    await clickNext(page); // → Step4
    await clickNext(page); // → Step5

    // Step5: 자동계산 모드 + 직전 공시가격 9억
    await page.getByTestId("cap-mode-auto").click();
    await page.getByPlaceholder("0").first().fill("900000000");
    await calcAndWait(page);

    await expect(page.getByText(/294,923/).first()).toBeVisible({
      timeout: 30_000,
    });

    // 산출근거 카드 펼침
    const card = page.getByTestId("housing-payable-calc");
    await card.scrollIntoViewIfNeeded();
    await card
      .getByRole("button", { name: /종합부동산세 납부할 세액 산출 근거/ })
      .click();

    // Step1: 감면후 공시가격 bullet 표시 (7.5억원)
    await expect(card).toContainText("과세 공시가격");
    await expect(card).toContainText("7.5억원");

    // Step6: 납부할세액 294,923
    await expect(page.getByTestId("payable-step6")).toContainText("294,923원");

    // 지분율 bullet 미노출 (지분율 100% = 단독)
    await expect(page.getByTestId("payable-step1-ownership")).not.toBeVisible();

    expect(consoleErrors, `콘솔 에러: ${consoleErrors.join("\n")}`).toEqual([]);
  });
});
