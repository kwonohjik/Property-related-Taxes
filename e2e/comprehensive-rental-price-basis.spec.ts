import { test, expect, type Page } from "@playwright/test";
import { openHouseModal, closeHouseModal, expandHouseAdvanced } from "./_helpers/tax-flow";

/**
 * 종부세 합산배제 가격 요건 — 판정 기준 공시가격(T-03).
 * 종부령 §3①2호 가목1) 「해당 주택의 임대를 개시한 날 또는 최초로 제9항에 따른 합산배제신고를 한 연도의 과세기준일을 기준으로 하여」.
 * 화면 경로 끝까지(⑤ 칸 표시 조건 → ④ → ⑫⑭ → 엔진 → ⑦ 사유). 세액은 route anchor가 고정.
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-tax-defects-3.plan.md §2.3
 *
 * worktree 실행: E2E_PORT=3105 npx playwright test e2e/comprehensive-rental-price-basis.spec.ts
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

/** 2025 과세연도 · 2호 민간매입(단기) 수도권 · 2017 등록·사업자등록·임대개시 — Step3까지 */
async function toStep3(page: Page, assessed: string): Promise<void> {
  await page.goto(PAGE);
  await page.getByRole("radio", { name: "2025" }).check();
  await clickNext(page);

  await openHouseModal(page, 0);
  await page.getByPlaceholder("금액 입력").first().fill(assessed);
  await page.getByPlaceholder("0.00").first().fill("84");
  await page.getByRole("dialog").locator('select:has(option[value="metro"])').selectOption("metro");
  await expandHouseAdvanced(page);
  await page
    .getByRole("dialog")
    .locator('select:has(option[value="private_purchase_rental_short"])')
    .selectOption("private_purchase_rental_short");
  await closeHouseModal(page);
  await clickNext(page);

  await page.getByLabel("연도").first().fill("2017");
  await page.getByLabel("월").first().fill("3");
  await page.getByLabel("일").first().fill("1");
  await fillDateIn(page, "comprehensive-business-registration-date", "2017", "3", "1");
  const startBox = page.locator('div.space-y-1\\.5:has(> label:has-text("임대개시일"))');
  await startBox.getByLabel("연도").fill("2017");
  await startBox.getByLabel("월").fill("4");
  await startBox.getByLabel("일").fill("1");
}

async function calc(page: Page): Promise<{ properties: { rentalInfo?: Record<string, unknown> }[] }> {
  await clickNext(page);
  const calcResponse = page.waitForResponse(
    (r) => r.url().includes("/api/calc/comprehensive") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /계산하기/ }).click();
  const resp = await calcResponse;
  expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);
  return resp.request().postDataJSON();
}

test("PB-E2E-1: 그해 7억(상한 6억 초과) → 기준 공시가격 칸 · 5억 입력 → 전송 · 합산배제 성립", async ({ page }) => {
  test.setTimeout(90_000);
  await toStep3(page, "700000000");
  const field = page.getByTestId("comprehensive-price-basis");
  await expect(field).toBeVisible();
  await expect(field.getByText("기준 공시가격 (선택)")).toBeVisible();
  await expect(field.getByText("임대개시일 또는 처음 합산배제 신고한 해 6.1. 공시가격. 상한 이하인 쪽을 넣으세요")).toBeVisible();
  await field.getByTestId("comprehensive-price-basis-value").fill("500000000");

  const body = await calc(page);
  expect(body.properties[0].rentalInfo).toMatchObject({ priceBasisValue: 500_000_000, assessedValue: 700_000_000 });
  await expect(page.getByTestId("comprehensive-exclusion-fail-reasons")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "합산배제 적용 내역" })).toBeVisible();
});

test("PB-E2E-2: 칸을 비우면 그해 7억으로 판정 · 불성립 사유에 안내", async ({ page }) => {
  test.setTimeout(90_000);
  await toStep3(page, "700000000");
  const body = await calc(page);
  expect(body.properties[0].rentalInfo?.priceBasisValue).toBeUndefined();
  await expect(page.getByTestId("comprehensive-exclusion-fail-reasons")).toContainText(
    "가격 판정: 700,000,000원(그해 공시가격)",
    { timeout: 30_000 },
  );
});

test("PB-E2E-3: 그해 5억(상한 이하) → 칸 없음", async ({ page }) => {
  test.setTimeout(90_000);
  await toStep3(page, "500000000");
  await expect(page.getByText("임대개시일", { exact: false }).first()).toBeVisible();
  await expect(page.getByTestId("comprehensive-price-basis")).toHaveCount(0);
});
