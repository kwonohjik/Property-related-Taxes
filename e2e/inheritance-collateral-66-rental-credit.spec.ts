/**
 * E2E: 상속세 §66 — 임대료환산가액(㉱) + 신용보증기관 보증액 차감(㉲) 입력 UI
 *
 * 검증:
 *   - 토지: 신용보증기관 보증액 칸 노출, 월 임대료 비노출(주택 한정 D-UI1)
 *   - 주택: 월 임대료 칸 노출·입력, 저당+신용보증 입력 (저당0 disabled D-UI2)
 *
 * 설계: docs/02-design/features/inheritance-collateral-66-rental-credit-guarantee.{plan,ui.design}.md
 */
import { test, expect, type Page } from "@playwright/test";
import { addHeir } from "./_helpers/tax-flow";

async function gotoEstate(page: Page, assetButton: RegExp) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2023");
  await page.getByLabel("월").first().fill("3");
  await page.getByLabel("일").first().fill("10");
  await addHeir(page, "heir", "child");
  await page.getByRole("button", { name: /^다음/ }).click();
  await page.getByRole("button", { name: /상속재산 추가/ }).click();
  await page.getByRole("button", { name: assetButton }).first().click();
}

function fieldInput(page: Page, label: string) {
  return page
    .getByText(label, { exact: true })
    .locator("xpath=ancestor::div[@data-slot='field-card']//input");
}

test.describe("§66 임대료환산(㉱)+신용보증(㉲) 입력 UI", () => {
  test("토지 → 신용보증기관 보증액 칸 노출 + 월 임대료 비노출(주택 한정)", async ({ page }) => {
    await gotoEstate(page, /토지/);
    // 담보·임대 섹션 토글 ON (2026-06-09 토글 전환 — 신용보증·저당 칸 펼침)
    await page.getByRole("switch", { name: /담보·임대/ }).click();
    await expect(
      page.getByText("신용보증기관 보증액 (원)", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("월 임대료 (원)", { exact: true })).toHaveCount(0);
  });

  test("주택 → 월 임대료 칸 노출·입력 + 저당·신용보증 입력 (저당0 disabled)", async ({ page }) => {
    await gotoEstate(page, /주택/);
    // 담보·임대 섹션 토글 ON (2026-06-09 토글 전환 — 월 임대료·저당·신용보증 칸 펼침)
    await page.getByRole("switch", { name: /담보·임대/ }).click();

    // 월 임대료 칸 노출 + 입력
    await expect(page.getByText("월 임대료 (원)", { exact: true })).toBeVisible();
    await fieldInput(page, "월 임대료 (원)").fill("1000000");

    // 신용보증 칸은 저당 0이면 disabled (D-UI2)
    const creditInput = fieldInput(page, "신용보증기관 보증액 (원)");
    await expect(creditInput).toBeDisabled();

    // 저당권 입력 → 신용보증 활성화
    await fieldInput(page, "저당권 등에 의해 담보된 채권액").fill("200000000");
    await expect(creditInput).toBeEnabled();
    await creditInput.fill("120000000");
    await creditInput.blur(); // CurrencyInput: blur 시 콤마 포맷
    await expect(creditInput).toHaveValue("120,000,000");
  });
});
