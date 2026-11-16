import { test, expect, type Page } from "@playwright/test";
import { openHouseModal, closeHouseModal, expandHouseAdvanced } from "./_helpers/tax-flow";

/**
 * 종부세 합산배제 문구 3건(T-05 · T-17a · T-17b) — 화면 경로 끝까지(⑤ 안내·토글 → ④ → 엔진 → ⑦ 결과 문구).
 * 판정·세액은 바뀌지 않는다(엔진 anchor `comprehensive-exclusion-wording.anchor.test.ts`).
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-wording-3.plan.md
 *
 * worktree 실행: E2E_PORT=3107 npx playwright test e2e/comprehensive-rental-wording.spec.ts
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

async function fillLabeledDate(page: Page, label: string, y: string, m: string, d: string): Promise<void> {
  const box = page.locator(`div.space-y-1\\.5:has(> label:has-text("${label}"))`);
  await box.getByLabel("연도").fill(y);
  await box.getByLabel("월").fill(m);
  await box.getByLabel("일").fill(d);
}

/** 2024 과세연도 · 장기일반 매입(8호) · 2017 등록·임대개시 · 처음 쓴 계약(기본 ON) — Step3까지 */
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
  await fillDateIn(page, "comprehensive-business-registration-date", "2017", "1", "10");
  await fillDateIn(page, "comprehensive-8na-acquisition-date", "2017", "1", "2");
  await page.getByTestId("comprehensive-8na-converted-no").check();
  await fillLabeledDate(page, "임대개시일", "2017", "2", "1");
  await page.locator('div:has(> label:has-text("현재 임대료 (월)"))').getByPlaceholder("0").fill("1000000");
}

async function calc(page: Page): Promise<void> {
  await clickNext(page);
  const calcResponse = page.waitForResponse(
    (r) => r.url().includes("/api/calc/comprehensive") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /계산하기/ }).click();
  const resp = await calcResponse;
  expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);
}

test("WORD-E2E-1: 8호 → 2호 안내 · 경과 3년 → 추징 경고 새 문구", async ({ page }) => {
  test.setTimeout(90_000);
  await toStep3(page);
  await expect(page.getByTestId("comprehensive-8ho-2ho-hint")).toHaveText(
    "2018.3.31. 이전에 임대사업자 등록과 사업자등록을 모두 마친 민간매입임대는 2호(의무임대기간 5년)로도 판정할 수 있습니다.",
  );
  await page.locator('div.space-y-1\\.5:has(> label:has-text("실제 임대 경과 연수"))').locator("input").fill("3");
  await calc(page);
  // 경고는 결과 경고 목록과 합산배제 「확인 필요」 상자 두 곳에 뜬다
  await expect(page.getByText("경감받은 세액과 이자상당가산액을 추징합니다", { exact: false }).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("자진말소·자동말소된 경우에 한해 추징하지 않습니다", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("소급 추징", { exact: false })).toHaveCount(0);
});

test("WORD-E2E-2: 말소 2024.3.1. → 불성립 사유 「등록이 말소됨」", async ({ page }) => {
  test.setTimeout(90_000);
  await toStep3(page);
  await page.getByRole("switch", { name: "임대등록 말소" }).click();
  await expect(page.getByText("과세기준일까지 임대사업자 등록이 말소된 경우 (자진·자동·직권 말소)")).toBeVisible();
  await fillLabeledDate(page, "말소일", "2024", "3", "1");
  await calc(page);
  const reasons = page.getByTestId("comprehensive-exclusion-fail-reasons");
  await expect(reasons).toContainText("과세기준일(6월 1일 — 당일 포함)까지 임대사업자 등록이 말소됨", { timeout: 30_000 });
  await expect(reasons).not.toContainText("의무임대기간 미충족");
});
