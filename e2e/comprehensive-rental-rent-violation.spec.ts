import { test, expect, type Page } from "@playwright/test";
import { openHouseModal, closeHouseModal, expandHouseAdvanced } from "./_helpers/tax-flow";

/**
 * 종부세 합산배제 §3⑧ 5% 위반 뒤 2개 과세연도(T-07b) — 화면 경로 끝까지(⑤ 토글 → 계약일 → ⑧ → ④ → 엔진 → ⑦ 사유).
 * 세액은 route anchor가 고정. 계획서: docs/01-plan/features/comprehensive-rental-excl-input-gaps-4.plan.md §3.3
 *
 * worktree 실행: E2E_PORT=3108 npx playwright test e2e/comprehensive-rental-rent-violation.spec.ts
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

/** 2024 과세연도 · 장기일반 매입(8호) · 2017 등록·임대개시 — Step3까지 */
async function toStep3(page: Page): Promise<void> {
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

  await page.getByLabel("연도").first().fill("2017");
  await page.getByLabel("월").first().fill("1");
  await page.getByLabel("일").first().fill("10");
  // 세무서 사업자등록일 — §3① 각 호 외의 부분(T-13)
  await fillDateIn(page, "comprehensive-business-registration-date", "2017", "1", "10");
  await fillDateIn(page, "comprehensive-8na-acquisition-date", "2017", "1", "2");
  await page.getByTestId("comprehensive-8na-converted-no").check();
  const startBox = page.locator('div.space-y-1\\.5:has(> label:has-text("임대개시일"))');
  await startBox.getByLabel("연도").fill("2017");
  await startBox.getByLabel("월").fill("2");
  await startBox.getByLabel("일").fill("1");
}

async function calc(page: Page) {
  await clickNext(page);
  const calcResponse = page.waitForResponse(
    (r) => r.url().includes("/api/calc/comprehensive") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /계산하기/ }).click();
  const resp = await calcResponse;
  expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);
  return resp.request().postDataJSON() as { properties: { rentalInfo?: Record<string, unknown> }[] };
}

const VIOLATION = "임대료를 5% 넘게 올린 적이 있음";

test("RV-E2E-1: 2024 과세연도 · 5% 위반 2023.5.1. → 계약일 전송 · 불성립 사유", async ({ page }) => {
  test.setTimeout(90_000);
  await toStep3(page);
  await page.getByRole("switch", { name: VIOLATION }).click();
  const box = page.getByTestId("comprehensive-rent-violation-date");
  await box.getByLabel("연도").fill("2023");
  await box.getByLabel("월").fill("5");
  await box.getByLabel("일").fill("1");
  const body = await calc(page);
  expect(body.properties[0].rentalInfo).toMatchObject({ rentViolationDate: "2023-05-01" });
  await expect(page.getByTestId("comprehensive-exclusion-fail-reasons")).toContainText("그다음 과세연도는 합산배제 제외", {
    timeout: 30_000,
  });
});

test("RV-E2E-2: 토글 ON · 계약일 빈칸 → ⑧ 차단(요청 없음)", async ({ page }) => {
  test.setTimeout(90_000);
  await toStep3(page);
  await page.getByRole("switch", { name: VIOLATION }).click();
  await clickNext(page);
  let posted = false;
  page.on("request", (r) => {
    if (r.url().includes("/api/calc/comprehensive") && r.method() === "POST") posted = true;
  });
  await page.getByRole("button", { name: /계산하기/ }).click();
  await expect(page.getByText(/5% 넘게 올린 계약일을 입력하세요/)).toBeVisible();
  expect(posted).toBe(false);
});
