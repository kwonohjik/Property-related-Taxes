import { test, expect, type Page } from "@playwright/test";
import { openHouseModal, closeHouseModal, expandHouseAdvanced } from "./_helpers/tax-flow";

/**
 * 종부세 합산배제 유형 선택지 — 첫 드롭다운(합산배제 유형) → 다음 단계 임대등록 유형 동기화.
 * 종전엔 단기 2종·6호만 맞춰 공공건설임대를 골라도 임대등록 유형이 「민간매입임대 장기일반」으로 남아 8호로 판정됐다.
 *
 * worktree 실행: E2E_PORT=3103 npx playwright test e2e/comprehensive-exclusion-type-sync.spec.ts
 */

async function pickExclusion(page: Page, value: string): Promise<void> {
  await page.goto("/calc/comprehensive-tax");
  await page.getByRole("radio", { name: "2025" }).check();
  await page.getByRole("button", { name: /^다음/ }).click();
  await openHouseModal(page, 0);
  await page.getByPlaceholder("금액 입력").first().fill("500000000");
  await expandHouseAdvanced(page);
  const select = page.getByRole("dialog").locator(`select:has(option[value="${value}"])`);
  await expect(select.locator('option[value="public_support_rental"]')).toHaveCount(0);
  await select.selectOption(value);
  await closeHouseModal(page);
  await page.getByRole("button", { name: /^다음/ }).click();
}

test.describe("종부세 합산배제 유형 → 임대등록 유형 동기화", () => {
  for (const [exclusion, registration] of [
    ["public_construction_rental", "public_construction"],
    ["public_support_construction_rental", "public_support_construction"],
    ["existing_rental", "existing_rental"],
  ] as const) {
    test(`${exclusion} → ${registration}`, async ({ page }) => {
      test.setTimeout(60_000);
      await pickExclusion(page, exclusion);
      await expect(page.locator(`select:has(option[value="${registration}"])`)).toHaveValue(registration);
    });
  }
});
