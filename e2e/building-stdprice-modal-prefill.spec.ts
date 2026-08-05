/**
 * E2E: 건물 기준시가 계산 모달 — 자산값 자동입력(prefill)
 *
 * 상위 자산 폼의 건물 연면적·토지면적·취득일·양도일을 "건물 기준시가 계산" 모달을
 * 열 때 자동으로 채운다(모달 이중입력 제거). 연도는 날짜에서 파생(deriveYearFromEventDate).
 *
 * 일반건물(GeneralBuildingBlock) 환산취득가 모드로 4값 전부 검증:
 * - 건물 연면적(gbBuildingArea) → 모달에 **입력 칸이 없다**(2026-08-05 `hideFloorAreaInput`).
 *   ① 기본정보가 연면적의 단일 입력 자리이고 모달은 그 값을 prefill로만 받는다.
 *   값이 비면 안내가 뜨는 계약이므로 **안내 부재 = prefill 도달**로 검증한다.
 *   (칸 자체의 부재·안내 문구는 RTL anchor `area-card-row-layout.anchor.test.tsx` A4)
 * - 토지면적(gbLandArea) → 모달 "부속토지 면적"
 * - 취득일 → 모달 취득연도(YearSelect) 파생 표시
 * - 양도일 → 모달 양도연도(YearSelect) 파생 표시
 *
 * 정책: feedback_browser_verify_with_playwright
 */
import { test, expect } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { fillDateAndVerify } from "./_helpers/tax-flow";

test.describe("건물 기준시가 모달 — 자산값 자동입력(prefill)", () => {
  test("일반건물 환산모드 — 연면적·토지면적·취득/양도 연도가 모달에 자동입력", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    // 양도일 2026-02-16 → 모달 양도연도 2026년 파생
    await fillDateAndVerify(page, { year: "2026", month: "02", day: "16" }, {
      scope: page.getByTestId("transfer-date"),
    });

    // 자산: 일반건물
    await expandAssetSection(page, 1);
    await page.getByRole("button", { name: /일반건물/ }).first().click();

    // 취득 섹션: 환산취득가 모드 + 취득일 입력
    // (연면적은 2026-08-05부터 취득가액 산정 방식과 무관하게 ①에 항상 있다 — 이 클릭은 취득일 흐름용)
    await expandAssetSection(page, 3);
    await page.getByRole("button", { name: /^환산취득가/ }).click();
    // 취득일 DateInput만 감싸는 FieldCard로 scope 한정 — 섹션 전체 scope는 "이월과세" 라디오의
    // "월" substring이 getByLabel("월")에 오매칭됨(e2e/CLAUDE.md §1).
    const acqDateScope = page
      .locator('[data-asset-card-index="0"] [data-asset-section="3"] [data-slot="field-card"]')
      .filter({ hasText: "취득일" });
    await fillDateAndVerify(page, { year: "2010", month: "07", day: "12" }, { scope: acqDateScope });

    // ① 면적·규모: 토지 면적 78.1, 건물 연면적 100 (FieldCard 라벨로 스코프 — placeholder 기본값 중복 회피)
    // 라벨은 taxonomy 원칙 C 표준형 "취득·양도 당시 토지 면적"(2026-07-30) — hint의 "토지면적"에
    // 우연히 매칭되던 종전 셀렉터("토지면적")를 라벨 본문으로 명시화.
    const card = page.locator('[data-asset-card-index="0"]');
    await card
      .locator('[data-slot="field-card"]', { hasText: "취득·양도 당시 토지 면적" })
      .getByRole("textbox")
      .fill("78.1");
    await card
      .locator('[data-slot="field-card"]', { hasText: "건물 연면적" })
      .getByRole("textbox")
      .fill("100");

    // ② 양도시 섹션 "건물 기준시가 계산" 모달 열기
    await page.getByRole("button", { name: "건물 기준시가 계산" }).first().click();
    const modal = page.getByRole("dialog").filter({ hasText: "계산 후 적용할 시점의 금액" });
    await expect(modal).toBeVisible();

    // prefill 자동입력 검증 — 상위 폼 값이 모달 필드에 채워짐
    // 연면적은 입력 칸 자체가 없다(① 기본정보가 단일 입력 자리). 값이 비었을 때만 뜨는
    // 안내가 없다는 것 = 상위 값 100이 모달에 도달했다는 뜻이다.
    await expect(modal.getByPlaceholder("건물 연면적")).toHaveCount(0);
    await expect(modal.getByText(/건물 연면적이 비어 있습니다/)).toHaveCount(0);
    await expect(modal.getByPlaceholder("부속토지 면적")).toHaveValue("78.1");
    // 날짜에서 파생한 연도가 YearSelect trigger에 "YYYY년"으로 표시.
    // exact:true로 연도 select만 매칭(공시지가 연도 "YYYY년 (자동)" 제외).
    await expect(modal.getByText("2010년", { exact: true })).toBeVisible(); // 취득연도(취득일 2010-07-12 파생)
    await expect(modal.getByText("2026년", { exact: true })).toBeVisible(); // 양도연도(양도일 2026-02-16 파생)
  });
});
