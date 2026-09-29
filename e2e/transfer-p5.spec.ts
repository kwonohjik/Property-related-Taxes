/**
 * P5 — §98 폼 + 모드 2 보유 감면주택(명부 행 ⑥) UI E2E
 *
 * worktree 실행: E2E_PORT=3100 npx playwright test e2e/transfer-p5.spec.ts
 */
import { test, expect } from "@playwright/test";
import { expandReductionCategory } from "./_helpers/expandReductionCategory";
import { gotoTransferHoldingsStep, otherHouse } from "./_helpers/transfer-seed";

test.describe("양도세 P5", () => {
  test("Step4 명부 행 ⑥ 감면주택 + 미분양 그룹 → §98 폼 렌더", async ({ page }) => {
    // ── Step4 보유 상황: 보유 감면주택은 명부 행 ⑥에서 지정한다(2026-09-30 — 종전 폼 전역 섹션에서 이전,
    //    `transfer-calc-count-exclusion-row-link.plan.md`). 주택 양도에서는 종전 스위치가 없다.
    // 양도 주택 취득일은 비워 둔다(종전 spec과 같다) — §98 시한은 취득일로 판정하므로 2015년이면 비활성이 된다.
    await gotoTransferHoldingsStep(page, {
      houses: [otherHouse("s", "2009-06-01")],
      assetOver: { acquisitionDate: "" },
    });
    await expect(page.getByRole("switch", { name: /조특법 감면주택 보유/ })).toHaveCount(0);
    await page.getByRole("button", { name: "주택 1 편집" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByTestId("house-row-count-exclusion-special").click();
    await expect(dialog.getByText("적용 조문", { exact: false }).first()).toBeVisible();
    await dialog.getByRole("button", { name: "완료" }).click();
    await expect(page.getByTestId("house-count-exclusion-badge-s")).toHaveText("주택 수 제외: 감면주택");

    // ── Step5 감면: §98 폼 ──
    await page.getByRole("button", { name: "감면·공제" }).first().click();
    await expandReductionCategory(page, /미분양주택/);
    const item98 = page.getByText("§98 — 미분양 분리과세 20%", { exact: false }).first();
    await expect(item98).toBeVisible();
    await item98.click();
    await expect(page.getByText(/국민주택규모 이하/).first()).toBeVisible();
    await expect(page.getByText(/5년 이상 보유·임대/).first()).toBeVisible();
    await expect(page.getByText(/100분의 20 단일세율/).first()).toBeVisible();
  });
});
