/**
 * E2E: 「토지는 다른 원인으로 취득」 매매 호스트 — Phase D1-2 (2026-10-09)
 *
 * 계획서: docs/00-pm/transfer-acq-cause-mixed.plan.md §10 · UI 설계 transfer-acq-cause-mixed-d1.ui.design.md §2·§3
 *
 * - X안: 매매 블록은 원인·피상속인 취득일·고지만 두고, 토지 취득일·평가액은 기존 매매 칸을 쓴다(라벨만 바뀐다).
 *   「취득일 다름」은 강제 ON·잠금, 토지 방식은 실거래가 고정, 개별주택가격 미공시 환산 토글은 사라진다.
 * - T-6: 토지 상속개시일은 1985.1.1. 의제취득일로 덮어쓰지 않는다(덮으면 1990.8.30. 전 차단이 발동하지 않는다).
 * - 호스트 태그: 신축에서 켠 뒤 매매로 바꾸면 매매에서는 꺼져 있다(잔재가 되살아나지 않는다).
 */
import { test, expect, type Page } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { fillDateAndVerify } from "./_helpers/tax-flow";

async function setupHouse(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await expandAssetSection(page, 1);
  await page.getByRole("button", { name: "주택", exact: true }).first().click();
  await expandAssetSection(page, 3);
}
const purchaseBlock = (p: Page) => p.getByTestId("land-part-cause-purchase");
const purchaseToggle = (p: Page) => purchaseBlock(p).getByRole("switch");
const sepDateToggle = (p: Page) =>
  p.locator('[data-variant="chip"]').filter({ hasText: "토지·건물 취득일 다름" }).getByRole("switch");

test.describe("D1-2 — 건물 매매 + 토지 상속·증여 화면", () => {
  test("토글 ON → 취득일 다름 강제·잠금 · 토지 칸 라벨 · 토지 방식 고정 · PHD 토글 없음", async ({ page }) => {
    test.setTimeout(90_000);
    await setupHouse(page);
    await page.getByRole("radio", { name: "매매", exact: true }).click();
    await expect(purchaseToggle(page)).not.toBeChecked();

    await purchaseToggle(page).click();
    await expect(purchaseToggle(page)).toBeChecked();
    await expect(sepDateToggle(page)).toBeChecked();
    await expect(sepDateToggle(page)).toBeDisabled();
    await expect(page.locator('[data-field="landAcquisitionDate"]')).toContainText("토지 상속개시일");
    await expect(page.getByTestId("part-acq-mode-land-fixed")).toContainText("상속개시일 평가액");
    await expect(page.getByTestId("part-acq-mode-land")).toHaveCount(0);
    await expect(page.locator('[data-field="landAcquisitionPrice"]')).toContainText("토지 상속개시일 평가액");
    await expect(page.getByText("취득 당시 개별주택가격 미공시")).toHaveCount(0);
    await expect(purchaseBlock(page).getByTestId("land-statutory-acq-date")).toBeVisible();

    // 증여 — 이월과세 미지원 고지, 피상속인 취득일 칸 없음
    await purchaseBlock(page).getByTestId("land-acq-cause").getByRole("radio", { name: "증여" }).check();
    await expect(purchaseBlock(page).getByTestId("land-gift-carryover-notice")).toBeVisible();
    await expect(purchaseBlock(page).getByTestId("land-statutory-acq-date")).toHaveCount(0);
    await expect(page.locator('[data-field="landAcquisitionDate"]')).toContainText("토지 증여일");
  });

  test("T-6 토지 상속개시일 1984는 1985.1.1.로 바뀌지 않고 ② 입력 카드가 열린다 (D1-4b)", async ({ page }) => {
    test.setTimeout(90_000);
    await setupHouse(page);
    await page.getByRole("radio", { name: "매매", exact: true }).click();
    await purchaseToggle(page).click();

    const landDate = page.getByTestId("acq-date-land");
    await fillDateAndVerify(page, { year: "1984", month: "05", day: "01" }, { scope: landDate });
    await landDate.getByLabel("일").first().blur();
    await expect(landDate.getByLabel("연도").first()).toHaveValue("1984");
    await expect(page.getByText("1985.1.1. 의제 취득일로 취득일 변경했습니다.")).toHaveCount(0);
    await expect(page.getByTestId("land-sec164-card")).toBeVisible();
    await expect(page.getByTestId("land-cause-date-notice")).toHaveCount(0);
  });

  test("호스트 태그: 신축에서 켠 뒤 매매로 바꾸면 매매 토글은 꺼져 있고 토지 방식 라디오가 그대로다", async ({ page }) => {
    test.setTimeout(90_000);
    await setupHouse(page);
    await page.getByRole("radio", { name: "신축(자가건축)" }).click();
    await page.getByTestId("newconstruction-land-acq").getByRole("switch").click();

    await page.getByRole("radio", { name: "매매", exact: true }).click();
    await expect(purchaseToggle(page)).not.toBeChecked();
    await expect(page.getByTestId("part-acq-mode-land-fixed")).toHaveCount(0);
  });

  test("T-3 건물 환산이면 PHD 토글이 뜨지만, 토지 원인을 켜면 사라진다(긍정 짝 포함)", async ({ page }) => {
    test.setTimeout(90_000);
    await setupHouse(page);
    await page.getByRole("radio", { name: "매매", exact: true }).click();
    await sepDateToggle(page).click();
    // 별개 취득(날짜가 달라야 파트 환산이 PHD 노출 조건에 닿는다)
    await fillDateAndVerify(page, { year: "2000", month: "01", day: "01" }, { scope: page.getByTestId("acq-date-building") });
    await fillDateAndVerify(page, { year: "1995", month: "01", day: "01" }, { scope: page.getByTestId("acq-date-land") });
    await page.getByTestId("part-acq-mode-building").getByRole("radio", { name: "환산취득가" }).check();
    const phd = page.getByText("취득 당시 개별주택가격 미공시");
    await expect(phd).toHaveCount(1);
    await purchaseToggle(page).click();
    await expect(phd).toHaveCount(0);
  });

  test("Check F2 매매 ON → 상속 → 매매 후 「취득일 다름」만 켜면 토지 원인 토글은 꺼져 있다", async ({ page }) => {
    test.setTimeout(90_000);
    await setupHouse(page);
    await page.getByRole("radio", { name: "매매", exact: true }).click();
    await purchaseToggle(page).click();
    await expect(purchaseToggle(page)).toBeChecked();
    await page.locator('input[name^="acquisitionCause-"][value="inheritance"]').click();
    await page.getByRole("radio", { name: "매매", exact: true }).click();
    await sepDateToggle(page).click();
    await expect(sepDateToggle(page)).toBeChecked();
    await expect(purchaseToggle(page)).not.toBeChecked();
    await expect(page.getByTestId("part-acq-mode-land-fixed")).toHaveCount(0);
  });
});
