/**
 * E2E: 겸용주택 자산-우선 재편 — 상가건물 통합 모달 (onApplyBoth)
 *
 * 용도변경 없는 겸용주택(hasPartialUsageChange=false)은 자산-우선(주택/상가) 레이아웃.
 * 상가 섹션의 "건물 기준시가 계산" 모달에서 취득·양도를 한 번에 계산 →
 * "취득·양도 모두 적용" 단일 버튼 → 두 상가건물 필드 동시 입력(오적용 footgun 제거).
 *
 * ⚠️ 연도(취득/양도)는 자산 날짜에서 파생돼 **자동 입력**된다(#560 prefill) → "연도 선택"
 *    placeholder는 렌더되지 않는다. 이를 클릭하려던 구버전 스펙은 타임아웃했다(spec rot).
 *    선택 대신 **prefill 결과를 단언**해 회귀 가드로 쓴다.
 *
 * 계획: docs/02-design/features/mixed-use-asset-major-stdprice-layout.plan.md
 *       docs/02-design/features/building-stdprice-e2e-spec-rot.plan.md (rot 수정)
 * 정책: feedback_browser_verify_with_playwright · feedback_e2e_togglecard_setchecked
 */
import { test, expect, type Page, type Locator } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { fillDateAndVerify } from "./_helpers/tax-flow";

async function fillDateExact(
  scope: Locator,
  { year, month, day }: { year: string; month: string; day: string },
) {
  await scope.getByLabel("연도", { exact: true }).first().fill(year);
  await scope.getByLabel("월", { exact: true }).first().fill(month);
  await scope.getByLabel("일", { exact: true }).first().fill(day);
}

// 모달 내부 Select 트리거 클릭 → 포털 옵션 선택
async function selectInModal(page: Page, modal: Locator, triggerText: string, optionName: RegExp) {
  await modal.getByText(triggerText, { exact: false }).first().click();
  await page.getByRole("option", { name: optionName }).first().click();
}

test.describe("겸용주택 자산-우선 — 상가건물 통합 모달", () => {
  test("용도변경 없음 → 주택/상가 섹션 + 상가건물 취득·양도 모두 적용", async ({ page }) => {
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

    await expandAssetSection(page, 3);
    await page.getByRole("button", { name: "매매", exact: true }).click();
    await page.getByRole("radio", { name: "환산취득가" }).click();
    // ⚠️ `acq-date-building` 스코프 필수 — 겸용주택은 분리 모드가 강제 ON이라 취득일이
    //    `[토지 | 건물]` 2열이고, 섹션 스코프 + `.first()`는 앞 칸인 **토지** 취득일을 잡는다.
    //    그러면 `acquisitionDate`가 비어 모달의 취득 연도("2010년") 파생이 실패한다
    //    (계획서 e2e-preexisting-failures-4.plan.md §9-N2).
    await fillDateExact(page.getByTestId("acq-date-building"), {
      year: "2010",
      month: "06",
      day: "15",
    });

    // 면적 (① 면적 섹션 — 부모 MixedUseExpandedPanel 렌더)
    await page.getByPlaceholder("주택 전용면적").fill("120");
    await page.getByPlaceholder("상가(비주택) 전용면적").fill("80");
    await page.getByPlaceholder("건축물대장의 건축면적").fill("100");

    // PHD(개별주택가격 미공시)는 켜지 않음 → 자산-우선 레이아웃

    // ── 자산-우선 레이아웃 구조 검증 (주택/상가 섹션) ──
    await expect(page.getByText("주택 기준시가", { exact: true })).toBeVisible();
    await expect(page.getByText("상가 기준시가", { exact: true })).toBeVisible();

    // ── 상가 섹션 통합 모달 열기 ──
    await page.getByRole("button", { name: "건물 기준시가 계산" }).click();
    const modal = page.getByRole("dialog").filter({ hasText: "계산 후 적용할 시점의 금액" });
    await expect(modal).toBeVisible();

    await modal.getByPlaceholder("신축연도 (4자리)").fill("2010");

    // ── prefill 회귀 가드 (#560) — 겸용 상가 호출부(MixedUseAssetMajorStdPrice.tsx prefill) ──
    // 연면적·연도는 자산 값에서 자동 입력되므로 스펙이 다시 채우지 않는다.
    // ⚠️ exact:true 필수 — 공시지가 연도의 "YYYY년 (자동)"과 구분.
    await expect(modal.getByPlaceholder("건물 연면적")).toHaveValue("80"); // 상가 연면적(전용 80 + 공통 0)
    await expect(modal.getByText("2010년", { exact: true })).toBeVisible(); // 취득일 2010-06-15 파생
    await expect(modal.getByText("2025년", { exact: true })).toBeVisible(); // 양도일 2025-05-01 파생

    // 취득 시점 — 구조·용도는 prefill 대상이 아니라 선택 필요(첫 "구조 선택" = 취득)
    await selectInModal(page, modal, "구조 선택", /철근콘크리트조/);
    await selectInModal(page, modal, "용도 선택", /아파트/);
    await modal.getByPlaceholder("원/㎡").first().fill("3000000");

    // 양도 시점 — 취득분 선택 후 트리거에 선택값이 표시되므로 남은 "구조/용도 선택" = 양도
    await selectInModal(page, modal, "구조 선택", /철근콘크리트조/);
    await selectInModal(page, modal, "용도 선택", /아파트/);
    // 취득연도 2010 > 2000 → 취득·양도 모두 "원/㎡" 2칸(BuildingStdPriceForm.tsx:436 분기)
    await modal.getByPlaceholder("원/㎡").nth(1).fill("6216000");

    await modal.getByRole("button", { name: "기준시가 계산하기" }).click();

    // ── onApplyBoth: 통합 버튼만 노출, 개별 취득/양도 버튼 없음 (footgun 제거) ──
    const applyBoth = modal.getByRole("button", { name: /취득·양도 모두 적용/ });
    await expect(applyBoth).toBeVisible();
    await expect(modal.getByRole("button", { name: /^취득시 적용/ })).toHaveCount(0);
    await expect(modal.getByRole("button", { name: /^양도시 적용/ })).toHaveCount(0);

    await applyBoth.click();
    await expect(modal).toBeHidden();

    // ── 두 상가건물 필드가 한 번의 적용으로 동시 입력됨 ──
    await expect(page.getByPlaceholder("양도시 상가건물 기준시가")).toHaveValue(/[0-9]/);
    await expect(page.getByPlaceholder("취득시 상가건물 기준시가 (필수)")).toHaveValue(/[0-9]/);
  });
});
