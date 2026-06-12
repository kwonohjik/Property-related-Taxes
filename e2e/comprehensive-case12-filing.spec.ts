import { test, expect, type Page } from "@playwright/test";

/**
 * 종합부동산세 사례12 — 신고서 서식 4종 재현 E2E
 *
 * 국세청 2022 사례집 사례12 (1세대1주택, 공시 15억/14억, 67세, '12.1.1 취득)
 * 마법사 5단계 → 직전연도 자동계산 모드 → 결과 서식 펼침 → 셀 값 검증.
 *
 * - F-1: 사례12 전체 → 신고서 ⑩ 302,400 · 농특세 ㉓ 60,480 · b3 ⑦ 240,000,000 · b5sub ⑫ 513,000
 * - F-2: 인적사항 미입력 → 서식 렌더 오류 0
 * - F-3: 직접입력 모드 → b5sub 미가용
 *
 * worktree: E2E_PORT=3100 npx playwright test e2e/comprehensive-case12-filing.spec.ts
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

/** Step1~Step4 공통 입력 (1세대1주택 + 공시 15억) */
async function fillCase12ThroughStep4(page: Page): Promise<void> {
  await page.goto(PAGE);
  // Step1: 2022 + 1세대1주택 + 생년월일·취득일
  await page.getByRole("radio", { name: "2022" }).check();
  await page.getByRole("switch").first().click();
  await page.getByLabel("연도").first().fill("1955");
  await page.getByLabel("월").first().fill("3");
  await page.getByLabel("일").first().fill("1");
  await page.getByLabel("연도").nth(1).fill("2012");
  await page.getByLabel("월").nth(1).fill("1");
  await page.getByLabel("일").nth(1).fill("1");
  await clickNext(page);
  // Step2: 공시 15억
  await page.getByPlaceholder("금액 입력").first().fill("1500000000");
  await page.getByPlaceholder("0.00").first().fill("168");
  await clickNext(page); // → Step3
  await clickNext(page); // → Step4
  await clickNext(page); // → Step5
}

test.describe("종합부동산세 사례12 신고서 서식 재현", () => {
  test("F-1: 사례12 전체 (직전연도 자동) → 서식 셀 값 검증", async ({ page }) => {
    test.setTimeout(120_000);
    await fillCase12ThroughStep4(page);

    // Step5: 직전연도 자동계산 모드 + 공시 14억 + 직전 1주택
    await page.getByTestId("cap-mode-auto").click();
    await page.getByPlaceholder("0").first().fill("1400000000");
    // 직전연도 1세대1주택 ToggleCard ON
    await page.getByRole("switch").last().click();
    await calcAndWait(page);

    // 결과 도착 — 결정세액 표시
    await expect(page.getByText(/302,400/).first()).toBeVisible({ timeout: 30_000 });

    // 서식 펼침
    await page.getByRole("button", { name: /신고서 서식/ }).click();

    // 신고서 ⑩ 결정세액(주택)
    await expect(
      page.locator('[data-besshi-cell="comp-main-⑩-housing"]'),
    ).toContainText("302,400");
    // 농특세 ㉓ 산출세액
    await expect(
      page.locator('[data-besshi-cell="comp-main-㉓"]'),
    ).toContainText("60,480");
    // 별지 3호부표 ⑦ 과세표준(주택)
    await expect(
      page.locator('[data-besshi-cell="comp-b3-⑦-housing"]'),
    ).toContainText("240,000,000");
    // 별지 5호 ㉑ 세부담상한초과세액 = 0
    await expect(
      page.locator('[data-besshi-cell="comp-b5-㉑-housing"]'),
    ).toContainText("0");
    // 별지 5호부표 ⑫ 직전연도 종부세상당액
    await expect(
      page.locator('[data-besshi-cell="comp-b5sub-⑫-housing"]'),
    ).toContainText("513,000");
  });

  test("F-3: 직접입력 모드 → 별지 5호부표 미가용", async ({ page }) => {
    test.setTimeout(120_000);
    await fillCase12ThroughStep4(page);

    // Step5: 직접입력 모드(기본) 유지 + 전년도 총세액
    await page.getByPlaceholder("0").first().fill("3243000");
    await calcAndWait(page);
    await expect(page.getByText(/302,400/).first()).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: /신고서 서식/ }).click();
    // 직접입력 모드: 별지 5호부표(직전연도 자동계산서) 미렌더
    await expect(
      page.locator('[data-besshi-cell="comp-b5sub-⑫-housing"]'),
    ).toHaveCount(0);
  });
});
