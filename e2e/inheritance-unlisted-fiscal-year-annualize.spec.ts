/**
 * E2E: 비상장주식 V2 정식평가 — §17의3② 1년 미만 사업연도 연환산
 *
 * 검증:
 *   1. V2 정식평가 모드 진입 → FiscalYearAdjustmentTable에 사업연도 개시일 DateInput 노출
 *   2. 1년전 사업연도 개시일을 6개월(2023-07-01~2023-12-31)로 입력
 *      → amber 안내 "사업연도 6개월 → 1주당 순손익액 ×12/6 연환산 (§17의3②)" 노출
 *   3. 결과 카드(PerShareValuationResultCard)에 연환산 내역 표시
 *
 * FY-7 anchor (Playwright E2E 버전):
 *   fiscalYearStartDate 6개월 입력 → annualizationApplied[0]=true echo 표시 RTL
 *
 * 계획: docs/00-pm/inheritance-unlisted-fiscal-year-under-1year.plan.md §6 Phase B PR-B4
 *
 * 실제 진입 경로 (2026-05-26 검증):
 *   Step0(상속개시일+상속인) → 다음 → Step1
 *   → StockValuationForm "주식·지분 추가" 버튼
 *   → 팝업 "비상장주식" 버튼
 *   → UnlistedStockCard RadioCardGroup "정식평가" 라디오 선택
 *   → FiscalYearAdjustmentTable 렌더 → 개시일 DateInput 노출
 */
import { test, expect, type Page } from "@playwright/test";
import { addHeir } from "./_helpers/tax-flow";

/**
 * V2 정식평가 카드 모드로 진입하는 헬퍼
 *
 * 실제 경로:
 *   1. Step0: 상속개시일 + 상속인(자녀) 등록
 *   2. "다음 →" 클릭 → Step1(상속재산 평가)
 *   3. StockValuationForm 섹션의 "주식·지분 추가" 버튼 클릭
 *   4. 팝업에서 "비상장주식" 버튼 클릭 → 비상장주식 카드 추가
 *   5. RadioCardGroup에서 "정식평가" 선택 → FiscalYearAdjustmentTable 렌더
 */
async function gotoV2FormalValuationCard(page: Page) {
  await page.goto("/calc/inheritance-tax");

  // Step0: 상속개시일 입력
  await page.getByLabel("연도").first().fill("2024");
  await page.getByLabel("월").first().fill("3");
  await page.getByLabel("일").first().fill("31");

  // 상속인 1명(자녀) 등록
  await addHeir(page, "heir", "child");

  // Step1(상속재산 평가)으로 이동
  await page.getByRole("button", { name: /^다음/ }).click();

  // StockValuationForm: "주식·지분 추가" 버튼 클릭 → 종류 선택 패널 열기
  await page.getByRole("button", { name: /주식·지분 추가/ }).click();

  // 팝업에서 "비상장주식" 선택
  await page.getByRole("button", { name: /비상장주식/ }).click();

  // 비상장주식 카드의 RadioCardGroup에서 "정식평가" 선택
  // (간편평가가 기본값 — 정식평가로 변경)
  await page.getByText("정식평가", { exact: true }).click();
}

test.describe("비상장주식 V2 — §17의3② 1년 미만 사업연도 연환산 UI", () => {
  test("V2 정식평가 모드 진입 시 사업연도 개시일 DateInput이 노출된다", async ({ page }) => {
    await gotoV2FormalValuationCard(page);

    // FiscalYearAdjustmentTable이 렌더되고 "개시일" 텍스트가 표시되어야 함
    await expect(
      page.getByText("개시일", { exact: false }).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("FY-7: 6개월 개시일 입력 → amber 안내 '6개월 → ×12/6 연환산 (§17의3②)' 노출", async ({ page }) => {
    await gotoV2FormalValuationCard(page);

    // FiscalYearAdjustmentTable — "1년전 ×3" 컬럼(idx=0)의 개시일·종료일 DateInput 찾기
    // 구조: 상단 헤더 grid-cols-[13rem_repeat(3,1fr)] → 첫 컬럼=spacer, 두번째~네번째=1년전/2년전/3년전 (2026-05-27 정렬)
    // "1년전 ×3" div 부모에 개시일·종료일 DateInput이 있음 (텍스트 기반 탐색이라 grid 트랙 변경 무관)
    const firstYearCol = page
      .locator("text=1년전 ×3")
      .locator("..")
      .first();

    await firstYearCol.waitFor({ timeout: 5_000 });

    // 개시일: 2023-07-01 (6개월 사업연도)
    // DateInput = aria-label="연도"/"월"/"일" 3개 input
    // "개시일" 텍스트 다음에 오는 첫 번째 DateInput 필드 그룹
    const startDateGroup = firstYearCol
      .locator("text=개시일")
      .locator("..")
      .first();

    await startDateGroup.getByLabel("연도").fill("2023");
    await startDateGroup.getByLabel("월").fill("7");
    await startDateGroup.getByLabel("일").fill("1");

    // 종료일: 2023-12-31
    const endDateGroup = firstYearCol
      .locator("text=종료일")
      .locator("..")
      .first();

    await endDateGroup.getByLabel("연도").fill("2023");
    await endDateGroup.getByLabel("월").fill("12");
    await endDateGroup.getByLabel("일").fill("31");

    // amber 안내: "사업연도 6개월 → 1주당 순손익액 ×12/6 연환산 (§17의3②)"
    // FiscalYearAdjustmentTable line 172 실제 문구
    await expect(
      page.getByText(/사업연도 6개월.*×12\/6.*연환산.*§17의3②/, { exact: false })
    ).toBeVisible({ timeout: 3_000 });
  });
});
