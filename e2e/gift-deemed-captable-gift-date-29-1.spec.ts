import { test, expect } from "@playwright/test";

/**
 * E2E: 「상증령」§29① — 다주주(cap-table) 모드 증여일 칸도 단건과 같은 세 갈래 안내를 보이고,
 * 2016.2.5. 전 증여일이면 #95 시점 고지를 띄운다. 규칙 anchor: `captable-gift-date-29-1.anchor.test.tsx`.
 */
test("다주주 모드 — 증여일 라벨 §29① · 2015-02-02 시점 고지", async ({ page }) => {
  await page.goto("/calc/gift-deemed");
  await page.getByTestId("deemed-type-capital_increase_allocation").click();
  const dialog = page.getByTestId("deemed-detail-dialog");
  await expect(dialog.getByText("증여일 — 권리락일 또는 주식대금 납입일 (§29①)")).toBeVisible();
  await expect(dialog.getByTestId("ci-gift-date-era-notice")).toHaveCount(0);
  const gd = dialog.getByTestId("deemed-gift-date");
  await gd.getByLabel("연도").fill("2015");
  await gd.getByLabel("월").fill("2");
  await gd.getByLabel("일", { exact: true }).fill("2");
  await expect(dialog.getByTestId("ci-gift-date-era-notice")).toContainText("주식대금 납입일");
});
