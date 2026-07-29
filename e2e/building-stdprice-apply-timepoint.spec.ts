/**
 * E2E: 건물 기준시가 계산 모달 — applyTimePoint 오적용 방지
 *
 * 일반건물(GeneralBuildingBlock)·상가건물은 취득시/양도시 기준시가가 별도 섹션에 있고
 * 각 섹션에 계산 모달이 있다. applyTimePoint 지정으로 각 모달은 **자기 시점 적용 버튼만**
 * 노출한다 — 양도시 섹션 모달에서 "취득시 적용"을 눌러 양도 필드를 덮어쓰는 오적용(footgun) 제거.
 *
 * 2026-07-29 갱신: applyTimePoint가 폼까지 **단일 시점 모드**로 좁히므로 반대 시점 입력이
 * 애초에 렌더되지 않는다(계획서 building-std-modal-single-timepoint.plan.md). 종전의 "2시점을
 * 모두 입력해 두 결과를 만든 뒤 버튼 노출을 본다"는 시나리오는 성립하지 않아 단일 시점 입력으로
 * 교체했다 — 스펙의 취지(반대 시점 버튼 미노출)는 그대로 검증한다.
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
 * 양도 시점만 입력해 결과를 산출한다.
 *
 * ⚠️ **양도연도는 선택하지 않는다** — 양도일(2025-05-01)에서 파생돼 이미 채워져 있다(#560 prefill).
 * 취득 구조·용도·공시지가는 `applyTimePoint="transfer"`의 단일 시점 모드에서 **렌더되지 않으므로**
 * 입력하지 않는다(취득연도 칸만 §164⑧ 판정용으로 남는다 — 선택하지 않으면 동일연도가 아니다).
 * 그 결과 "구조 선택"·"용도 선택"·"원/㎡"는 각각 양도 시점 1개뿐이다.
 */
async function computeTransferOnly(page: Page, modal: Locator) {
  await modal.getByPlaceholder("신축연도 (4자리)").fill("2010");
  await modal.getByPlaceholder("건물 연면적").fill("100");

  // 양도 시점 — 연도는 prefill 완료(회귀 가드), 구조·용도·공시지가만 입력
  await expect(modal.getByText("2025년", { exact: true })).toBeVisible();
  await selectInModal(page, modal, "구조 선택", /철근콘크리트조/);
  await selectInModal(page, modal, "용도 선택", /아파트/);
  await modal.getByPlaceholder("원/㎡").fill("6216000");

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

    // 단일 시점 모드 — 취득 시점 입력이 노출되지 않는다(§164⑧ 판정용 취득연도 칸만 남음)
    await expect(modal.getByTestId("bsp-transfer-only-note")).toBeVisible();
    await expect(modal.getByText("취득당시 구조")).toHaveCount(0);
    await expect(modal.getByText("취득당시 ㎡당 개별공시지가")).toHaveCount(0);

    // 양도 시점만 산출 → applyTimePoint="transfer"가 취득시 적용을 숨김을 검증
    await computeTransferOnly(page, modal);
    await expect(modal.getByRole("button", { name: /양도시 적용/ })).toBeVisible();
    await expect(modal.getByRole("button", { name: /취득시 적용/ })).toHaveCount(0);
    await expect(modal.getByRole("button", { name: /모두 적용/ })).toHaveCount(0);

    // 적용 → 양도시 건물기준시가 필드 채워짐
    await modal.getByRole("button", { name: /양도시 적용/ }).click();
    await expect(modal).toBeHidden();
  });
});
