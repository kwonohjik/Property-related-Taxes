import { test, expect, type Page } from "@playwright/test";
import { openHouseModal, closeHouseModal, expandHouseAdvanced } from "./_helpers/tax-flow";

/**
 * 종부세 합산배제 §3①8호 나목4) — 2020.7.11. 이후 단기 → 장기일반 변경신고 주택은 제외.
 * 화면 경로 끝까지(⑤ 칸 → ⑧ → ④ → ⑫⑭ → 엔진 → ⑦ 불성립 사유).
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-8ho-na.plan.md
 *
 * worktree 실행: E2E_PORT=3103 npx playwright test e2e/comprehensive-rental-8na.spec.ts
 */

const PAGE = "/calc/comprehensive-tax";

async function clickNext(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^다음/ }).click();
}

async function fillDateIn(page: Page, testId: string, y: string, m: string, d: string): Promise<void> {
  const box = page.getByTestId(testId);
  await box.getByLabel("연도").fill(y);
  await box.getByLabel("월").fill(m);
  await box.getByLabel("일").fill(d);
}

test("8NA-E2E-1: 장기일반 매입 · 2020-07-20 단기→장기 변경신고 → 합산배제 불성립 + 사유", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(PAGE);

  await page.getByRole("radio", { name: "2024" }).check();
  await clickNext(page);

  await openHouseModal(page, 0);
  await page.getByPlaceholder("금액 입력").first().fill("300000000");
  await page.getByPlaceholder("0.00").first().fill("59");
  await expandHouseAdvanced(page);
  await page
    .getByRole("dialog")
    .locator('select:has(option[value="private_purchase_rental_long"])')
    .selectOption("private_purchase_rental_long");
  await closeHouseModal(page);
  await clickNext(page);

  // Step3: 등록일(첫 DateInput) → 8호 나목 칸 → 임대개시일(마지막 DateInput)
  await page.getByLabel("연도").first().fill("2017");
  await page.getByLabel("월").first().fill("1");
  await page.getByLabel("일").first().fill("10");
  await fillDateIn(page, "comprehensive-8na-acquisition-date", "2017", "1", "2");
  await page.getByTestId("comprehensive-8na-converted-yes").check();
  await fillDateIn(page, "comprehensive-8na-conversion-date", "2020", "7", "20");
  const startBox = page.locator('div.space-y-1\\.5:has(> label:has-text("임대개시일"))');
  await startBox.getByLabel("연도").fill("2017");
  await startBox.getByLabel("월").fill("2");
  await startBox.getByLabel("일").fill("1");
  await clickNext(page);

  const calcResponse = page.waitForResponse(
    (r) => r.url().includes("/api/calc/comprehensive") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /계산하기/ }).click();
  const resp = await calcResponse;
  expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);
  const body = resp.request().postDataJSON() as { properties: { rentalInfo?: Record<string, unknown> }[] };
  expect(body.properties[0].rentalInfo).toMatchObject({
    convertedFromShortTerm: true,
    shortTermConversionDate: "2020-07-20",
  });

  await expect(page.getByTestId("comprehensive-exclusion-fail-reasons")).toContainText("변경신고", { timeout: 30_000 });
});
