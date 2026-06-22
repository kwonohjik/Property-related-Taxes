/**
 * E2E: 상업용 건물 부수토지 보충평가 §61 경로 UI (2026-06-22)
 *
 * 계획서: docs/00-pm/gift-commercial-building-appurtenant-land.plan.md (v2)
 * 설계: docs/02-design/features/gift-commercial-building-appurtenant-land.{engine,ui}.design.md
 *
 * 검증: 상업용 건물(real_estate_building) 보충평가 토글 내 §61 경로 RadioCardGroup
 *       (일괄고시 §61①3호 / 건물+부수토지 분리 §61①2호·1호)이 노출되고,
 *       경로 B 선택 시 부수토지 개별공시지가 StandardPriceInput이 나타난다.
 *       (엔진 합산 산식 7억은 단위 anchor appurtenant-land-61.test.ts가 커버)
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 * 공유 컴포넌트(EstateBodySupplementaryValuation)는 상속·증여 동일 — 상속 플로우로 검증.
 */

import { test, expect, type Page } from "@playwright/test";
import { addHeir, closeHeirEditModal } from "./_helpers/tax-flow";

async function gotoStep1WithChild(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2026");
  await page.getByLabel("월").first().fill("6");
  await page.getByLabel("일").first().fill("15");
  await addHeir(page, "heir", "child");
  await closeHeirEditModal(page);
  await page.getByRole("button", { name: /^다음/ }).click();
}

async function addCommercialBuildingCard(page: Page) {
  await page.getByRole("button", { name: /재산 추가|상속재산 추가/ }).first().click();
  await page.getByRole("button", { name: /상업용 건물/ }).first().click();
  await expect(page.getByTestId("estate-edit-dialog")).toBeVisible();
}

test.describe("상업용 건물 부수토지 §61 경로", () => {
  test("보충평가 ON → §61 경로 라디오 노출 → 경로 B 선택 시 부수토지 입력 등장", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoStep1WithChild(page);
    await addCommercialBuildingCard(page);

    // 보충적 평가방법 ToggleCard ON (건물: 기준시가)
    const supplementaryToggle = page.getByText(
      "보충적 평가방법 (건물: 기준시가)",
      { exact: true },
    );
    await expect(supplementaryToggle).toBeVisible();
    await supplementaryToggle.click();

    // §61 경로 라디오 2개 노출 (testId)
    const lumpRadio = page.locator('[data-testid^="cb-route-lump-"]');
    const separateRadio = page.locator('[data-testid^="cb-route-separate-"]');
    await expect(lumpRadio).toBeVisible();
    await expect(separateRadio).toBeVisible();

    // 기본값 = 경로 A(일괄고시): 부수토지 섹션 미노출
    await expect(
      page.getByText("부수토지 개별공시지가 (§61①1호)", { exact: true }),
    ).toHaveCount(0);

    // 경로 B(분리) 선택 → 부수토지 개별공시지가 StandardPriceInput 등장
    await separateRadio.click();
    await expect(
      page.getByText("부수토지 개별공시지가 (§61①1호)", { exact: true }),
    ).toBeVisible();

    // 건물 기준시가 라벨도 분리 모드에서 노출
    await expect(page.getByText("건물 기준시가", { exact: true }).first()).toBeVisible();
  });
});
