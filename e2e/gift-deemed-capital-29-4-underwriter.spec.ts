import { test, expect } from "@playwright/test";

/**
 * E2E: 「상증법」§39①1호 다목 괄호 · 「상증령」§29④ — 「제3자 직접배정 (다목)」 선택지가 인수인 경유 포함 범위와
 * 두 기준일(2017.1.1. 인수인 · 2017.2.7. §29④)을 실제 화면에 보여주는가. 증자·전환주식 두 폼 모두.
 * 규칙 anchor: `__tests__/components/calc/deemed-gift/third-party-underwriter-29-4.anchor.test.tsx`.
 */
for (const [type, prefix] of [["capital_increase", "ci"], ["convertible_stock", "cs"]] as const) {
  test(`${type} — 다목 선택지에 인수인 경유 안내, 가목에는 없음`, async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await page.getByTestId(`deemed-type-${type}`).click();
    const dialog = page.getByTestId("deemed-detail-dialog");
    const third = dialog.locator("label", { has: page.getByTestId(`${prefix}-subtype-third_party`) });
    await expect(third).toContainText("자본시장법 §9⑫ 인수인");
    await expect(third).toContainText("2017.1.1. 이후 인수·취득분부터");
    await expect(third).toContainText("2017.2.7. 이후 증여분부터(상증령 §29④)");
    await expect(third).toContainText("직접 검토");
    const first = dialog.locator("label", { has: page.getByTestId(`${prefix}-subtype-forfeited_realloc`) });
    await expect(first).not.toContainText("인수인");
  });
}
