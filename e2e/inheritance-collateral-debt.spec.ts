/**
 * E2E: 상속세 — 담보채무 §14 자동공제 토글 ON → 채무 입력 화면 자동 노출
 *
 * 검증: 재산평가에서 담보채권액 입력 + [담보채무 §14 자동공제] 토글 ON →
 *       Step2(비과세·장례비) 협의분할 모드에서 "자산 평가에서 반영된 담보채무" 읽기전용 카드 노출.
 *
 * 계획: docs/00-pm/inheritance-collateral-debt-auto-deduction.plan.md
 */
import { test, expect, type Page } from "@playwright/test";

/** Step0 상속개시일 + 상속인(자녀) → 다음 → Step1 상속재산 → 토지 카드 추가 */
async function gotoEstateLandCard(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2023");
  await page.getByLabel("월").first().fill("3");
  await page.getByLabel("일").first().fill("10");
  await page.getByRole("button", { name: /상속인 추가/ }).click();
  await page.getByText("자녀", { exact: true }).click();
  await page.getByRole("button", { name: /^다음/ }).click();
  await page.getByRole("button", { name: /상속재산 추가/ }).click();
  await page.getByRole("button", { name: /토지/ }).first().click();
}

test.describe("담보채무 §14 자동공제 토글 ON → 자동노출", () => {
  test("재산평가 토글 ON → Step2 협의분할에 담보채무 자동노출 카드 + 금액 표시", async ({ page }) => {
    await gotoEstateLandCard(page);

    // 단가 100만 × 면적 200 = 평가액 2억 (담보 < 평가액, §66 하한 미발동)
    // 보충적 평가(개별공시지가) 토글 ON — 면적·단가 입력 펼침 (2026-06-09 토글 전환)
    await page.getByRole("switch", { name: /보충적 평가방법/ }).click();
    await page.getByPlaceholder("면적 입력").fill("200");
    await page.getByPlaceholder("공시지가 단가").fill("1000000");

    // 담보·임대 섹션 토글 ON (2026-06-09 토글 전환 — 값 입력 위해 펼침)
    await page.getByRole("switch", { name: /담보·임대/ }).click();

    // 저당권 담보채권액 5천만
    const mortgageInput = page
      .getByText("저당권 등에 의해 담보된 채권액", { exact: true })
      .locator("xpath=ancestor::div[@data-slot='field-card']//input");
    await mortgageInput.fill("50000000");

    // 담보채무 §14 자동공제 토글 ON
    await page.getByText("이 담보채무를 §14 부채로 자동 공제").click();

    // 금융채무 하위 토글 노출 확인 (ON children)
    await expect(
      page.getByText("저당채무가 금융회사 채무", { exact: false }),
    ).toBeVisible();

    // Step2(비과세·장례비)로 이동
    await page.getByRole("button", { name: /^다음/ }).click();

    // 채무·공과·장례비 협의분할 모드 토글 ON → DebtAllocationInput 렌더
    await page.getByText("채무·공과·장례비 협의분할 입력").click();

    // 자동노출 카드 확인 (derive only — 읽기전용)
    await expect(
      page.getByText("자산 평가에서 반영된 담보채무 (§14 자동 공제)"),
    ).toBeVisible();
    // 담보채권액 5천만 표시
    await expect(page.getByText("50,000,000").first()).toBeVisible();
  });

  test("토글 OFF(기본) → Step2에 담보채무 자동노출 카드 없음 (회귀)", async ({ page }) => {
    await gotoEstateLandCard(page);
    // 보충적 평가(개별공시지가) 토글 ON — 면적·단가 입력 펼침 (2026-06-09 토글 전환)
    await page.getByRole("switch", { name: /보충적 평가방법/ }).click();
    await page.getByPlaceholder("면적 입력").fill("200");
    await page.getByPlaceholder("공시지가 단가").fill("1000000");
    // 담보·임대 섹션 토글 ON (2026-06-09 토글 전환)
    await page.getByRole("switch", { name: /담보·임대/ }).click();
    const mortgageInput = page
      .getByText("저당권 등에 의해 담보된 채권액", { exact: true })
      .locator("xpath=ancestor::div[@data-slot='field-card']//input");
    await mortgageInput.fill("50000000");
    // 토글 ON 하지 않음

    await page.getByRole("button", { name: /^다음/ }).click();
    await page.getByText("채무·공과·장례비 협의분할 입력").click();

    // 자동노출 카드 없어야 함 (opt-in OFF → deriveCollateralDebts 빈 배열)
    await expect(
      page.getByText("자산 평가에서 반영된 담보채무 (§14 자동 공제)"),
    ).toHaveCount(0);
  });
});
