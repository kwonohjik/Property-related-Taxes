/**
 * E2E: 「토지는 다른 원인으로 취득」 신축 경로 정비 — Phase D1-1 (2026-10-09)
 *
 * 계획서: docs/00-pm/transfer-acq-cause-mixed.plan.md §10 (U-2·U-3, T-6 제외 — 매매 호스트는 D1-2)
 *
 * - G-11: 신축 분기 ⑧이 분리 검증 전체에 닿으면서 「자산 전체 자본적지출」은 파트 칸으로 안내된다 —
 *   신축 블록에 그 칸(이동 앵커 포함)이 있어야 막다른 오류가 아니다. G-13: 토지 취득일·평가액 칸 앵커.
 * - Q-7·Q-4: 1990.8.30. 전 상속개시일·건물과 같은 날이면 입력 중 안내가 뜬다(차단은 ⑧·⑫).
 * - Q-5(U-3): 「토지·건물 소유자 다름」과 「토지는 다른 원인으로 취득」은 서로 잠긴다(엔진은 소유자 분리에서
 *   토지 원인을 읽지 않는다). 켜진 쪽은 언제든 끌 수 있다.
 */
import { test, expect, type Page } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { fillDateAndVerify } from "./_helpers/tax-flow";

async function setupNewConstruction(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await expandAssetSection(page, 1);
  await page.getByRole("button", { name: "주택", exact: true }).first().click();
  await expandAssetSection(page, 3);
  await page.getByRole("radio", { name: "신축(자가건축)" }).click();
}
const landAcqToggle = (p: Page) => p.getByTestId("newconstruction-land-acq").getByRole("switch");
const ownerToggle = (p: Page) => p.getByTestId("asset-ownership-split").getByRole("switch");

test.describe("D1-1 — 신축 + 토지 상속·증여 화면", () => {
  test("G-11·G-13 파트 자본적지출 칸과 토지 칸 이동 앵커가 있다", async ({ page }) => {
    test.setTimeout(90_000);
    await setupNewConstruction(page);
    await landAcqToggle(page).click();

    const block = page.getByTestId("newconstruction-land-acq");
    await expect(block.getByTestId("split-part-land-capex")).toBeVisible();
    await expect(block.getByTestId("split-part-building-capex")).toBeVisible();
    for (const f of ["landDirectExpenses", "buildingDirectExpenses", "landAcquisitionDate", "landAcquisitionPrice"]) {
      await expect(block.locator(`[data-field="${f}"]`)).toHaveCount(1);
    }
    await expect(page.locator('[data-field="landAcquisitionCause"]')).toHaveCount(1);
  });

  test("Q-7 1990.8.30. 전 상속개시일이면 안내가 뜨고, 그 뒤 날짜로 고치면 사라진다", async ({ page }) => {
    test.setTimeout(90_000);
    await setupNewConstruction(page);
    await landAcqToggle(page).click();

    const notice = page.getByTestId("land-cause-date-notice");
    const dateCard = page.getByTestId("acq-date-land");
    await fillDateAndVerify(page, { year: "1984", month: "05", day: "01" }, { scope: dateCard });
    await expect(notice).toContainText("1990.8.30.");
    await fillDateAndVerify(page, { year: "2015", month: "03", day: "10" }, { scope: dateCard });
    await expect(notice).toHaveCount(0);
  });

  test("Q-5 소유자 분리 토글과 토지 원인 토글은 서로 잠긴다 — 켜진 쪽을 끄면 풀린다", async ({ page }) => {
    test.setTimeout(90_000);
    await setupNewConstruction(page);

    await landAcqToggle(page).click();
    await expect(landAcqToggle(page)).toBeChecked();
    await expect(ownerToggle(page)).toBeDisabled();

    await landAcqToggle(page).click();
    await expect(ownerToggle(page)).toBeEnabled();
    await ownerToggle(page).click();
    await expect(ownerToggle(page)).toBeChecked();
    await expect(landAcqToggle(page)).toBeDisabled();

    await ownerToggle(page).click();
    await expect(landAcqToggle(page)).toBeEnabled();
  });

  test("F2 신축 + 소유자 분리(건물만 소유)에는 건물 자본적지출 칸만 있다 — ⑧이 그 칸으로 안내한다", async ({ page }) => {
    test.setTimeout(90_000);
    await setupNewConstruction(page);
    await ownerToggle(page).click();
    const block = page.getByTestId("non-purchase-split-inputs");
    await expect(block.locator('[data-field="buildingDirectExpenses"]')).toHaveCount(1);
    await expect(block.locator('[data-field="landDirectExpenses"]')).toHaveCount(0);
  });
});
