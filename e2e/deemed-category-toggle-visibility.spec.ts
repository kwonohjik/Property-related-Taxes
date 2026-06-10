/**
 * E2E: 간주상속재산(보험금·신탁·퇴직금) 토글 노출 정합화 (2026-06-05)
 *
 * 계획서: docs/00-pm/deemed-category-toggle-visibility.plan.md
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_engine_comment_vs_impl_drift]]
 *
 * 정합화 (resolver를 §19① eligibility에 일치):
 *   - §8 보험금: 금융재산(§19①) → 금융공제 칩 노출(default), 영농·가업 칩 미노출(deemed permanent)
 *   - §9 신탁: 금전신탁만 §22 → 부동산/증권/미선택은 금융공제 칩 미노출(hidden_expandable, 버그1 정정)
 *   - §10 퇴직금: §19① 미열거 → financial base여도 금융공제 칩 미노출(hidden_permanent, 버그2 정정)
 *
 * 칩 testid: estate-chip-{section22|farming|family-business}-{itemId}
 */

import { test, expect, type Page } from "@playwright/test";
import { addHeir, closeHeirEditModal } from "./_helpers/tax-flow";

async function gotoStep1WithChild(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2026");
  await page.getByLabel("월").first().fill("5");
  await page.getByLabel("일").first().fill("15");
  await addHeir(page, "heir", "child");
  await closeHeirEditModal(page);
  await page.getByRole("button", { name: /^다음/ }).click();
}

/** 간주분류 사전 선택 → base 종류 클릭 → 카드 추가 → 편집 모달 자동 오픈(E-1) */
async function addDeemedAsset(
  page: Page,
  deemedLabel: RegExp,
  baseTypeLabel: string | RegExp,
) {
  await page
    .getByRole("button", { name: /재산 추가|상속재산 추가/ })
    .first()
    .click();
  await page.getByRole("button", { name: deemedLabel }).click(); // 간주분류 칩
  if (typeof baseTypeLabel === "string") {
    await page.getByText(baseTypeLabel, { exact: true }).click();
  } else {
    await page.getByRole("button", { name: baseTypeLabel }).first().click();
  }
  // estate-card-shell은 테이블 전환으로 폐기 → 편집 모달 자동 오픈으로 대체
  await expect(page.getByTestId("estate-edit-dialog")).toBeVisible();
}

test.describe("간주상속재산 토글 노출 정합화", () => {
  test("DTV-1: 보험금(§8) + 예금·펀드 → 금융공제 칩 노출 + 영농·가업 칩 미노출", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoStep1WithChild(page);
    await addDeemedAsset(page, /보험금/, "예금·펀드·채권·공제금");

    // §19① 보험금 = 금융재산 → 금융공제 칩 노출
    await expect(
      page.locator('[data-testid^="estate-chip-section22-"]').first(),
    ).toBeVisible();
    // 보험금은 영농·가업 자산 아님 → 칩 미노출 (deemed hidden_permanent)
    await expect(
      page.locator('[data-testid^="estate-chip-farming-"]'),
    ).toHaveCount(0);
    await expect(
      page.locator('[data-testid^="estate-chip-family-business-"]'),
    ).toHaveCount(0);
  });

  test("DTV-2: 퇴직금(§10) + 예금·펀드 → 금융공제 칩 미노출 (버그2 정정)", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoStep1WithChild(page);
    await addDeemedAsset(page, /퇴직금/, "예금·펀드·채권·공제금");

    // §19① 퇴직금 미열거 → financial base여도 금융공제 칩 미노출
    await expect(
      page.locator('[data-testid^="estate-chip-section22-"]'),
    ).toHaveCount(0);
  });

  test("DTV-3: 신탁(§9) + 토지 (trustType 미선택) → 금융공제 칩 미노출 (버그1 정정)", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoStep1WithChild(page);
    await addDeemedAsset(page, /신탁재산/, /토지/);

    // §19① 금전신탁만 §22 → trustType 미선택은 금융공제 칩 미노출 (hidden_expandable)
    await expect(
      page.locator('[data-testid^="estate-chip-section22-"]'),
    ).toHaveCount(0);
  });
});
