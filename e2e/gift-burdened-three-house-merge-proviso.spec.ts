/**
 * E2E: 증여세 부담부증여 — 세대 3주택 + 합가일에서 §154① 단서 카드를 열지 않는다
 * (V-8 · `docs/00-pm/rental-4ho-temp-merge-gaps.plan.md` §8).
 *
 * 이 화면에는 다른 보유 주택 목록이 없어 3주택 합가 특례를 판정하지 않는다(입력 화면의 `bg-three-house-merge-notice`).
 * 종전에는 단서 카드가 열려 4호 등 사유를 받았지만 세액과 무관했다. 게이트·④·⑧은 anchor
 * `__tests__/calc/gift-burdened-three-house-merge-proviso-v8.anchor.test.ts`가 고정한다. 여기서는 화면에서 카드가 실제로 사라지는지만 본다.
 */
import { test, expect } from "@playwright/test";
import { fillDateAndVerify } from "./_helpers/tax-flow";
import { addApartmentWithDebt, enableBurdenedTransferToggle, fillApartmentTransferInfo } from "./_helpers/gift-burdened-transfer";

test("[BG-V8] 세대 2주택 + 혼인일 → 단서 카드 있음 · 3주택으로 바꾸면 카드 없음 + 판정하지 않는다는 안내", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/calc/gift-tax");
  await fillDateAndVerify(page, { year: "2024", month: "5", day: "1" });
  await page.locator("select").first().selectOption({ index: 1 });
  await page.getByRole("button", { name: /^다음/ }).click();

  const dialog = await addApartmentWithDebt(page);
  await enableBurdenedTransferToggle(dialog);
  await fillApartmentTransferInfo(dialog); // 취득 2010-03-15 · 1세대 ON · 거주 120개월

  const count = dialog.getByTestId("bg-transfer-house-count");
  await count.fill("2");
  await expect(count).toHaveValue("2");
  await fillDateAndVerify(page, { year: "2020", month: "1", day: "1" }, { scope: dialog.getByTestId("merge-date-marriage") });
  await dialog.getByText("세대 내 먼저 양도하는 주택", { exact: true }).click();
  await expect(dialog.getByTestId("proviso-reason-rental_4ho")).toBeVisible();
  await expect(dialog.getByTestId("bg-three-house-merge-notice")).toHaveCount(0);

  await count.fill("3");
  await expect(count).toHaveValue("3");
  await expect(dialog.getByTestId("bg-three-house-merge-notice")).toBeVisible();
  await expect(dialog.getByTestId("proviso-reason-rental_4ho")).toHaveCount(0);
  await expect(dialog.getByTestId("proviso-reason-none")).toHaveCount(0);
  await dialog.screenshot({ path: process.env.BG_V8_SHOT ?? "test-results/bg-v8.png" });
});
