/**
 * E2E: 겸용주택 전용/공통면적 안분 + 부수토지 override
 *
 * - 주택/상가 전용면적 + 공통면적 입력 → 공통을 전용비율로 안분해 연면적 자동 파생.
 *   (전용 60/40, 공통 20 → 주택 연면적 72 / 상가 48)
 * - 부수토지 안분값이 섹션 ① 편집칸에 표시 (PHD OFF).
 *
 * ⚠️ 파생 6칸이 표시 텍스트 → `DecimalInput` 편집칸으로 바뀌었다(면적 단일 소스화).
 *    `toContainText("72.00㎡")`가 아니라 `toHaveValue("72")` — `DecimalInput`은
 *    `thousandSeparator` 기본 false라 **store 원문**을 그대로 표시하고(`String(72)`="72"),
 *    `㎡`는 값이 아닌 별도 `unit` span이다.
 *
 * 설계: docs/02-design/features/mixed-use-area-single-source-editable.ui.design.md §4
 * 정책: feedback_browser_verify_with_playwright · feedback_e2e_togglecard_setchecked
 */
import { test, expect } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { fillDateAndVerify } from "./_helpers/tax-flow";

test.describe("겸용주택 전용/공통면적 안분 + 부수토지 override", () => {
  test("전용/공통 → 연면적 파생(72/48) + 부수토지 안분 표시·수정", async ({ page }) => {
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

    // 파생 연면적 검증 — 공통 20을 6:4 안분 → 주택 72 / 상가 48
    await expect(page.getByTestId("mixed-area-residential-floor")).toHaveValue("72");
    await expect(page.getByTestId("mixed-area-commercial-floor")).toHaveValue("48");

    // 전체 토지 면적 입력
    await page.getByPlaceholder("전체 토지 면적").fill("200");

    // 부수토지 자동 안분 표시 (PHD OFF) — 주택 = 200 × 72/120 = 120, 상가 = 잔액 80
    const residentialLand = page.getByTestId("mixed-area-residential-land");
    const commercialLand = page.getByTestId("mixed-area-commercial-land");
    await expect(residentialLand).toHaveValue("120");
    await expect(commercialLand).toHaveValue("80");

    // 주택 부수토지 수정 → 상가가 잔액을 흡수 (합 = 전체 토지 불변식)
    await residentialLand.fill("90.29");
    await expect(commercialLand).toHaveValue("109.71");

    // 부수토지 두 칸 모두 수정 + 합 불일치 → 경고 노출 (V2)
    await commercialLand.fill("78.01");
    await expect(page.getByTestId("mixed-area-land-sum-warning")).toContainText("168.30");

    // 상가 부수토지를 비우면 다시 잔액 흡수 → 경고 소멸
    await commercialLand.fill("");
    await expect(page.getByTestId("mixed-area-land-sum-warning")).toHaveCount(0);
    await expect(commercialLand).toHaveValue("109.71");
  });
});
