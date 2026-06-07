/**
 * E2E: 상속세 마법사 — 기준시가 공시연도 자동 선택
 *
 * 검증: 상속개시일을 입력하면 자산 카드 기준시가 연도 select 기본값이
 *       상속개시일 기준(주택 고시 cutoff 0429)으로 자동 설정되는가.
 *
 * 계획: docs/00-pm/standard-price-notice-year-auto.plan.md
 */
import { test, expect, type Page } from "@playwright/test";

/** 상속개시일 입력 → 상속인 1명(자녀) 등록 → 상속재산 단계 진입 → 아파트 카드 추가 */
async function gotoEstateAptCard(page: Page, year: string, month: string, day: string) {
  await page.goto("/calc/inheritance-tax");

  // Step1: 상속개시일
  await page.getByLabel("연도").first().fill(year);
  await page.getByLabel("월").first().fill(month);
  await page.getByLabel("일").first().fill(day);

  // 상속인 1명 등록 (다음 단계 진입 전제)
  await page.getByRole("button", { name: /상속인 추가/ }).click();
  await page.getByText("자녀", { exact: true }).click();

  // 상속재산 단계로
  await page.getByRole("button", { name: /^다음/ }).click();

  // 상속재산 추가 → 아파트·공동주택
  await page.getByRole("button", { name: /상속재산 추가/ }).click();
  await page.getByRole("button", { name: /아파트.*공동주택/ }).click();
}

/** 기준시가 연도 select (공시가격 조회 버튼과 같은 행) */
function noticeYearSelect(page: Page) {
  return page.locator('div:has(> button:has-text("공시가격 조회")) > select').first();
}

test.describe("상속세 기준시가 공시연도 자동 선택", () => {
  test("상속개시일 2023-03-10 → 공시연도 기본값 2022 (주택 cutoff 0429 이전)", async ({ page }) => {
    await gotoEstateAptCard(page, "2023", "3", "10");
    await expect(noticeYearSelect(page)).toHaveValue("2022");
  });

  test("상속개시일 2023-06-01 → 공시연도 기본값 2023 (cutoff 이후)", async ({ page }) => {
    await gotoEstateAptCard(page, "2023", "6", "1");
    await expect(noticeYearSelect(page)).toHaveValue("2023");
  });

  test("토지 자산 면적 입력 — 입력값이 면적 칸에 표시되고 단가×면적 총액 자동계산", async ({ page }) => {
    await page.goto("/calc/inheritance-tax");
    await page.getByLabel("연도").first().fill("2023");
    await page.getByLabel("월").first().fill("3");
    await page.getByLabel("일").first().fill("10");
    await page.getByRole("button", { name: /상속인 추가/ }).click();
    await page.getByText("자녀", { exact: true }).click();
    await page.getByRole("button", { name: /^다음/ }).click();

    // 토지 자산 추가 (개별공시지가 = 단가×면적)
    await page.getByRole("button", { name: /상속재산 추가/ }).click();
    await page.getByRole("button", { name: /토지/ }).first().click();

    // 면적 입력 → 면적 칸에 표시되는가 (이전 버그: area prop 미전달로 갇힘)
    const areaInput = page.getByPlaceholder("면적 입력");
    await areaInput.fill("200");
    await expect(areaInput).toHaveValue("200");

    // 단가 입력 → 단가×면적 총액 자동계산 (105,400 × 200 = 21,080,000)
    // 사이드바 합계(콤마 포맷 확실)로 자동계산 결과 검증
    await page.getByPlaceholder("공시지가 단가").fill("105400");
    await expect(page.getByText("21,080,000").first()).toBeVisible();

    // §66·§63 — 담보채권액(1천만 < 평가액)을 입력해도 평가액에서 차감되지 않고(MAX),
    // 채무는 부채 명세 별도 공제 안내가 표시되어야 함
    // 저당권은 advanced ToggleCard(시가·감정가·임대보증금·저당권 입력) 안에 있음 — 먼저 열기
    await page.getByText("시가·감정가·임대보증금·저당권 입력").click();
    const mortgageInput = page
      .getByText("저당권 등에 의해 담보된 채권액", { exact: true })
      .locator("xpath=ancestor::div[@data-slot='field-card']//input");
    await mortgageInput.fill("10000000");
    // §66 MAX 동작: 담보채권액(1천만) < 평가액(2억1천만) → 차감 없이 평가액 유지
    // hint 텍스트로 §66 설명 노출 확인 (부동산 카드에 preview 없음 — hint로 대체)
    await expect(page.getByText(/§66.*평가액이 더 크면 평가액으로 평가/)).toBeVisible();
    await expect(page.getByText("21,080,000").first()).toBeVisible(); // 차감 없이 유지
  });

  test("협의분할 — 전역 '실제 상속 비율 %' 필드 제거 + 법정상속분 안내 노출", async ({ page }) => {
    await page.goto("/calc/inheritance-tax");
    await page.getByLabel("연도").first().fill("2023");
    await page.getByLabel("월").first().fill("3");
    await page.getByLabel("일").first().fill("10");
    await page.getByRole("button", { name: /상속인 추가/ }).click();
    await page.getByText("자녀", { exact: true }).click();

    // dead field("실제 상속 비율") 완전 제거
    await expect(page.getByText("실제 상속 비율")).toHaveCount(0);
    // 법정상속분 자동 배분 안내 노출 (상속인 섹션)
    await expect(page.getByText(/법정상속분.*자동 배분/).first()).toBeVisible();
  });

  test("상속개시일 재변경 시 공시연도 자동 갱신 (3-10 → 6-01)", async ({ page }) => {
    await gotoEstateAptCard(page, "2023", "3", "10");
    await expect(noticeYearSelect(page)).toHaveValue("2022");

    // Step1 복귀 후 6-01로 변경
    await page.getByRole("button", { name: /^이전|뒤로/ }).first().click();
    await page.getByLabel("월").first().fill("6");
    await page.getByLabel("일").first().fill("1");
    await page.getByRole("button", { name: /^다음/ }).click();

    await expect(noticeYearSelect(page)).toHaveValue("2023");
  });
});
