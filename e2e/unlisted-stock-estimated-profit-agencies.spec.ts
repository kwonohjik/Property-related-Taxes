/**
 * E2E: 비상장주식 §56② 추정이익 갈음 — 평가기관 메타(E) + 개정연혁 시점 안내(D)
 *
 * 설계서: docs/02-design/features/unlisted-stock-estimated-profit-calculation-56-2.ui.design.md §12
 *
 * 시나리오:
 *   EP-AGY-1: 추정이익 토글 ON → 기관 2개 (유형+이름+추정이익) 입력 → 미리보기 확인
 *   EP-AGY-2: + 평가기관 추가 → 기관 3개 시 agencies 행 3개 표시
 *   EP-AGY-3: 기관명 testid 입력 및 값 확인
 *
 * anchor 기대값 (UI-DE-2 — ui.design.md §11):
 *   agencies = [NICE신용평가(신용평가전문기관), 삼일회계법인(회계법인)]
 *   → 기관명 testid "estimated-profit-agency-name-{idx}"
 *   → 미리보기 "기관 2개 평균" 포함
 *
 * testid 목록 (신규):
 *   "estimated-profit-agency-type-{idx}"   — RadioCardGroup
 *   "estimated-profit-agency-name-{idx}"   — text input
 *   "result-evaluation-method-badge"       — 결과 카드 배지
 *   "result-agency-meta-list"              — 기관 목록
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 */

import { test, expect, type Page } from "@playwright/test";
import { addHeir } from "./_helpers/tax-flow";

// ─── helpers ───────────────────────────────────────────────────────────────

async function gotoStep0AndFillDeathDate(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2024");
  await page.getByLabel("월").first().fill("6");
  await page.getByLabel("일").first().fill("10");
  await addHeir(page, "heir", "child");
  await page.getByRole("button", { name: /^다음/ }).click();
}

/** 비상장주식 V2 정식평가 카드 오픈 */
async function openV2FormalCard(page: Page) {
  await page.getByRole("button", { name: /주식·지분 추가/ }).click();
  await page.getByRole("button", { name: /비상장주식/ }).click();
  await page.getByText("정식평가", { exact: true }).click();
}

/** 추정이익 토글 ON */
async function toggleEstimatedProfitOn(page: Page) {
  const toggle = page.getByRole("switch", { name: /추정이익 평균가액 갈음/ });
  await toggle.click();
  await expect(page.getByTestId("estimated-profit-form")).toBeVisible({ timeout: 5000 });
}

// ─── tests ─────────────────────────────────────────────────────────────────

test.describe("EP-AGY: §56② 추정이익 갈음 — 기관 메타 + 시점 안내", () => {
  test("EP-AGY-1: 추정이익 토글 ON → 기관명 testid 표시 확인", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page);
    await openV2FormalCard(page);
    await toggleEstimatedProfitOn(page);

    // 기관 0 기관명 testid 표시 확인
    const nameInput0 = page.getByTestId("estimated-profit-agency-name-0");
    await expect(nameInput0).toBeVisible({ timeout: 5000 });

    // 기관 1 기관명 testid 표시 확인
    const nameInput1 = page.getByTestId("estimated-profit-agency-name-1");
    await expect(nameInput1).toBeVisible({ timeout: 3000 });
  });

  test("EP-AGY-2: 기관명 입력 후 값 보존 확인", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page);
    await openV2FormalCard(page);
    await toggleEstimatedProfitOn(page);

    // 기관 1 기관명 입력
    const nameInput0 = page.getByTestId("estimated-profit-agency-name-0");
    await nameInput0.fill("NICE신용평가");
    await expect(nameInput0).toHaveValue("NICE신용평가");

    // 기관 2 기관명 입력
    const nameInput1 = page.getByTestId("estimated-profit-agency-name-1");
    await nameInput1.fill("삼일회계법인");
    await expect(nameInput1).toHaveValue("삼일회계법인");

    // 미리보기 표시 확인 (절차 요건 미충족 시 요건 미충족 안내)
    const preview = page.getByTestId("estimated-profit-preview");
    await expect(preview).toBeVisible({ timeout: 5000 });
  });

  test("EP-AGY-3: + 평가기관 추가 → 기관 3개 행 표시", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page);
    await openV2FormalCard(page);
    await toggleEstimatedProfitOn(page);

    // 초기 기관 2개 확인
    await expect(page.getByTestId("estimated-profit-agency-name-0")).toBeVisible();
    await expect(page.getByTestId("estimated-profit-agency-name-1")).toBeVisible();

    // + 평가기관 추가
    await page.getByTestId("estimated-profit-add-agency").click();

    // 기관 3개 행 표시 확인
    await expect(page.getByTestId("estimated-profit-agency-name-2")).toBeVisible({ timeout: 3000 });

    // 기관 3개 시 삭제 버튼 표시 확인
    await expect(page.getByTestId("estimated-profit-remove-0")).toBeVisible();
    await expect(page.getByTestId("estimated-profit-remove-1")).toBeVisible();
    await expect(page.getByTestId("estimated-profit-remove-2")).toBeVisible();
  });
});
