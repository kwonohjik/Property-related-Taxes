import { test, expect, type Page } from "@playwright/test";
import { openHouseModal, addHouse, closeHouseModal } from "./_helpers/tax-flow";

/**
 * 종합부동산세 사례8 — 주택 세부담상한 재산세 ⓐ 자동화 (트랙 B · priorAssessedValue) E2E
 *
 * 교재 사례8(조정대상지역 2주택, 2022 귀속). 수동입력(propertyTaxAmount) 없이
 * 직전연도 공시가격만 입력 → 엔진이 §122 단서 세부담상한(105/110/130%)을 적용해 ⓐ 자동 산정.
 *   서초 공시 20억·감면30%·직전 15억 → ⓐ 2,702,700 (당해 4,170,000 → min(·, 2,970,000×130%=3,861,000) ×0.7)
 *   강남 공시 10억·직전 8억 → ⓐ 1,677,000 / ⑤ = 16,747,099
 *
 * 검증 경로: UI(2단계 cap-mode-auto + 각 주택 직전공시 getByLabel) → API body priorAssessedValue
 *   → 엔진 buildHousingPropertyTaxWithCap → 결과 ⓐ·⑤ + 세부담상한 산식 echo
 *
 * worktree: E2E_PORT=3102 npx playwright test e2e/comprehensive-case89-taxcap.spec.ts
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

test.describe("종합부동산세 사례8 — 주택 세부담상한 자동(priorAssessedValue) 폼→결과", () => {
  test("서초(20억·감면30%·직전15억) + 강남(10억·직전8억) → ⑤ 16,747,099 (수동입력 없이)", async ({
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

    // ★ Step2: 공시·감면율은 각 주택 편집 모달 안에서 입력 (모달엔 한 주택만 보이므로 .first()).
    //   서초 공시 20억(금액 first), 감면율 30%(숫자 nth1)
    await openHouseModal(page, 0);
    await page.getByPlaceholder("금액 입력").first().fill("2000000000");
    await page.getByPlaceholder("숫자 입력").nth(1).fill("30");
    await closeHouseModal(page);
    // 주택2(강남) 추가 후 공시 10억 (모달 안 금액 first)
    await addHouse(page);
    await page.getByPlaceholder("금액 입력").first().fill("1000000000");
    await closeHouseModal(page);
    // 세부담상한 모드 ② auto (공통설정·모달 밖, 직전 공시 입력란 노출)
    await page.getByTestId("cap-mode-auto").click();
    // 당해 조정대상지역 2주택 토글 ON (중과 2.2%) — 공통설정(모달 밖) 첫 switch (2022<2023)
    await page.getByRole("switch").first().click();
    // 직전 공시 입력 — 각 주택 모달을 따로 열어서 (모달엔 한 주택만 → .first())
    await openHouseModal(page, 0);
    await page.getByLabel("직전연도 공시가격").first().fill("1500000000"); // 서초
    await closeHouseModal(page);
    await openHouseModal(page, 1);
    await page.getByLabel("직전연도 공시가격").first().fill("800000000"); // 강남
    await closeHouseModal(page);

    await clickNext(page); // → Step3
    await clickNext(page); // → Step4
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
    // ⑤ 납부할세액 16,747,099
    await expect(page.getByTestId("payable-step6")).toContainText("16,747,099원");

    // 트랙 B 세부담상한 산식 echo (priorAssessedValue 자동 시만, 조건 블록 밖 렌더)
    await expect(card.getByText(/주택 세부담상한 산식/).first()).toBeVisible();
    await card.getByText(/주택 세부담상한 산식/).first().click();
    await expect(card.getByText(/세부담상한 130%/).first()).toBeVisible();

    expect(consoleErrors, `콘솔 에러: ${consoleErrors.join("\n")}`).toEqual([]);
  });
});
