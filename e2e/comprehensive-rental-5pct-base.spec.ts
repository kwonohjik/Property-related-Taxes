import { test, expect, type Page } from "@playwright/test";
import { openHouseModal, closeHouseModal, expandHouseAdvanced } from "./_helpers/tax-flow";

/**
 * 종부세 합산배제 임대료 증가율 5% — 비교 기준 계약 문구(T-07a) · 직전 임대료 빈칸 차단(Q-11).
 * 기준: 2019.2.12. 이후 처음 쓴 표준임대차계약(종부령 부칙<제29524호> §3 · 서면-2020-부동산-2435),
 * 8호는 등록·재등록 뒤 처음 쓴 계약(서면-2021-부동산-5682·2749).
 * 화면 경로 끝까지(⑤ 토글·안내 → ⑧ → ④ → ⑫⑭ → 엔진 → ⑦ 불성립 사유). 세액은 route anchor가 고정.
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-tax-defects-3.plan.md §2.2
 *
 * worktree 실행: E2E_PORT=3104 npx playwright test e2e/comprehensive-rental-5pct-base.spec.ts
 */

const PAGE = "/calc/comprehensive-tax";
const TOGGLE = "처음 쓴 표준임대차계약 (5% 비교 제외)";

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

test("5PCT-E2E-1: 처음 쓴 표준임대차계약 아님 · 10% 인상 → 문구·경고 · 불성립 사유", async ({ page }) => {
  test.setTimeout(90_000);
  await toStep3(page);

  const toggle = page.getByRole("switch", { name: TOGGLE });
  await expect(toggle).toBeChecked();
  await expect(page.getByText("2019.2.12. 이후 처음 쓴 표준임대차계약이면 켜세요")).toBeVisible();
  await expect(page.getByText("장기일반 매입(8호)은 등록·재등록 뒤 처음 쓴 계약이 기준입니다. 다른 호는 확인 필요.")).toBeVisible();
  await expect(page.getByText("직전 임대료 (월)")).toHaveCount(0);

  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect(page.getByText("바로 앞 계약의 월 임대료(보증금은 월세로 환산)")).toBeVisible();

  const rent = (label: string) => page.locator(`div:has(> label:has-text("${label}"))`).getByPlaceholder("0");
  await rent("현재 임대료 (월)").fill("1100000");
  await rent("직전 임대료 (월)").fill("1000000");
  await expect(page.getByText("바로 앞 계약보다 5% 넘게 올랐습니다.", { exact: false })).toBeVisible();
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
    isInitialContract: false,
    previousRent: 1_000_000,
    currentRent: 1_100_000,
  });

  await expect(page.getByTestId("comprehensive-exclusion-fail-reasons")).toContainText("임대료 증가율 5% 초과", {
    timeout: 30_000,
  });
});

test("5PCT-E2E-2: 토글 OFF · 직전 임대료 빈칸 → ⑧ 차단(요청 없음)", async ({ page }) => {
  test.setTimeout(90_000);
  await toStep3(page);
  await page.getByRole("switch", { name: TOGGLE }).click();
  await clickNext(page);

  let posted = false;
  page.on("request", (r) => {
    if (r.url().includes("/api/calc/comprehensive") && r.method() === "POST") posted = true;
  });
  await page.getByRole("button", { name: /계산하기/ }).click();
  await expect(page.getByText(/처음 쓴 표준임대차계약이 아니면 직전 임대료\(월\)를 입력하세요/)).toBeVisible();
  expect(posted).toBe(false);
});
