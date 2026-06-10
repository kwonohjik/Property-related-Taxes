/**
 * E2E: 상속재산 단계 그룹별 접기/펼치기
 *
 * 시나리오:
 *   1. 상속세 진입 + 자녀 추가 → 상속재산 단계 이동
 *   2. 3그룹(상속재산·주식/지분·추정상속재산) 기본 펼침 — 본문 보임
 *   3. 상속재산 그룹 접기 → 본문 hidden + 요약 배지(N건) 표시
 *   4. 다시 펼치기 → 본문 복귀, 요약 배지 숨김
 *   5. 항목 입력 후 접으면 합계가 요약에 반영
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 */

import { test, expect, type Page } from "@playwright/test";
import { addHeir, closeHeirEditModal } from "./_helpers/tax-flow";

async function gotoEstateStep(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2026");
  await page.getByLabel("월").first().fill("5");
  await page.getByLabel("일").first().fill("15");
  await addHeir(page, "heir", "child");
  await closeHeirEditModal(page);
  await page.getByRole("button", { name: /^다음/ }).click();
}

test.describe("상속재산 단계 그룹 접기/펼치기", () => {
  test("기본 펼침 → 접기 시 본문 hidden + 요약, 펼치기 복귀", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoEstateStep(page);

    const estateToggle = page.getByTestId("estate-group-toggle-estate");
    await expect(estateToggle).toBeVisible();

    // 기본 펼침 — "상속재산 추가" 버튼 보임 + 요약 배지 없음
    const addEstateBtn = page.getByRole("button", { name: /상속재산 추가/ });
    await expect(addEstateBtn).toBeVisible();
    await expect(page.getByTestId("estate-group-summary-estate")).toHaveCount(0);

    // 접기 → 본문 hidden + 요약 배지(0건) 표시
    await estateToggle.click();
    await expect(addEstateBtn).toBeHidden();
    const summary = page.getByTestId("estate-group-summary-estate");
    await expect(summary).toBeVisible();
    await expect(summary).toContainText("0건");

    // 다시 펼치기 → 본문 복귀, 요약 숨김
    await estateToggle.click();
    await expect(addEstateBtn).toBeVisible();
    await expect(page.getByTestId("estate-group-summary-estate")).toHaveCount(0);
  });

  test("각 그룹 제목 앞 섹션 번호 배지(1·2·3) 표시 — 피상속인 Step과 동일 형식", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoEstateStep(page);

    // 제목 앞 원형 번호 배지 1·2·3 (피상속인 Step §①②③과 동형)
    await expect(page.getByTestId("estate-group-badge-estate")).toHaveText("1");
    await expect(page.getByTestId("estate-group-badge-stock")).toHaveText("2");
    await expect(page.getByTestId("estate-group-badge-presumed")).toHaveText("3");

    // 펼치기/접기 버튼은 결과 탭 형식("▼ 펼치기"/"▲ 접기")
    await expect(page.getByTestId("estate-group-toggle-estate")).toContainText("접기");
  });

  test("추가 버튼이 섹션 헤더 우측으로 이동 (상속재산·주식)", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoEstateStep(page);

    // 헤더 우측 "+ 추가" 버튼 노출 (하단 dashed 버튼 아님)
    const estateAdd = page.getByTestId("estate-add-header-estate");
    await expect(estateAdd).toBeVisible();
    await expect(page.getByTestId("estate-add-header-stock")).toBeVisible();

    // 클릭 → 추가 패널 펼침 + 헤더 버튼 숨김(패널과 상호배타)
    await estateAdd.click();
    await expect(estateAdd).toBeHidden();
    await expect(page.getByText("추가할 재산 종류 선택")).toBeVisible();
  });

  test("3그룹 토글 독립 동작 (주식·추정상속재산)", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoEstateStep(page);

    for (const key of ["stock", "presumed"]) {
      const toggle = page.getByTestId(`estate-group-toggle-${key}`);
      await expect(toggle).toBeVisible();
      await toggle.click();
      await expect(page.getByTestId(`estate-group-summary-${key}`)).toBeVisible();
      await toggle.click();
      await expect(page.getByTestId(`estate-group-summary-${key}`)).toHaveCount(0);
    }
  });
});
