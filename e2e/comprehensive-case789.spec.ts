import { test, expect, type Page } from "@playwright/test";

/**
 * 종합부동산세 사례 7·8·9 — 주택분 재산세 부과세액 직접입력 (propertyTaxAmount) E2E
 *
 * 교재 사례7(다가구 ≠1세대1주택)·사례8(조정대상지역 2주택) (2022 귀속)
 * 신규 필드: PropertyEntry.propertyTaxAmount → 비율 안분 공제 ⓐ를 고지서 실부과액으로 직접 주입.
 *
 * 검증 경로: UI 입력(부과재산세 CurrencyInput) → API body → 엔진 override → 결과 ⓐ·⑤
 *   사례7 ⑤ = 560,595 (① 720,000, ⓓ 159,405)
 *   사례8 ⑤ = 16,747,099 (① 18,960,000, ⓓ 2,212,901, 조정2주택 중과 2.2%)
 *
 * worktree: E2E_PORT=3105 npx playwright test e2e/comprehensive-case789.spec.ts
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

test.describe("종합부동산세 사례7·8 — 재산세 부과세액 직접입력 폼→결과 검증", () => {
  test("사례7: 다가구 단일주택, 부과재산세 직접입력 714,000 → ⑤ 560,595", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const consoleErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

    await page.goto(PAGE);

    // Step1: 2022 과세연도, 1세대1주택 OFF (다가구 ≠ 1세대1주택)
    await page.getByRole("radio", { name: "2022" }).check();
    await clickNext(page);

    // Step2: 공시가격 8억(통합공시) + 부과재산세 714,000 (구별 면적안분 합산)
    //   "금액 입력" nth0 = 공시가격, nth1 = 부과재산세 (사례6 분리 토글 OFF → 토지/건물 숨김)
    await page.getByPlaceholder("금액 입력").nth(0).fill("800000000");
    await page.getByPlaceholder("금액 입력").nth(1).fill("714000");
    await clickNext(page); // → Step3
    await clickNext(page); // → Step4(토지·계산)

    // 직접입력 모드(기본) + 세부담상한 모드 미사용 → ⑤=taxBeforeCap
    await calcAndWait(page);

    // 결과: 납부할세액 560,595
    await expect(page.getByText(/560,595/).first()).toBeVisible({
      timeout: 30_000,
    });

    const card = page.getByTestId("housing-payable-calc");
    await card.scrollIntoViewIfNeeded();
    await card
      .getByRole("button", { name: /종합부동산세 납부할 세액 산출 근거/ })
      .click();

    // ① 산출세액 720,000
    await expect(page.getByTestId("payable-step1")).toContainText("720,000원");
    // ⓓ 공제할 재산세 159,405 (round 안분)
    await expect(page.getByTestId("payable-step2")).toContainText("159,405원");
    // ⓐ 부과세액 직접입력 bullet (자동계산 산식 대신)
    await expect(card).toContainText("재산세 부과세액(고지서 기재) 직접입력 합계");
    // ⑤ 납부할세액 560,595
    await expect(page.getByTestId("payable-step6")).toContainText("560,595원");

    expect(consoleErrors, `콘솔 에러: ${consoleErrors.join("\n")}`).toEqual([]);
  });

  test("사례8: 조정2주택 감면30%+부과재산세 직접입력 → ⑤ 16,747,099", async ({
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

    // Step2 주택1(서초): 공시 20억, 감면율 30%, 부과재산세 2,702,700
    //   "금액 입력" nth0=공시·nth1=부과재산세 / "숫자 입력" nth0=지분율·nth1=감면율
    await page.getByPlaceholder("금액 입력").nth(0).fill("2000000000");
    await page.getByPlaceholder("숫자 입력").nth(1).fill("30");
    await page.getByPlaceholder("금액 입력").nth(1).fill("2702700");

    // 주택2(강남) 추가: 공시 10억, 부과재산세 1,677,000 ("금액 입력" nth2=공시·nth3=부과재산세)
    await page.getByRole("button", { name: /주택 추가/ }).click();
    await page.getByPlaceholder("금액 입력").nth(2).fill("1000000000");
    await page.getByPlaceholder("금액 입력").nth(3).fill("1677000");

    // 당해 조정대상지역 2주택 토글 ON (중과 2.2%) — 2단계 주택 목록 상단(cap-mode 위) 첫 switch
    //   (세부담상한 5단계 제거 후 당해 조정대상지역 토글이 2단계로 이동)
    await page.getByRole("switch").first().click();

    await clickNext(page); // → Step3
    await clickNext(page); // → Step4(토지·계산)

    // 세부담상한 모드 미사용 → ⑤=taxBeforeCap
    await calcAndWait(page);

    // 결과: 납부할세액 16,747,099
    await expect(page.getByText(/16,747,099/).first()).toBeVisible({
      timeout: 30_000,
    });

    const card = page.getByTestId("housing-payable-calc");
    await card.scrollIntoViewIfNeeded();
    await card
      .getByRole("button", { name: /종합부동산세 납부할 세액 산출 근거/ })
      .click();

    // ① 산출세액 18,960,000 (중과세율 2.2%)
    await expect(page.getByTestId("payable-step1")).toContainText("18,960,000원");
    // ⓓ 공제할 재산세 2,212,901
    await expect(page.getByTestId("payable-step2")).toContainText("2,212,901원");
    // ⓐ 부과세액 직접입력 bullet
    await expect(card).toContainText("재산세 부과세액(고지서 기재) 직접입력 합계");
    // ⑤ 납부할세액 16,747,099
    await expect(page.getByTestId("payable-step6")).toContainText("16,747,099원");

    expect(consoleErrors, `콘솔 에러: ${consoleErrors.join("\n")}`).toEqual([]);
  });
});
