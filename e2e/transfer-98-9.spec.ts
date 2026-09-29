/**
 * §98의9 수도권 밖 준공후미분양 — 주택 수 제외 입력 위치 E2E
 *
 * 2026-09-30 — 입력이 ③ 감면 패널에서 **② 보유 주택 목록의 행 편집 ⑥**으로 옮겨졌다
 * (`docs/00-pm/transfer-calc-count-exclusion-row-link.plan.md` Q-3). 취득일·취득가액·전용면적은
 * 행 값이고, 수도권 여부는 행 법정동코드에서 정한다(선행 계획서 V-4).
 */
import { test, expect } from "@playwright/test";
import { expandReductionCategory } from "./_helpers/expandReductionCategory";
import { gotoTransferHoldingsStep, otherHouse } from "./_helpers/transfer-seed";

const UNSOLD = otherHouse("u", "2024-03-01", {
  acquisitionPrice: "500000000",
  exclusiveArea: "84",
  regionCode: "4311110100", // 충청북도 — 수도권 밖
});

test.describe("양도세 §98의9 준공후미분양 — 명부 행 ⑥", () => {
  test("[98-9-A] ③ 미분양주택 그룹에는 §98의9가 없고, 어디서 입력하는지 안내한다", async ({ page }) => {
    await gotoTransferHoldingsStep(page, { houses: [UNSOLD] });
    await page.getByRole("button", { name: "감면·공제" }).first().click();
    await expandReductionCategory(page, /미분양주택/);
    await expect(page.getByTestId("reduction-row-count-exclusion-hint-unsold_housing")).toContainText("§98의9");
    await expect(page.getByText("§98의9 — 수도권 밖 준공후미분양 (주택수 제외)")).toHaveCount(0);
  });

  test("[98-9-B] 보유 상황 → 주택 1 편집 → ⑥ 준공후미분양 → 행 값·자동 지역 판정", async ({ page }) => {
    await gotoTransferHoldingsStep(page, { houses: [UNSOLD] });
    await page.getByRole("button", { name: "주택 1 편집" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByTestId("house-row-count-exclusion-unsold_98_9").click();

    await expect(dialog.getByTestId("unsold989-row-acq-date")).toContainText("2024-03-01");
    await expect(dialog.getByTestId("unsold989-row-price")).toContainText("500,000,000");
    await expect(dialog.getByTestId("unsold989-row-area")).toContainText("84");
    await expect(dialog.getByTestId("unsold989-row-region")).toContainText("수도권 밖");
    await expect(dialog.getByText(/7억 이하/).first()).toBeVisible();
    await expect(dialog.getByText("취득 당시 1세대 1주택", { exact: false }).first()).toBeVisible();
  });
});
