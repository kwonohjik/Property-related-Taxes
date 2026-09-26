/**
 * 취득세 E2E — 보유주택 목록 → 주택 수 자동 산정 (F1 · OH-02·OH-03)
 *
 * 종전에는 보유주택 목록을 다루는 spec이 0건이었고, 「+ 보유 주택 추가」로 만든 '주택' 행은
 * ⑫ Zod enum 불일치로 **항상 400**이었다(OH-02). 실제 화면 입력 → 계산 → 결과 세액까지 본다.
 *
 * - 조정대상지역 5억 매매 + 보유 주택 1채(시가표준액 5억) → 2주택 8% = 40,000,000
 * - 보유 목록이 2019 취득 오피스텔뿐 → 법률 제17473호 부칙 제3조로 주택 수 제외 → 1% = 5,000,000
 * - 오피스텔 취득일 미입력 → ⑧ 차단
 */

import { test, expect, type Page } from "@playwright/test";
import { fillAndVerify } from "./_helpers/tax-flow";

function toggleSwitch(page: Page, titleText: string | RegExp) {
  return page.locator('[data-slot="toggle-card"]').filter({ hasText: titleText }).getByRole("switch");
}

async function toStep2WithOneRow(page: Page) {
  await page.goto("/calc/acquisition-tax");
  await fillAndVerify(page.getByPlaceholder("계약서상 거래금액"), "500000000");
  await page.getByRole("button", { name: /다음/ }).click();
  await expect(page.getByPlaceholder("85㎡ 이하이면 농특세 면제")).toBeVisible();
  await page.getByRole("button", { name: /다음/ }).click();
  await expect(page.getByText("취득 후 보유 주택 수")).toBeVisible();
  await page.getByRole("button", { name: "+ 보유 주택 추가" }).click();
  await expect(page.getByText("보유 주택 #1")).toBeVisible();
}

async function fillRowDate(page: Page, yyyy: string, mm: string, dd: string) {
  await page.getByPlaceholder("YYYY").first().fill(yyyy);
  await page.getByPlaceholder("MM").first().fill(mm);
  await page.getByPlaceholder("DD").first().fill(dd);
}

async function throughStep3AndCalc(page: Page) {
  await page.getByRole("button", { name: /다음/ }).click();
  const regulated = toggleSwitch(page, "조정대상지역 내 주택");
  await expect(regulated).toBeVisible();
  await regulated.click();
  await page.getByRole("button", { name: /다음/ }).click();
  const calcResponse = page.waitForResponse(
    (r) => r.url().includes("/api/calc/acquisition") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: /취득세 계산/ }).click();
  const resp = await calcResponse;
  expect(resp.status(), "보유주택 목록이 있는 계산이 400이면 OH-02 회귀").toBe(200);
  await expect(page.getByText(/납부세액 합계|최종 납부세액/).first()).toBeVisible();
}

test.describe("취득세 — 보유주택 목록 자동 산정 (F1)", () => {
  test("OH-02: 기본 '주택' 행 1건 → 200 · 2주택 8% 40,000,000", async ({ page }) => {
    await toStep2WithOneRow(page);
    await fillAndVerify(page.getByPlaceholder("주택공시가격·개별공시지가×면적"), "500000000");
    await fillRowDate(page, "2015", "01", "01");
    await throughStep3AndCalc(page);
    await expect(page.getByText(/40,000,000/).first()).toBeVisible();
  });

  test("OH-03: 2019 취득 오피스텔만 보유 → 주택 수 제외 · 1% 5,000,000", async ({ page }) => {
    await toStep2WithOneRow(page);
    await page.locator("select").filter({ has: page.locator("option", { hasText: "주거형 오피스텔" }) }).selectOption("officetel");
    await expect(page.getByText("매매·분양계약일 (선택)")).toBeVisible();
    await fillAndVerify(page.getByPlaceholder("주택공시가격·개별공시지가×면적"), "150000000");

    // ⑧ — 취득일 없이 다음 → 차단
    await page.getByRole("button", { name: /다음/ }).click();
    await expect(page.locator("p.text-destructive", { hasText: /취득일을 입력하세요/ })).toBeVisible();

    await fillRowDate(page, "2019", "05", "01");
    await throughStep3AndCalc(page);
    await expect(page.getByText(/5,000,000/).first()).toBeVisible();
    await expect(page.getByText(/40,000,000/)).toHaveCount(0);
  });
});
