import { test, expect, type Page } from "@playwright/test";
import { openHouseModal, closeHouseModal, expandHouseAdvanced } from "./_helpers/tax-flow";

/**
 * 종부세 합산배제 공실 2년(T-12 · 종부령 §3⑦4호) — 화면 경로 끝까지(⑤ 토글 → 임대료 칸 숨김 → ⑧ → ④ → 엔진 → ⑦).
 * 세액은 route anchor가 고정. 계획서: docs/01-plan/features/comprehensive-rental-excl-input-gaps-4.plan.md §3.2
 *
 * worktree 실행: E2E_PORT=3107 npx playwright test e2e/comprehensive-rental-vacancy.spec.ts
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

const VACANCY = "과세기준일(6월 1일) 현재 임차인이 없음(공실)";

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

async function fillEviction(page: Page, y: string, m: string, d: string) {
  const box = page.getByTestId("comprehensive-vacancy-eviction-date");
  await box.getByLabel("연도").fill(y);
  await box.getByLabel("월").fill(m);
  await box.getByLabel("일").fill(d);
}

test("VAC-E2E-1: 공실 ON → 임대료 칸 숨김 · 퇴거 2023.1.10.(2년 이내) → 성립 + 경고", async ({ page }) => {
  test.setTimeout(90_000);
  await toStep3(page);
  await expect(page.getByText("현재 임대료 (월)")).toBeVisible();
  await page.getByRole("switch", { name: VACANCY }).click();
  await expect(page.getByText("현재 임대료 (월)")).toHaveCount(0);
  await expect(page.getByRole("switch", { name: "처음 쓴 표준임대차계약 (5% 비교 제외)" })).toHaveCount(0);
  await fillEviction(page, "2023", "1", "10");
  const body = await calc(page);
  expect(body.properties[0].rentalInfo).toMatchObject({ rentalVacantAtAssessment: true, vacancyEvictionDate: "2023-01-10", currentRent: 0 });
  // 경고는 결과 경고 목록과 합산배제 「확인 필요」 상자 두 곳에 뜬다
  await expect(page.getByText("퇴거일부터 2년 이내라 계속 임대로 봅니다", { exact: false }).first()).toBeVisible({ timeout: 30_000 });
});

test("VAC-E2E-2: 퇴거 2022.5.30.(2년 넘음) → 불성립 사유", async ({ page }) => {
  test.setTimeout(90_000);
  await toStep3(page);
  await page.getByRole("switch", { name: VACANCY }).click();
  await fillEviction(page, "2022", "5", "30");
  await calc(page);
  await expect(page.getByTestId("comprehensive-exclusion-fail-reasons")).toContainText("2년을 넘어 계속 임대로 볼 수 없음", {
    timeout: 30_000,
  });
});
