import { test, expect } from "@playwright/test";

/**
 * E2E: #17 고가 혼합 증자 — 실권주 일부 재배정 + 나머지 실권처리 (cap-table).
 * 재배정분은 「상증령」§29②3호(기준금액 없음)로 과세되고, 나머지만 §29②4호 30%·3억 게이트를 받는다.
 * 종전에는 게이트가 이익 전체에 걸려 0원이었다. 규칙 anchor: `captable-high-mok-split.anchor.test.ts`.
 */
test("고가 혼합 — 갑 60,000주 포기 · 을 자기분 40,000 + 재배정 30,000 → 갑 52,950,000(을로부터)", async ({ page }) => {
  await page.goto("/calc/gift-deemed");
  await page.getByTestId("deemed-type-capital_increase_allocation").click();
  const dialog = page.getByTestId("deemed-detail-dialog");
  await dialog.getByLabel("연도").fill("2025");
  await dialog.getByLabel("월").fill("7");
  await dialog.getByLabel("일", { exact: true }).fill("1");
  await page.getByTestId("ci-alloc-direction-high").click();
  await page.getByLabel("증자 전 1주당 평가가액", { exact: true }).fill("10000");
  await page.getByLabel("신주 1주당 인수가액", { exact: true }).fill("13000");
  const rows: [string, string, string, string, string][] = [
    ["갑", "60000", "60000", "0", "0"],
    ["을", "40000", "40000", "70000", "30000"],
  ];
  for (const [i, [name, pre, entitled, subscribed, realloc]] of rows.entries()) {
    const row = page.getByTestId(`ci-alloc-row-${i}`);
    await page.getByTestId(`ci-alloc-name-${i}`).fill(name);
    await row.getByPlaceholder("증자 전 보유 주식수").fill(pre);
    await row.getByPlaceholder("균등 배정 신주수").fill(entitled);
    await row.getByPlaceholder("실제 인수 신주수").fill(subscribed);
    await row.getByPlaceholder("재배정/제3자/초과 신주수").fill(realloc);
  }
  await page.getByTestId("ci-alloc-related-0-sh-2").click(); // 갑 ↔ 을 특수관계
  await page.getByTestId("deemed-detail-confirm").click();
  await page.getByTestId("deemed-calc-btn").click();
  await expect(page.getByTestId("ci-alloc-total-sh-1")).toHaveText("52,950,000");
  await expect(page.getByTestId("ci-alloc-split-value-sh-1-sh-2")).toHaveText("52,950,000");
});
