/**
 * 주식 양도세 마법사 — 종목 입력 공용 헬퍼.
 *
 * `stock-multi-item-aggregate.spec.ts`가 들고 있던 것을 다종목 spec 2개가 공유하도록 옮겼다.
 * 손으로 복제하면 마법사 DOM이 바뀔 때 한쪽만 고쳐져 조용히 드리프트한다.
 *
 * 🔑 종목 확정 버튼은 **마지막 입력 단계(3단계)**에 있다 — 양도가액은 2단계, 필요경비·신고는
 *    3단계라 1단계에서 확정하면 금액이 빈 종목이 목록에 들어간다.
 */
import { expect, type Page } from "@playwright/test";
import { chooseAcqPerShare } from "./stock-acq-input-mode";

export async function gotoStockTransferTax(page: Page) {
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("종목명을 입력하세요").waitFor({ state: "visible", timeout: 30_000 });
}

export async function fillByLabel(page: Page, label: string, value: string) {
  await page.locator(`div:has(> label:has-text('${label}')) input[type="text"]`).first().fill(value);
}

/** 1단계 — 비상장 종목 (취득 2021-01-02 / 양도 지정일 · 100주) */
export async function fillStep1(page: Page, name: string, t: { y: string; m: string; d: string }) {
  await page.getByPlaceholder("종목명을 입력하세요").fill(name);
  await page.getByRole("radio", { name: "비상장" }).first().click();

  const y = page.locator('input[type="text"][aria-label="연도"]');
  const m = page.locator('input[type="text"][aria-label="월"]');
  const d = page.locator('input[type="text"][aria-label="일"]');
  await y.nth(0).fill("2021");
  await m.nth(0).fill("01");
  await d.nth(0).fill("02");
  await y.nth(1).fill(t.y);
  await m.nth(1).fill(t.m);
  await d.nth(1).fill(t.d);

  await page
    .locator('[data-slot="field-card"]')
    .filter({ hasText: "양도 주식수" })
    .locator("input")
    .first()
    .fill("100");
  await page
    .locator('[data-slot="field-card"]')
    .filter({ hasText: "발행주식 총수" })
    .locator("input")
    .first()
    .fill("1000000");
}

/** 1 → 2 → 3단계 완주. 양도소득 50,000,000이 나오게 채운다. */
export async function fillItemThroughStep3(
  page: Page,
  name: string,
  t: { y: string; m: string; d: string },
) {
  await fillStep1(page, name, t);

  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });
  await fillByLabel(page, "양도가액 합계", "100000000");
  await chooseAcqPerShare(page);
  await fillByLabel(page, "1주당 취득가액", "500000");

  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("필요경비·신고").first()).toBeVisible({ timeout: 10_000 });

  // 신고일 — validate가 요구한다. 신고 단위 필드라 종목 확정 시 승계되지만,
  // 첫 종목에서는 직접 채워야 한다.
  await page.locator('input[type="text"][aria-label="연도"]').nth(0).fill("2025");
  await page.locator('input[type="text"][aria-label="월"]').nth(0).fill("02");
  await page.locator('input[type="text"][aria-label="일"]').nth(0).fill("28");
}
