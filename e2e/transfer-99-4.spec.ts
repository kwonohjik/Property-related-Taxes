/**
 * §99의4 농어촌·고향주택 — 주택 수 제외 입력 위치 E2E
 *
 * 2026-09-30 — 입력이 ③ 감면 패널에서 **② 보유 주택 목록의 행 편집 ⑥**으로 옮겨졌다
 * (`docs/00-pm/transfer-calc-count-exclusion-row-link.plan.md` Q-3). 종전 spec은 패널에서 폼을 렌더했다.
 */
import { test, expect } from "@playwright/test";
import { expandReductionCategory } from "./_helpers/expandReductionCategory";
import { gotoTransferHoldingsStep, otherHouse } from "./_helpers/transfer-seed";

test.describe("양도세 §99의4 농어촌주택 — 명부 행 ⑥", () => {
  test("[99-4-A] ③ 신축주택 그룹에는 §99의4가 없고, 어디서 입력하는지 안내한다", async ({ page }) => {
    await gotoTransferHoldingsStep(page, { houses: [otherHouse("r", "2021-01-01")] });
    await page.getByRole("button", { name: "감면·공제" }).first().click();
    await expandReductionCategory(page, /신축주택/);
    await expect(page.getByTestId("reduction-row-count-exclusion-hint-new_housing")).toContainText("⑥ 주택 수 제외(조특법)");
    await expect(page.getByText("§99의4 (농어촌주택) — 주택수 제외")).toHaveCount(0);
  });

  test("[99-4-B] 보유 상황 → 주택 1 편집 → ⑥ 농어촌주택 → 폼 렌더 (취득일은 행 값)", async ({ page }) => {
    await gotoTransferHoldingsStep(page, { houses: [otherHouse("r", "2021-01-01")] });
    await page.getByRole("button", { name: "주택 1 편집" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByTestId("house-row-count-exclusion-new_99_4_rural").click();

    await expect(dialog.getByTestId("new994-row-acq-date")).toContainText("2021-01-01");
    await expect(dialog.getByText("취득 당시 기준시가 합계", { exact: false }).first()).toBeVisible();
    await expect(dialog.getByText(/3억 이하/).first()).toBeVisible();
    await expect(dialog.getByText("소재지 요건 충족 확인", { exact: false }).first()).toBeVisible();
  });
});
