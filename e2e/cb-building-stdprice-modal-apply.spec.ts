/**
 * E2E: 건물 기준시가 계산 모달 — 복합구조 적용 + 부수토지 자동 전달 (2026-06-22)
 *
 * 계획서: docs/00-pm/cb-building-stdprice-modal-apply.plan.md
 *
 * 검증(상속·증여 경로 B):
 *   1. 복합구조로 계산 시 "이 금액 적용" 버튼이 노출된다(이전엔 valuation만 있어 누락 → 적용 불가 버그).
 *   2. 모달 적용 시 건물 기준시가(compositeTotal)가 상단에, 부수토지 평가액(§61①1호 = 토지면적×공시지가)이
 *      하단 부수토지 필드에 자동으로 함께 채워진다(중복 입력 제거).
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 */
import { test, expect, type Page, type Locator } from "@playwright/test";
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

// 모달 내부 Select 트리거 클릭 → 포털 옵션 선택
async function selectInModal(page: Page, modal: Locator, triggerText: string, optionName: RegExp) {
  await modal.getByText(triggerText, { exact: false }).first().click();
  await page.getByRole("option", { name: optionName }).first().click();
}

test.describe("건물 기준시가 모달 — 복합구조 적용 + 부수토지 자동 전달", () => {
  test("경로 B에서 복합구조 계산 → 적용 → 건물+부수토지(330,000,000) 자동 채움", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await gotoStep1WithChild(page);
    await addCommercialBuildingCard(page);

    // 보충평가 ON → 경로 B 선택(모달 버튼은 경로 B에서만 노출)
    await page.getByText("보충적 평가방법 (건물: 기준시가)", { exact: true }).click();
    await page.locator('[data-testid^="cb-route-separate-"]').click();

    // 모달 열기
    await page.getByRole("button", { name: "건물 기준시가 계산" }).click();
    const modal = page.getByRole("dialog").filter({ hasText: "계산 후 적용할 시점의 금액" });
    await expect(modal).toBeVisible();

    // 신축연도 + 상속·증여일(평가연도 도출 → 구조·용도 활성)
    await modal.getByPlaceholder("신축연도 (4자리)").fill("2000");
    await modal.getByLabel("연도", { exact: true }).fill("2026");
    await modal.getByLabel("월", { exact: true }).fill("6");
    await modal.getByLabel("일", { exact: true }).fill("15");

    // 복합구조 ON → 부분 1(RC / 근생#41 / 180㎡)
    await modal.getByText("복합구조 (층·구역별 구조·용도 상이)").click();
    await selectInModal(page, modal, "구조 선택", /철근콘크리트조/);
    await selectInModal(page, modal, "용도 선택", /^41\./);
    await modal.getByPlaceholder("부분 면적").first().fill("180");

    // 부속토지 면적 300 + ㎡당 공시지가 1,100,000 → 부수토지 330,000,000
    await modal.getByPlaceholder("부속토지 면적").fill("300");
    await modal.getByPlaceholder("원/㎡").first().fill("1100000");

    await modal.getByRole("button", { name: "기준시가 계산하기" }).click();

    // [버그 회귀] 복합구조에서도 "이 금액 적용" 버튼 노출
    const applyBtn = modal.getByRole("button", { name: /이 금액 적용/ });
    await expect(applyBtn).toBeVisible();

    // 건물 기준시가(compositeTotal) 라벨 캡처 → 적용 후 상단에 반영 확인
    const label = await applyBtn.innerText();
    const building = label.match(/\(([\d,]+)\)/)?.[1];
    expect(building).toBeTruthy();

    await applyBtn.click();
    await expect(modal).toBeHidden();

    // 부수토지(§61①1호) 자동 전달 = 300 × 1,100,000 = 330,000,000 (CurrencyInput value)
    const landSection = page
      .getByText("부수토지 개별공시지가 (§61①1호)", { exact: true })
      .locator("xpath=..");
    await expect(landSection.getByPlaceholder("금액 입력")).toHaveValue("330,000,000");
    // 건물 기준시가(compositeTotal)도 상단 총액 필드에 반영.
    // CurrencyInput은 label에 htmlFor 연결이 없어 getByLabel 불가 → 라벨(exact) → 형제 input.
    const buildingTotal = page
      .getByText("건물 기준시가", { exact: true })
      .locator("xpath=following-sibling::div//input");
    await expect(buildingTotal).toHaveValue(building!);
  });
});
