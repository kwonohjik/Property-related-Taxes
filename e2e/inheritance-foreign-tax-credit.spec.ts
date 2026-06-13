/**
 * E2E: 외국납부세액공제 §29 / 상증령 §21① — 결과 ▼펼침 산식 (2026-06-04)
 *
 * 계획서: docs/00-pm/inheritance-foreign-tax-credit.plan.md
 * 정책: [[feedback_browser_verify_with_playwright]] — spec 통과로 브라우저 확인 충족
 *
 * 사용자 요구: 외국납부세액공제도 다른 세액공제(§28·§30·§69)와 동일하게 ▼펼치기로
 *   계산근거(Min 한도 산식)를 표시.
 *
 * 시나리오 FTC-E2E: 자녀1 + 토지 30억 + 외국납부세액 1억 + 국외 상속재산 과세표준 5억
 *   → 결과 화면 세액공제 내역에 "외국납부세액공제" 행 + ▶ 산출근거 펼침 →
 *     "한도 = 상속세 산출세액 × (국외 상속재산 과세표준 ÷ 상속세 과세표준)" 노출.
 */

import { test, expect, type Page } from "@playwright/test";
import {
  fillDateAndVerify,
  addLandAsset,
  nextSteps,
  calcAndWaitResult,
  addHeir,
} from "./_helpers/tax-flow";

/** Step0(상속개시일 2024-06-10 + 자녀1) → Step1(토지 30억) → Step4(세액공제) */
async function gotoStep4WithLand(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await fillDateAndVerify(page, { year: "2024", month: "6", day: "10" });

  await addHeir(page, "heir", "child");
  await page.getByRole("button", { name: /^다음/ }).click(); // → Step1

  await addLandAsset(page, { area: "300", unitPrice: "10000000" });
  await nextSteps(page, 3); // → Step2 → Step3 → Step4
}

test.describe("외국납부세액공제 §29 — 결과 ▼펼침 산식", () => {
  test("FTC-E2E: 외국납부세액 + 국외 과세표준 입력 → 공제 행 + Min 한도 산식 펼침", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await gotoStep4WithLand(page);

    // Step4: 체크리스트 칩 "외국납부세액공제 §29" 클릭 → 입력 섹션 노출
    await page.getByText("외국납부세액공제 §29").click();

    // 입력 섹션 노출 확인 후 입력 (CurrencyInput hideLabel → aria-label 보존)
    await expect(page.getByText("외국납부세액공제 (§29)")).toBeVisible();
    await page.getByLabel("외국에서 납부한 상속세액").fill("100000000");
    await page.getByLabel("국외 상속재산 과세표준").fill("500000000");

    await calcAndWaitResult(page);

    // 세액공제 내역 카드에 "외국납부세액공제" 행 노출 (입력 섹션 "외국납부세액공제 (§29)"와 exact로 구분)
    await expect(
      page.getByText("외국납부세액공제", { exact: true }),
    ).toBeVisible();

    // ▶ 산출근거 펼침 (CreditRow aria-label)
    const expandBtn = page.getByRole("button", {
      name: /외국납부세액공제 산출근거 펼치기/,
    });
    await expect(expandBtn).toBeVisible();
    await expandBtn.click();

    // Min(한도, 외국세액) 산식 + 한도 계산식 노출 (결과 전용 "한도 = 상속세 산출세액 …")
    await expect(
      page.getByText("외국납부세액공제 = Min(한도, 외국에서 납부한 상속세액)"),
    ).toBeVisible();
    await expect(
      page.getByText("한도 = 상속세 산출세액", { exact: false }),
    ).toBeVisible();
  });
});
