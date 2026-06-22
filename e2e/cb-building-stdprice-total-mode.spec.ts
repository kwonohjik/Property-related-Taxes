/**
 * E2E: 상업용 건물 보충평가 — 건물 기준시가 총액 모드 (2026-06-22)
 *
 * 계획서: docs/00-pm/cb-building-stdprice-total-mode.plan.md
 *
 * 검증: 상업용 건물(real_estate_building) 보충평가에서 상단 건물 입력이
 *       토지식 area-mode(㎡당 단가 + 면적)가 아니라 총액 직접 입력으로 렌더된다.
 *   - 경로 A(일괄고시): 건물 ㎡당 단가 칸 없음 + "건물 기준시가 계산" 모달 부재.
 *   - 경로 B(분리):     상단 건물 ㎡당 단가 칸 없음(=하단 부수토지에만 존재) +
 *                       "건물 기준시가 계산" 모달 존재 + "건물 기준시가" 라벨 존재.
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

const PER_SQM_LABEL = "㎡당 단가 (원/㎡)";
const BUILDING_STD_PRICE_MODAL_BTN = "건물 기준시가 계산";

test.describe("상업용 건물 보충평가 — 건물 기준시가 총액 모드", () => {
  test("경로 A: 건물 단가 칸·모달 부재 / 경로 B: 단가 칸은 부수토지에만·모달 노출", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoStep1WithChild(page);
    await addCommercialBuildingCard(page);

    // 보충적 평가방법 ToggleCard ON
    const supplementaryToggle = page.getByText(
      "보충적 평가방법 (건물: 기준시가)",
      { exact: true },
    );
    await expect(supplementaryToggle).toBeVisible();
    await supplementaryToggle.click();

    // §61 경로 라디오 노출 확인
    const separateRadio = page.locator('[data-testid^="cb-route-separate-"]');
    await expect(separateRadio).toBeVisible();

    // ── 경로 A(기본 일괄고시) ─────────────────────────────────────
    // 건물 상단이 총액 모드 → ㎡당 단가 칸 없음 (부수토지 섹션도 없음)
    await expect(page.getByText(PER_SQM_LABEL, { exact: true })).toHaveCount(0);
    // 경로 A에서는 §99 건물 단독 모달 부재
    await expect(
      page.getByRole("button", { name: BUILDING_STD_PRICE_MODAL_BTN }),
    ).toHaveCount(0);

    // ── 경로 B(분리) 선택 ─────────────────────────────────────────
    await separateRadio.click();

    // 부수토지 섹션 등장(회귀 확인)
    await expect(
      page.getByText("부수토지 개별공시지가 (§61①1호)", { exact: true }),
    ).toBeVisible();

    // 건물 기준시가 라벨 노출
    await expect(
      page.getByText("건물 기준시가", { exact: true }).first(),
    ).toBeVisible();

    // ㎡당 단가 칸은 정확히 1개 — 하단 부수토지(토지 area-mode)에만.
    // 상단 건물은 총액 모드라 단가 칸 없음.
    await expect(page.getByText(PER_SQM_LABEL, { exact: true })).toHaveCount(1);

    // 경로 B에서는 건물 기준시가 계산 모달 노출
    await expect(
      page.getByRole("button", { name: BUILDING_STD_PRICE_MODAL_BTN }),
    ).toBeVisible();
  });
});
