import { test, expect, type Page } from "@playwright/test";

import { clickAndExpectUrl } from "./_helpers/navigation";

/**
 * E2E: 증여로 보는 경우 (gift-deemed) Phase 1
 * 유형 선택 → (모달) 증여일+상세 입력 → 닫기 → 증여이익 산정 → 세액연결 이관.
 * CurrencyInput은 label htmlFor 미연결 → getByPlaceholder 사용. DateInput은 aria-label(모달 스코프).
 */

// 유형 선택 → 모달 자동 오픈 → 증여일 입력(다이얼로그 스코프 — page 스코프는 "정산기준일" 라디오 오매칭).
async function openDetail(page: Page, type: string) {
  await page.getByTestId(`deemed-type-${type}`).click();
  const dialog = page.getByTestId("deemed-detail-dialog");
  await dialog.getByLabel("연도").fill("2025");
  await dialog.getByLabel("월").fill("3");
  await dialog.getByLabel("일", { exact: true }).fill("15");
}
const closeDetail = (page: Page) => page.getByTestId("deemed-detail-confirm").click();

test.describe("증여로 보는 경우 (gift-deemed)", () => {
  test("§35 저가양수 특수관계 시가10억·대가6억 → 1억 + 증여세 연결", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "bargain_transfer");
    await page.getByLabel("시가", { exact: true }).fill("1000000000");
    await page.getByLabel("거래대가", { exact: true }).fill("600000000");
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("100,000,000");
    await clickAndExpectUrl(page, page.getByTestId("deemed-to-wizard"), /\/calc\/gift-tax/);
  });

  // 「상증법」§2 9호·§4의2①·③ 공통 게이트(7-12) — 위 테스트가 긍정 짝(토글 OFF → 1억 + 이관)이다.
  //   단위 anchor는 층을 따로 증명할 뿐 폼 → API → ⑫ Zod → 라우트 → 엔진 → 결과뷰 왕복은 이것만 본다.
  test("§35 수증자가 영리법인 → 증여세 미적용 · 이관 버튼 없음 · 산출 이익은 보존", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "bargain_transfer");
    await page.getByLabel("시가", { exact: true }).fill("1000000000");
    await page.getByLabel("거래대가", { exact: true }).fill("600000000");
    await page.getByRole("switch", { name: /수증자가 영리법인/ }).click();
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-exclusion")).toContainText("영리법인 수증자");
    await expect(page.getByTestId("deemed-to-wizard")).toHaveCount(0);
    // 금액은 0으로 소실되지 않고 결론 행 라벨만 바뀐다(§31① 「증여재산가액」 한정 정의)
    await expect(page.getByText("제외 전 산출 이익").first()).toBeVisible();
  });

  test("§34 보험금 1호 보험금1억·총1천만·타인600만 → 6,000만", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "insurance");
    await page.getByLabel("보험금", { exact: true }).fill("100000000");
    await page.getByLabel("납부보험료 총액", { exact: true }).fill("10000000");
    await page.getByPlaceholder("관련 보험료 (원)").fill("6000000");
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("60,000,000");
  });

  test("§35 임계미달 시가10억·대가8억 → 미적용 배너", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "bargain_transfer");
    await page.getByLabel("시가", { exact: true }).fill("1000000000");
    await page.getByLabel("거래대가", { exact: true }).fill("800000000");
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-exclusion")).toBeVisible();
  });
});
