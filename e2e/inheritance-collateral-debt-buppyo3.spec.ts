/**
 * E2E: 상속세 — §14 담보채무 자동도출분이 결과 화면에 표시되는지 검증
 *
 * 회귀 대상 버그: 자산 §14 담보공제 토글로만 담보채권액을 입력(수동 협의분할 debtItems 없음)하면
 *   부표3 「가. 채무」 표가 비고(⑦ 계 0), ④ 담보채무 카드·협의분할 표(3)가 게이트에 막혀 미표시되던 문제.
 * 수정: buildBuppyo3Data 내부 collateral 합산 + ④ 카드/인쇄 선택 게이트 hasDebtOrCollateral 확장.
 *
 * 설계: docs/02-design/features/inheritance-buppyo3-collateral-debt-display.{plan,engine.design,ui.design}.md
 */
import { test, expect, type Page } from "@playwright/test";
import { nextSteps, calcAndWaitResult,
  addHeir,
} from "./_helpers/tax-flow";

/** Step0 상속개시일 + 상속인(자녀) → 다음 → Step1 토지 카드 추가 + 담보 §14 자동공제(5천만, 수동 채무 없음) */
async function setupCollateralOnlyLand(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2023");
  await page.getByLabel("월").first().fill("3");
  await page.getByLabel("일").first().fill("10");
  await addHeir(page, "heir", "child");
  await page.getByRole("button", { name: /^다음/ }).click();

  // Step1 상속재산 — 토지 카드 (평가액 2억: 단가 100만 × 면적 200, 담보 < 평가액 → §66 하한 미발동)
  await page.getByRole("button", { name: /상속재산 추가/ }).click();
  await page.getByRole("button", { name: /토지/ }).first().click();
  await page.getByRole("switch", { name: /보충적 평가방법/ }).click();
  await page.getByPlaceholder("면적 입력").fill("200");
  await page.getByPlaceholder("공시지가 단가").fill("1000000");

  // 담보·임대 섹션 토글 ON → 담보채권액 5천만
  await page.getByRole("switch", { name: /담보·임대/ }).click();
  const mortgageInput = page
    .getByText("저당권 등에 의해 담보된 채권액", { exact: true })
    .locator("xpath=ancestor::div[@data-slot='field-card']//input");
  await mortgageInput.fill("50000000");

  // §14 자동공제 토글 ON (수동 협의분할 채무는 입력하지 않음 — 담보만 있는 케이스)
  await page.getByText("이 담보채무를 §14 부채로 자동 공제").click();
}

test.describe("§14 담보채무 자동도출분 결과 표시", () => {
  test("담보만 입력(수동 채무 없음) → 부표3 「가.채무」⑦계 = 5천만 + ④ 담보채무 카드 표시", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await setupCollateralOnlyLand(page);

    // Step2(비과세·장례) → Step3(사전증여) → Step4(공제) → 계산
    await nextSteps(page, 3);
    await calcAndWaitResult(page);

    // ── 부표3 「가. 채무」 — 명세 섹션 펼침 후 ⑦ 계 검증 ──
    const besshiRoot = page.getByTestId("besshi-forms-root");
    await expect(besshiRoot).toBeVisible();
    await besshiRoot
      .getByText("채무·공과금·장례비·상속공제 명세", { exact: false })
      .click();
    // ⑦ 계 = 담보채무 자동도출분 5천만 (수정 전: 0)
    await expect(page.getByTestId("bp3-가-total")).toHaveText(/50,000,000/);
    // 가. 채무 첫 행 금액도 5천만
    await expect(page.getByTestId("bp3-가-row-0-amount")).toHaveText(/50,000,000/);

    // ── ④ 담보채무 카드 — 게이트 확장으로 담보만 있어도 표시 (수정 전: debtItems.length>0 게이트에 막힘) ──
    await expect(
      page.getByText("채무·공과·장례비 협의분할 결과", { exact: false }),
    ).toBeVisible();
  });
});
