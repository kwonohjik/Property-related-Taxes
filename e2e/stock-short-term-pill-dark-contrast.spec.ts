/**
 * 주식 양도소득세 결과 — 「단기보유」 알약 다크 모드 대비.
 *
 * 밝은 rose-100 알약에 `dark:text-rose-600`이 붙어 있어 다크에서 3.77이었다(글자만 어두워짐).
 * 게이트(`scripts/check-dark-pairs.mjs` ⑦)는 리터럴만 보므로 실제 렌더 색은 이 spec이 잡는다.
 *
 * 단기보유 판정은 **비중소기업 대주주**(`unlisted_major`·`listed_major`)일 때만 켜진다
 * (`stock-transfer-tax.ts` isShortTermHolding) — 본인 단독 지분율을 임계 이상으로 넣는다.
 */
import { test, expect } from "@playwright/test";
import { expectDarkContrast } from "./_helpers/dark-contrast";
import { gotoStockTransferTax, fillByLabel } from "./_helpers/stock-item-fill";
import { chooseAcqPerShare } from "./_helpers/stock-acq-input-mode";

test("단기보유 알약 — 다크 모드 글자 대비 4.5 이상", async ({ page }) => {
  test.setTimeout(180_000);
  await gotoStockTransferTax(page);

  await page.getByPlaceholder("종목명을 입력하세요").fill("단기종목");
  await page.getByRole("radio", { name: "비상장" }).first().click();
  const y = page.locator('input[type="text"][aria-label="연도"]');
  const m = page.locator('input[type="text"][aria-label="월"]');
  const d = page.locator('input[type="text"][aria-label="일"]');
  // 취득 2024-06-01 → 양도 2024-12-01 (1년 미만)
  await y.nth(0).fill("2024"); await m.nth(0).fill("06"); await d.nth(0).fill("01");
  await y.nth(1).fill("2024"); await m.nth(1).fill("12"); await d.nth(1).fill("01");
  const card = (label: string) =>
    page.locator('[data-slot="field-card"]').filter({ hasText: label }).locator("input").first();
  await card("양도 주식수").fill("1000000");
  await card("발행주식 총수").fill("1000000");
  await card("본인 단독 지분율").fill("60"); // 대주주 → 단기 30% 판정이 켜진다
  await page.getByRole("button", { name: /^다음/ }).click();

  await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });
  await fillByLabel(page, "양도가액 합계", "100000000");
  await chooseAcqPerShare(page);
  await fillByLabel(page, "1주당 취득가액", "500000");
  await page.getByRole("button", { name: /^다음/ }).click();

  await expect(page.getByText("필요경비·신고").first()).toBeVisible({ timeout: 10_000 });
  await page.locator('input[type="text"][aria-label="연도"]').nth(0).fill("2025");
  await page.locator('input[type="text"][aria-label="월"]').nth(0).fill("02");
  await page.locator('input[type="text"][aria-label="일"]').nth(0).fill("28");

  const resp = page.waitForResponse(
    (r) => r.url().includes("/api/calc/stock-transfer") && r.request().method() === "POST",
    { timeout: 60_000 },
  );
  await page.getByRole("button", { name: "결과 보기" }).click();
  await resp;

  const pill = page.getByText("단기보유", { exact: true });
  await expect(pill.first()).toBeVisible({ timeout: 30_000 });
  await expectDarkContrast(page, pill);
});
