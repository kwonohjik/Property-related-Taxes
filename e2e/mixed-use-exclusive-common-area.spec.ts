/**
 * E2E: 겸용주택 전용/공통면적 안분 + 부수토지 override
 *
 * - 주택/상가 전용면적 + 공통면적 입력 → 공통을 전용비율로 안분해 연면적 자동 파생.
 *   (전용 60/40, 공통 20 → 주택 연면적 72.00㎡ / 상가 48.00㎡)
 * - 상가 부수토지 면적 override(자동 안분값 수정) 노출 검증 (PHD OFF).
 *
 * 설계: docs/02-design/features/mixed-use-exclusive-common-area-apportion.ui.design.md §9
 * 정책: feedback_browser_verify_with_playwright · feedback_e2e_togglecard_setchecked
 */
import { test, expect } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { fillDateAndVerify } from "./_helpers/tax-flow";

test.describe("겸용주택 전용/공통면적 안분 + 부수토지 override", () => {
  test("전용/공통 → 연면적 파생(72/48) + 상가 부수토지 override 노출", async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    await fillDateAndVerify(page, { year: "2025", month: "05", day: "01" }, {
      scope: page.getByTestId("transfer-date"),
    });

    await expandAssetSection(page, 1);
    await page.getByRole("button", { name: "주택", exact: true }).first().click();

    // 겸용주택 분리계산 ON
    await page.getByRole("switch", { name: "겸용주택 분리계산" }).click();

    // 전용/공통면적 입력 → 연면적 파생
    await page.getByPlaceholder("주택 전용면적").fill("60");
    await page.getByPlaceholder("상가(비주택) 전용면적").fill("40");
    await page.getByPlaceholder("공용(공통)면적").fill("20");

    // 파생 연면적 박스 검증 — 공통 20을 6:4 안분 → 주택 72.00 / 상가 48.00
    const derived = page.getByTestId("mixed-derived-floor");
    await expect(derived).toContainText("72.00㎡");
    await expect(derived).toContainText("48.00㎡");

    // 전체 토지 면적 입력
    await page.getByPlaceholder("전체 토지 면적").fill("200");

    // 상가 부수토지 override 칸 노출 (PHD OFF) — 자동 안분값 상가 = 200 × 48/120 = 80.00
    const override = page.getByTestId("mixed-commercial-land-override");
    await expect(override).toBeVisible();
  });
});
