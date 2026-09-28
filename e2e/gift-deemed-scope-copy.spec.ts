/**
 * #121 — 증여이익 계산기 소개 문구가 §39 증자를 포함한 제공 범위를 말한다.
 *
 * vitest(`gift-deemed-scope-121.anchor.test.tsx`)는 `metadata` 객체를 본다. 그것이 실제
 * `<head>`와 본문·홈 카드로 나가는지는 렌더된 페이지에서만 관측된다.
 */
import { test, expect } from "@playwright/test";

test.describe("증여이익 계산기 소개 문구 (#121)", () => {
  test("[SC-E2E-1] meta·OG description과 본문이 증자와 §33~§45의5를 말한다", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    for (const sel of ['meta[name="description"]', 'meta[property="og:description"]']) {
      const content = await page.locator(sel).getAttribute("content");
      expect(content).toContain("증자");
      expect(content).toContain("상증법 §33~§45의5");
      expect(content).not.toContain("§34·§35·§36·§37·§41의4");
    }
    const lead = page.getByText(/증여재산가액 산정 → 증여세 계산 연결/);
    await expect(lead).toContainText("증자");
    await expect(lead).toContainText("상증법 §33~§45의5");
  });

  test("[SC-E2E-2] 홈 카드 부제가 자본거래·추정·의제를 말한다", async ({ page }) => {
    await page.goto("/");
    const card = page.locator('a[href="/calc/gift-deemed"]');
    await expect(card).toContainText("자본거래");
    await expect(card).toContainText("증여 추정·의제");
  });
});
