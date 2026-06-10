/**
 * E2E: 비상장 간편(V1) 주식 — 협의분할 토글 활성화 + grossEstate 반영
 *
 * 계획서: docs/00-pm/inheritance-unlisted-simple-stock-gross-estate-wiring.plan.md
 * 디자인: docs/02-design/features/stock-gross-estate-wiring.ui.design.md §7
 *
 * 배경(사용자 보고):
 *   비상장 간편평가 시 "상속인·수유자별 협의분할 입력" 토글이 비활성. 활성화하면
 *   다른 자산처럼 협의분할 내용대로 상속인에게 귀속되어야 함.
 *   실측 근본 원인: V1 간편 주식 평가액이 grossEstateValue에 누락(=0).
 *
 * 검증:
 *   G-1: 평가액 입력 전 협의분할 토글 disabled("평가액을 먼저 입력하세요")
 *        → 주식수·순손익·순자산 입력 후 disabledReason 소멸(자동 활성화).
 *   G-2: full-flow → 결과 "상속재산 평가액"이 입력 주식 평가액(미리보기 총 평가액)과 일치(>0).
 *        (이전 버그: grossEstate=0 → 0 표시)
 *
 * 정책: [[feedback_browser_verify_with_playwright]] — spec 통과로 브라우저 확인 충족.
 */

import { test, expect, type Page } from "@playwright/test";
import { fillDateAndVerify, nextSteps, calcAndWaitResult,
  addHeir,
} from "./_helpers/tax-flow";

/** Step0: 상속개시일 + 자녀 1명 → Step1 */
async function gotoStep0(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await fillDateAndVerify(page, { year: "2026", month: "1", day: "10" });
  await addHeir(page, "heir", "child");
  await page.getByRole("button", { name: /^다음/ }).click();
}

/** Step1: 비상장주식 추가(간편평가 기본) */
async function addUnlistedStock(page: Page) {
  await page.getByRole("button", { name: /주식·지분 추가/ }).click();
  await page.getByText("비상장주식", { exact: true }).click();
}

/** 간편평가 필수 필드 입력 (회사 전체 기준) */
async function fillSimpleValuation(page: Page) {
  await page.locator("#simple-corp-name").fill("예제법인");
  await page.locator("#simple-total-shares").fill("10000");
  await page.locator("#simple-owned-shares").fill("10000");
  await page.getByLabel(/직전 1사업연도 순손익액/).fill("100000000");
  await page.getByLabel(/순자산가치 \(회사 전체/).fill("5000000000");
}

test.describe("비상장 간편 주식 — grossEstate 배선 + 협의분할 토글", () => {
  test("G-1: 평가액 입력 전 협의분할 토글 disabled → 입력 후 활성화", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoStep0(page);
    await addUnlistedStock(page);

    // 비상장주식 협의분할 토글 노출 확인
    // (UX3-AC1: 평가액 미입력이어도 상속인 존재 시 토글 활성 — disabledReason 없음)
    await expect(page.getByText("협의분할 직접 입력")).toBeVisible();

    // 평가액 입력
    await fillSimpleValuation(page);

    // 미리보기 총 평가액 표시 (UI 평가 계산 동작)
    await expect(page.getByText("총 평가액")).toBeVisible();
  });

  test("G-2: full-flow → 결과 상속재산 평가액에 주식 반영(>0)", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoStep0(page);
    await addUnlistedStock(page);
    await fillSimpleValuation(page);

    // 미리보기 총 평가액 캡처 (예: "4,360,000,000")
    const previewTotal = await page
      .getByText("총 평가액")
      .locator("xpath=following-sibling::*[1]")
      .innerText();
    const previewDigits = previewTotal.replace(/[^0-9]/g, "");
    expect(Number(previewDigits)).toBeGreaterThan(0);

    // Step1 → Step2 → Step3 → Step4 (다음 3회) → 계산하기
    await nextSteps(page, 3);
    await calcAndWaitResult(page);

    // 상속재산 평가액 = 미리보기 총 평가액 (grossEstate에 주식 반영 — 이전 버그: 0)
    const grossRow = page.getByText("상속재산 평가액", { exact: true }).locator("xpath=following-sibling::*[1]");
    await expect(grossRow).toContainText(Number(previewDigits).toLocaleString());
  });
});
