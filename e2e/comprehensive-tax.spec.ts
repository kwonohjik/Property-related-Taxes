import { test, expect, type Page } from "@playwright/test";

/**
 * 종합부동산세 마법사 E2E (GAP-4)
 *
 * 폼 → 계산 → 결과 전체 경로 런타임 검증.
 * - CPT-E2E-1: 주택분 단독 (1세대1주택 아님)
 * - CPT-E2E-2: 1세대1주택 + 고령자·장기보유 세액공제 (ToggleCard switch)
 * - CPT-E2E-3: 종합합산 토지 포함 (Step4 ToggleCard)
 *
 * worktree 실행: E2E_PORT=3100 npx playwright test e2e/comprehensive-tax.spec.ts
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
  expect(
    resp.ok(),
    `계산 API 비정상 응답 ${resp.status()} — 폼 입력 누락/검증 실패 의심`,
  ).toBe(true);
}

test.describe("종합부동산세 마법사", () => {
  test("CPT-E2E-1: 주택분 단독 (공시 9.5억, 1주택 아님) → 과세표준 표시", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto(PAGE);

    // Step1: 과세연도
    await page.getByRole("radio", { name: "2024" }).check();
    await clickNext(page);

    // Step2: 공시가격 + 면적
    await page.getByPlaceholder("금액 입력").first().fill("950000000");
    await page.getByPlaceholder("0.00").first().fill("84");
    await clickNext(page);

    // Step3: 합산배제 없음 (스킵)
    await clickNext(page);
    // Step4: 토지 없음 (스킵)
    await clickNext(page);
    // Step5: 계산
    await calcAndWait(page);

    await expect(page.getByText(/과세표준/).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test("CPT-E2E-2: 1세대1주택 + 고령자·장기보유 세액공제 → 공제 표시", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto(PAGE);

    // Step1: 과세연도 + 1세대1주택 ToggleCard ON
    await page.getByRole("radio", { name: "2024" }).check();
    await page.getByRole("switch").first().click(); // 1세대1주택자
    // 펼쳐진 생년월일·취득일 (DateInput: 연/월/일 라벨)
    await page.getByLabel("연도").first().fill("1955");
    await page.getByLabel("월").first().fill("1");
    await page.getByLabel("일").first().fill("1");
    await page.getByLabel("연도").nth(1).fill("2010");
    await page.getByLabel("월").nth(1).fill("1");
    await page.getByLabel("일").nth(1).fill("1");
    await clickNext(page);

    // Step2: 공시 13억
    await page.getByPlaceholder("금액 입력").first().fill("1300000000");
    await page.getByPlaceholder("0.00").first().fill("84");
    await clickNext(page);
    await clickNext(page); // Step3 스킵
    await clickNext(page); // Step4 스킵
    await calcAndWait(page);

    await expect(
      page.getByText(/고령자 세액공제|장기보유 세액공제|세액공제/).first(),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("CPT-E2E-3: 종합합산 토지 포함 → 종합합산 토지 섹션 표시", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto(PAGE);

    // Step1
    await page.getByRole("radio", { name: "2024" }).check();
    await clickNext(page);

    // Step2: 주택 공시 5억 (기본공제 이하)
    await page.getByPlaceholder("금액 입력").first().fill("500000000");
    await page.getByPlaceholder("0.00").first().fill("60");
    await clickNext(page);
    await clickNext(page); // Step3 스킵

    // Step4: 종합합산 토지 ToggleCard ON (첫 switch)
    await page.getByRole("switch").first().click();
    // 펼쳐진 CurrencyInput 4개 (placeholder="0"): 공시지가 합산 / 재산세 과표 / 재산세 부과세액 / 전년도(선택)
    const landAmounts = page.getByPlaceholder("0");
    await landAmounts.nth(0).fill("800000000"); // 공시지가 합산 8억
    await landAmounts.nth(1).fill("800000000"); // 재산세 과세표준 8억
    await landAmounts.nth(2).fill("3000000");   // 재산세 부과세액 300만
    await clickNext(page); // Step5
    await calcAndWait(page);

    await expect(page.getByText(/종합합산 토지/).first()).toBeVisible({
      timeout: 30_000,
    });
  });
});
