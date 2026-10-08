/**
 * E2E: 「토지는 다른 원인으로 취득」(건물 신축 + 토지 상속·증여) — Phase D0 화면 정합 (2026-10-08)
 *
 * 계획서: docs/00-pm/transfer-acq-cause-mixed.plan.md §2.3 G-6·G-8
 *
 * - G-8: 단순 증여에는 「증여자 취득일」 칸을 두지 않는다 — §104②2호 통산은 §97의2① 이월과세 자산만이고
 *   엔진도 통산하지 않아 입력해도 반영되지 않았다. 상속의 「피상속인 취득일」은 필수(검증 이동 앵커 `data-field`).
 * - G-6: 신축에서 토글을 켠 뒤 다른 원인을 거쳐 신축으로 돌아오면 종전엔 토글이 「켜짐」으로 보였지만
 *   분리 플래그는 꺼져 있어 토지 파트가 계산에서 빠졌다(화면 ≠ 계산). 돌아오면 꺼져 있어야 한다 — 토글 상태는
 *   ④가 보내는 유효 원인(`effectiveLandAcquisitionCause`)에서 파생한다.
 */
import { test, expect, type Page } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

async function setupNewConstruction(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await expandAssetSection(page, 1);
  await page.getByRole("button", { name: "주택", exact: true }).first().click();
  await expandAssetSection(page, 3);
  await page.getByRole("radio", { name: "신축(자가건축)" }).click();
}
const landAcqToggle = (p: Page) => p.getByTestId("newconstruction-land-acq").getByRole("switch");

test.describe("D0 — 신축 + 토지 상속·증여 화면", () => {
  test("G-8 상속은 피상속인 취득일(이동 앵커 포함), 증여는 증여자 취득일 칸이 없다", async ({ page }) => {
    test.setTimeout(90_000);
    await setupNewConstruction(page);
    await landAcqToggle(page).click();

    const statutory = page.getByTestId("land-statutory-acq-date");
    await expect(statutory).toBeVisible();
    await expect(page.getByText("피상속인 취득일", { exact: true })).toBeVisible();
    await expect(page.locator('[data-field="landDecedentAcquisitionDate"]')).toHaveCount(1);

    await expect(page.getByTestId("land-gift-carryover-notice")).toHaveCount(0);
    await page.getByTestId("land-acq-cause").getByRole("radio", { name: "증여" }).check();
    await expect(statutory).toHaveCount(0);
    await expect(page.getByText("증여자 취득일")).toHaveCount(0);
    // R-1 — 이월과세(§97의2①) 미지원 고지
    await expect(page.getByTestId("land-gift-carryover-notice")).toBeVisible();
  });

  test("G-6 신축 → 매매 → 신축으로 돌아오면 토글이 꺼져 있다(남은 토지 원인 정리)", async ({ page }) => {
    test.setTimeout(90_000);
    await setupNewConstruction(page);
    await landAcqToggle(page).click();
    await expect(landAcqToggle(page)).toBeChecked();

    await page.getByRole("radio", { name: "매매", exact: true }).click();
    await expect(page.getByTestId("newconstruction-land-acq")).toHaveCount(0);

    await page.getByRole("radio", { name: "신축(자가건축)" }).click();
    await expect(landAcqToggle(page)).not.toBeChecked();
    await expect(page.getByTestId("land-acq-cause")).toHaveCount(0);
  });

  test("G-6 신축 → 상속 → 신축도 같다", async ({ page }) => {
    test.setTimeout(90_000);
    await setupNewConstruction(page);
    await landAcqToggle(page).click();
    // 「상속」 라디오가 토지 취득원인 그룹에도 있어 자산 취득원인 그룹(name=acquisitionCause-…)으로 좁힌다
    await page.locator('input[name^="acquisitionCause-"][value="inheritance"]').click();
    await page.getByRole("radio", { name: "신축(자가건축)" }).click();
    await expect(landAcqToggle(page)).not.toBeChecked();
  });
});
