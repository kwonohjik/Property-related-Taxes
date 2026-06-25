import { test, expect, type Page } from "@playwright/test";

/**
 * E2E: §42의3 재산취득 후 가치증가 — 계산사례 프리셋·증여재산가액·적용요건 echo·§41의3 경계.
 * 국세청 2004 개정세법 해설 pp.197~200 사례1(형질변경 18.7억)·사례3(비상장주식 상장 90억).
 */

/** 공통 증여일 입력 (모달 상단 DateInput — 취득일·사유발생일보다 먼저 위치 → .first()) */
async function fillGiftDate(dialog: ReturnType<Page["getByTestId"]>, yyyy: string, mm: string, dd: string) {
  await dialog.getByPlaceholder("YYYY").first().fill(yyyy);
  await dialog.getByPlaceholder("MM").first().fill(mm);
  await dialog.getByPlaceholder("DD").first().fill(dd);
}

async function openValueIncreaseModal(page: Page) {
  await page.goto("/calc/gift-deemed");
  await page.getByTestId("deemed-type-value_increase").click();
  const dialog = page.getByTestId("deemed-detail-dialog");
  await expect(dialog).toBeVisible();
  await fillGiftDate(dialog, "2025", "3", "15");
  return dialog;
}

test("사례1 형질변경 프리셋 → 증여재산가액 18.7억 + 적용요건 echo", async ({ page }) => {
  const dialog = await openValueIncreaseModal(page);
  await dialog.getByTestId("deemed-vi-preset-1").click();
  await page.getByTestId("deemed-detail-confirm").click();
  await page.getByTestId("deemed-calc-btn").click();

  await expect(page.getByTestId("deemed-result-value")).toContainText("1,870,000,000", { timeout: 15_000 });
  const detail = page.getByTestId("deemed-vi-detail");
  await expect(detail).toBeVisible();
  await expect(detail).toContainText("형질변경");
});

test("사례3 비상장주식 상장 프리셋 → 90억 + §41의3 경계 안내", async ({ page }) => {
  const dialog = await openValueIncreaseModal(page);
  await dialog.getByTestId("deemed-vi-preset-3").click();
  await page.getByTestId("deemed-detail-confirm").click();
  await page.getByTestId("deemed-calc-btn").click();

  await expect(page.getByTestId("deemed-result-value")).toContainText("9,000,000,000", { timeout: 15_000 });
  await expect(page.getByTestId("deemed-vi-exchange-notice")).toBeVisible();
});
