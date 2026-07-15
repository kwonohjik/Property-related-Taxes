/**
 * E2E: 건물 기준시가 계산 모달 — applyTimePoint 오적용 방지
 *
 * 일반건물(GeneralBuildingBlock)·상가건물은 취득시/양도시 기준시가가 별도 섹션에 있고
 * 각 섹션에 계산 모달이 있다. applyTimePoint 지정으로 각 모달은 **자기 시점 적용 버튼만**
 * 노출한다 — 양도시 섹션 모달에서 "취득시 적용"을 눌러 양도 필드를 덮어쓰는 오적용(footgun) 제거.
 *
 * 양도시 섹션(항상 표시)의 모달로 검증. 취득시 섹션 모달(applyTimePoint="acquisition")은
 * 동일 코드 경로(대칭)이며 취득 모드 전환이 필요해 본 스펙 범위 밖.
 *
 * 정책: feedback_browser_verify_with_playwright
 */
import { test, expect, type Page, type Locator } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { fillDateAndVerify } from "./_helpers/tax-flow";

async function selectInModal(page: Page, modal: Locator, triggerText: string, optionName: RegExp) {
  await modal.getByText(triggerText, { exact: false }).first().click();
  await page.getByRole("option", { name: optionName }).first().click();
}

/**
 * 취득·양도 2시점 모두 입력해 두 시점 결과가 모두 산출되게 함(→ applyTimePoint 게이팅 검증 가능).
 *
 * ⚠️ **양도연도는 선택하지 않는다** — 양도일(2025-05-01)에서 파생돼 이미 채워져 있다(#560 prefill)
 *    → "연도 선택" placeholder가 렌더되지 않는다. 반면 이 스펙은 취득일을 입력하지 않으므로
 *    **취득연도만** 미채움 상태라 선택이 필요하다(probe 실측: "연도 선택" 1개 · "2025년" 1개).
 */
async function computeBothTimePoints(page: Page, modal: Locator) {
  await modal.getByPlaceholder("신축연도 (4자리)").fill("2010");
  await modal.getByPlaceholder("건물 연면적").fill("100");

  // 취득 시점 — 취득일 미입력이라 연도 prefill 없음 → 유일한 "연도 선택" = 취득연도
  await selectInModal(page, modal, "연도 선택", /2010년/);
  await selectInModal(page, modal, "구조 선택", /철근콘크리트조/);
  await selectInModal(page, modal, "용도 선택", /아파트/);
  await modal.getByPlaceholder("원/㎡").first().fill("3000000");

  // 양도 시점 — 연도는 prefill 완료(회귀 가드), 구조·용도만 선택
  await expect(modal.getByText("2025년", { exact: true })).toBeVisible();
  await selectInModal(page, modal, "구조 선택", /철근콘크리트조/);
  await selectInModal(page, modal, "용도 선택", /아파트/);
  await modal.getByPlaceholder("원/㎡").nth(1).fill("6216000");

  await modal.getByRole("button", { name: "기준시가 계산하기" }).click();
}

test.describe("건물 기준시가 모달 — applyTimePoint 오적용 방지", () => {
  test("일반건물 양도시 섹션 모달 — 양도시 적용만 노출(취득시 적용 없음)", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    await fillDateAndVerify(page, { year: "2025", month: "05", day: "01" }, {
      scope: page.getByTestId("transfer-date"),
    });

    await expandAssetSection(page, 1);
    await page.getByRole("button", { name: /일반건물/ }).first().click();
    await expandAssetSection(page, 3);

    // ② 양도시 기준시가 섹션의 건물 기준시가 계산 모달 (항상 표시)
    await page.getByRole("button", { name: "건물 기준시가 계산" }).first().click();
    const modal = page.getByRole("dialog").filter({ hasText: "계산 후 적용할 시점의 금액" });
    await expect(modal).toBeVisible();

    // 취득·양도 두 시점 모두 산출 → applyTimePoint="transfer"가 취득시 적용을 숨김을 검증
    await computeBothTimePoints(page, modal);
    await expect(modal.getByRole("button", { name: /양도시 적용/ })).toBeVisible();
    await expect(modal.getByRole("button", { name: /취득시 적용/ })).toHaveCount(0);
    await expect(modal.getByRole("button", { name: /모두 적용/ })).toHaveCount(0);

    // 적용 → 양도시 건물기준시가 필드 채워짐
    await modal.getByRole("button", { name: /양도시 적용/ }).click();
    await expect(modal).toBeHidden();
  });
});
