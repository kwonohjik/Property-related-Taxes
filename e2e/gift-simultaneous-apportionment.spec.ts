/**
 * E2E: 동시증여 증여재산공제 안분 (상증령 §46①2호) — Phase 1(§53) + Phase 2(§53의2)
 *
 * 트리거 사례(교재): 갑(성년)이 같은 날 부모 130,000천 + 할아버지 70,000천 동시 증여.
 *   - §53 직계존속 5천만 안분: 50,000천 × 130,000 ÷ 200,000 = 32,500천
 *   - §53의2 혼인공제 1억 안분: 100,000천 × 130,000 ÷ 200,000 = 65,000천
 *
 * 폼: 부모(직계존속 성년) 현금 130,000,000 + 동시증여 ToggleCard ON + 할아버지 70,000,000.
 *   동시증여 행 관계 default = 현재 신고 관계(직계존속 성년) → 할아버지와 동일 그룹.
 *
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_e2e_worktree_port_isolation]]
 *       worktree 실행 시 E2E_PORT=3100 필수.
 */
import { test, expect } from "@playwright/test";
import {
  fillDateAndVerify,
  nextSteps,
  calcAndWaitResult,
  addLandAsset,
} from "./_helpers/tax-flow";

/** 라벨 CurrencyInput(htmlFor 미연결) 채우기 — <label> following-sibling input */
async function fillLabeledCurrency(
  page: import("@playwright/test").Page,
  label: string,
  value: string,
) {
  const input = page
    .getByText(label, { exact: false })
    .locator("xpath=following-sibling::div//input");
  await input.first().fill(value);
}

/** Step0(부모 현금 130M) → Step1 → Step3 진입 + 동시증여 ON + 할아버지 70M 행 */
async function setupSimultaneousGift(page: import("@playwright/test").Page) {
  await page.goto("/calc/gift-tax");

  // Step0: 증여일 + 증여자(부)
  await fillDateAndVerify(page, { year: "2025", month: "6", day: "1" });
  await page.locator("select").first().selectOption("father");
  await page.getByRole("button", { name: /^다음/ }).click();

  // Step1: 토지 130㎡ × 1,000,000 = 130,000,000 (V_cur = 130M, 예측 가능 평가액)
  await addLandAsset(page, {
    area: "130",
    unitPrice: "1000000",
    addButtonName: /증여재산 추가/,
    keepModalOpen: true,
  });
  await page.getByPlaceholder(/본가 토지/).fill("부모 토지");
  await page.getByRole("dialog").getByRole("button", { name: "닫기" }).click();
  await expect(page.getByTestId("estate-edit-dialog")).toBeHidden();

  // Step1 → Step2(비과세) → Step3(공제)
  await nextSteps(page, 2);

  // 동시증여 ToggleCard ON (Switch role 직접 클릭) → 행 추가 → 할아버지 70,000,000
  await page.getByRole("switch", { name: /같은 날 다른 분으로부터도/ }).click();
  await page.getByRole("button", { name: "+ 동시증여 추가" }).click();
  // 동시증여 건 관계 = 할아버지(grandparent, 직계존속 그룹) — 추가 직후 default 미선택이므로 명시 필수
  await page.getByTestId("sim-card-0-donor-grandparent").click();
  // 동시증여 건 증여재산 = PropertyValuationForm 모달 (현금 70,000,000)
  await page.getByRole("button", { name: "+ 증여재산 추가" }).last().click();
  await page.getByRole("button", { name: /현금/ }).last().click();
  const simModal = page.getByRole("dialog");
  await expect(simModal).toBeVisible();
  await simModal.getByRole("textbox", { name: "현금 금액" }).fill("70000000");
  await simModal.getByRole("button", { name: "닫기" }).click();
  await expect(simModal).toBeHidden();
}

test.describe("동시증여 증여재산공제 안분 (상증령 §46①2호)", () => {
  test("[E2E-SIM-1] Phase 1 §53: 부모 신고 동시증여 안분 → 32,500,000", async ({ page }) => {
    test.setTimeout(90_000);
    await setupSimultaneousGift(page);

    await calcAndWaitResult(page, { taxType: "gift" });

    // 결과: 건0(부모 신고분) 별지 제10호 ㉖ 증여재산공제 = §53 직계존속 5천만을 과세가액 비율(130:70) 안분 → 32,500,000
    await expect(
      page.locator('[data-testid="besshi10-0-㉖"]'),
    ).toContainText("32,500,000");
  });

  test("[E2E-SIM-2] Phase 2 §53의2: 혼인공제 1억 동시증여 안분 → 한도 65,000,000, 공제 97,500,000", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await setupSimultaneousGift(page);

    // 혼인·출산 공제 칩 활성 → 혼인공제 1억 입력
    await page.getByText("혼인·출산 공제 (§53의2)").click();
    await fillLabeledCurrency(page, "혼인공제", "100000000");

    await calcAndWaitResult(page, { taxType: "gift" });

    // 결과: 건0 별지 제10호 ㉖ 증여재산공제 (혼인·출산공제 §53의2 안분 포함) = 97,500,000
    await expect(
      page.locator('[data-testid="besshi10-0-㉖"]'),
    ).toContainText("97,500,000");
  });
});
