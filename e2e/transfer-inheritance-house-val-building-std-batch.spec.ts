/**
 * E2E: 상속취득 주택 3-시점 환산(§164⑤) — 건물기준시가 일괄 계산기 배선.
 *
 * HouseValuationSection(상속취득 평가 경로)에 PhdBuildingStdPriceModalButton을 배선.
 * 검증(F2 게이팅 — live app):
 *   T1. 상속 + 단독주택(house_individual) + 상속개시일 < 2005 → "3시점 건물기준시가 일괄 계산" 버튼 노출.
 *   T2. 공동주택(house_apart)으로 전환 → 버튼 미노출(구조·용도 방식 부적합).
 *
 * 계획서: docs/02-design/features/inheritance-house-valuation-3point-building-std-batch.plan.md
 * 정책: [[feedback_browser_verify_with_playwright]]
 * 비-worktree 실행: npx playwright test e2e/transfer-inheritance-house-val-building-std-batch.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { fillDateAndVerify } from "./_helpers/tax-flow";

// 상속 취득원인 + 자동평가 모드 + 상속개시일(2003) 진입. 자산 구분 선택 전까지.
async function gotoInheritanceHouse(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

  await expandAssetSection(page, 1);
  await page.getByRole("button", { name: "주택", exact: true }).first().click();

  await expandAssetSection(page, 3);
  await page.getByRole("button", { name: "상속", exact: true }).click();

  // 상속 취득가액 산정 = 자동(보충적평가액) → 자산 구분 RadioCardGroup 노출
  await page.getByRole("button", { name: "자동 (보충적평가액)" }).click();

  // 상속개시일 1983-07-26 (< 1985.1.1 → pre-deemed PreDeemedInputs → 보충적평가 게이트 없이 섹션 활성).
  // (post-deemed(≥1985)은 inheritanceValuationMethod=supplementary 추가 필요.)
  const inhDateScope = page
    .locator("div.space-y-1\\.5")
    .filter({ has: page.getByText("상속개시일", { exact: true }) });
  await fillDateAndVerify(page, { year: "1983", month: "07", day: "26" }, { scope: inhDateScope });
}

const HOUSE_VAL = "개별주택가격 미공시 — 3-시점 기준시가 환산 보조";
const BATCH_BTN = "3시점 건물기준시가 일괄 계산";

test.describe("상속취득 주택 3시점 — 건물기준시가 일괄 계산기 (F2 게이팅)", () => {
  test("T1: 단독주택 → 일괄 계산 버튼 노출", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoInheritanceHouse(page);

    // 자산 구분 = 개별·다세대주택(house_individual)
    await page.getByRole("radio", { name: /개별·다세대주택/ }).click();

    const section = page.locator("div").filter({ hasText: HOUSE_VAL }).first();
    await expect(section).toBeVisible();
    await expect(section.getByRole("button", { name: BATCH_BTN })).toHaveCount(1);
  });

  test("T2: 공동주택 → 일괄 계산 버튼 미노출", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoInheritanceHouse(page);

    // 자산 구분 = 공동주택(house_apart)
    await page.getByRole("radio", { name: /공동주택/ }).click();

    const section = page.locator("div").filter({ hasText: HOUSE_VAL }).first();
    await expect(section).toBeVisible();
    await expect(section.getByRole("button", { name: BATCH_BTN })).toHaveCount(0);
  });
});
