/**
 * E2E: 조특법 특례 사전증여 상속 모드 노출 — §13 기간 무관 가산·§30의5⑩ 공제
 *
 * 검증 목표:
 *   1. 상속세 마법사 사전증여 입력 UI에서 조특법 특례 구분 RadioCardGroup 노출 (showSpecialType)
 *   2. specialTreatmentType=startup 선택 → 상속 모드 기간 무관 안내 텍스트 노출
 *   3. specialTreatmentType=family_business 선택 → §30의6⑤ 준용 안내 노출
 *   4. 특례 타입 선택 시 기납부 증여세 입력란 노출 (§30의5⑩ — giftTaxPaid 경로)
 *   5. 12년 전 창업자금 입력 → 계산 → 기간 무관 가산 결과(사전증여 명세 포함) 확인
 *
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_e2e_worktree_port_isolation]]
 */
import { test, expect, type Page } from "@playwright/test";
import {
  addHeir,
  addLandAsset,
  calcAndWaitResult,
  fillAndVerify,
  fillDateAndVerify,
} from "./_helpers/tax-flow";

/** Step0 → Step3 사전증여까지 이동 + 사전증여 행 1건 추가 후 반환 */
async function gotoStep3WithPriorGift(page: Page): Promise<void> {
  await page.goto("/calc/inheritance-tax");

  // Step0: 상속개시일 2024-01-01 + 자녀 1명
  await fillDateAndVerify(page, { year: "2024", month: "1", day: "1" });
  await addHeir(page, "heir", "child");

  // Step1: 상속재산 (토지 100㎡ × 700만원)
  await page.getByRole("button", { name: /^다음/ }).click();
  await addLandAsset(page, { area: "100", unitPrice: "7000000" });

  // Step2: 비과세·장례비 → Step3: 사전증여
  await page.getByRole("button", { name: /^다음/ }).click();
  await page.getByRole("button", { name: /^다음/ }).click();

  // 사전증여 행 추가
  await page.getByRole("button", { name: /사전증여 추가/ }).click();
}

test.describe("조특법 특례 사전증여 상속 UI (§30의5⑨·§30의6⑤)", () => {
  test("SP-E2E-1: 상속세 모드에서 조특법 특례 구분 RadioCardGroup 노출", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await gotoStep3WithPriorGift(page);

    // §30 배지 + 특례 구분 카드 노출 확인
    await expect(
      page.getByText("이 사전증여의 조특법 과세특례 여부"),
    ).toBeVisible();

    // RadioCardGroup 3개 옵션 노출 확인
    await expect(page.getByText("일반 증여").first()).toBeVisible();
    await expect(page.getByText("창업자금 §30의5").first()).toBeVisible();
    await expect(page.getByText("가업승계 §30의6").first()).toBeVisible();

    // 상속 모드 전용 필드(donor·⑤·⑦·할증·⑫) = §47 카드 숨겨짐 확인
    await expect(
      page.getByText("동일인 합산 정보 (§47 ② · §58 한도 산식용)"),
    ).toHaveCount(0);
  });

  test("SP-E2E-2: startup 선택 → 기간 무관 안내 + 기납부 증여세 입력란 노출", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await gotoStep3WithPriorGift(page);

    // 창업자금 선택
    await page.getByText("창업자금 §30의5").click();

    // 상속 모드 기간 무관 안내 텍스트 (§30의5⑨)
    await expect(
      page.getByText(/§13 10년\/5년 기간과 관계없이 상속세 과세가액에 가산됩니다/),
    ).toBeVisible();

    // §30의5⑩ 기납부 증여세 입력란 (giftTaxPaid 경로)
    await expect(
      page.getByText("기납부 증여세 (§30의5⑩ — 자동·수정 가능)"),
    ).toBeVisible();

    // 가업승계로 전환 → §30의6⑤ 준용 안내
    await page.getByText("가업승계 §30의6").click();
    await expect(
      page.getByText(/§30의6⑤ — 가업승계 주식은 §30의5⑧~⑬ 준용/),
    ).toBeVisible();

    // 일반 증여로 복귀 → 기납부 입력란 숨겨짐
    await page.getByText("일반 증여").click();
    await expect(
      page.getByText("기납부 증여세 (§30의5⑩ — 자동·수정 가능)"),
    ).toHaveCount(0);
  });

  test("SP-E2E-3: 12년 전 창업자금 입력 → 계산 → 사전증여 §30의5⑧ 기간무관 가산 결과 확인", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await gotoStep3WithPriorGift(page);

    // 증여일 입력 (2012-01-01 — 12년 전, §13 10년 cutoff 도과)
    const giftCard = page.locator(".border.rounded-lg.p-4").last();
    await fillDateAndVerify(
      page,
      { year: "2012", month: "1", day: "1" },
      { scope: giftCard },
    );

    // 창업자금 §30의5 선택
    await page.getByText("창업자금 §30의5").click();

    // 기간 무관 안내 확인
    await expect(
      page.getByText(/§13 10년\/5년 기간과 관계없이 상속세 과세가액에 가산됩니다/),
    ).toBeVisible();

    // 증여가액 입력 (3억)
    // CurrencyInput이 aria-label="금액 입력" 이지만 섹션별 구분이 필요.
    // giftCard 내 input들을 순서대로: DateInput 3개(연/월/일), giftAmount(4번째)
    // 기납부 증여세(5번째)는 창업자금 선택 시 나타남
    const allInputs = giftCard.locator('input[placeholder="금액 입력"]');
    // 증여가액은 창업자금 선택 전 이미 렌더된 첫 번째 금액 입력
    await allInputs.nth(0).click();
    await allInputs.nth(0).fill("300000000");
    await expect(allInputs.nth(0)).toHaveValue(/300/);

    // 기납부 증여세 입력 (2850만원 — §30의5⑩ 공제 분자)
    // 창업자금 선택 후 나타난 두 번째 금액 입력 (nth(1))
    // 단, "기납부 증여세 (자동·수정 가능)" 도 있으므로 nth(1)이 특례 카드 기납부 입력
    await allInputs.nth(1).click();
    await allInputs.nth(1).fill("28500000");
    await expect(allInputs.nth(1)).toHaveValue(/28500000|28,500,000/);

    // Step4: 공제·세액공제 → 계산
    await page.getByRole("button", { name: /^다음/ }).click();

    // 계산 실행 + 결과 대기
    await calcAndWaitResult(page, { taxType: "inheritance", timeout: 40_000 });

    // 결과: 사전증여재산 명세 섹션 확인 (§13 가산 표시)
    await expect(
      page.getByText("사전증여재산 명세 (상증법 §13)").first(),
    ).toBeVisible();

    // 명세 테이블 펼치기
    await page
      .getByText("사전증여재산 명세 (상증법 §13)")
      .first()
      .locator("xpath=ancestor::div[contains(@class,'rounded-lg')]//button")
      .first()
      .click();

    // §30의5⑧ 기간무관 가산 라벨 확인
    await expect(page.getByText("§30의5⑧ 기간무관 가산")).toBeVisible();
  });
});
