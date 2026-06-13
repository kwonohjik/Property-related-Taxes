/**
 * E2E: 상속세 재해손실공제 (상증법 §23)
 *
 * 검증:
 *   - Step4 "재해손실공제 신청 (§23)" 토글 ON → 재해손실재산가액 4억·보전 1억 입력
 *   - 계산 → 상속공제 상세에 "재해손실공제 (§23)" 행 + 공제 3억 표시
 *   - 자동계산 박스 "공제 신청액" = 3억 (4억 − 1억)
 *
 * 엔진 설계: docs/02-design/features/inheritance-casualty-loss-deduction.engine.design.md
 * UI 설계:  docs/02-design/features/inheritance-casualty-loss-deduction.ui.design.md
 */
import { test, expect } from "@playwright/test";
import {
  fillDateAndVerify,
  nextSteps,
  calcAndWaitResult,
  addHeir,
} from "./_helpers/tax-flow";

test.describe("상속세 재해손실공제 §23", () => {
  test("E2E-1: 토글 ON + 손실 4억·보전 1억 → 공제 3억 결과 반영", async ({ page }) => {
    await page.goto("/calc/inheritance-tax");

    // Step0: 상속개시일 2024-6-1 + 자녀 1명
    await fillDateAndVerify(page, { year: "2024", month: "6", day: "1" });
    await addHeir(page, "heir", "child");
    await page.getByRole("button", { name: /^다음/ }).click(); // → Step1

    // Step1: 아파트 10억
    await page.getByRole("button", { name: /상속재산 추가/ }).click();
    await page.getByRole("button", { name: /아파트.*공동주택/ }).click();
    await page.getByPlaceholder("금액 입력").first().fill("1000000000");

    // Step1 → 2 → 3 → 4
    await nextSteps(page, 3);

    // Step4: 체크리스트 칩 "재해손실공제 §23" 클릭 → casualtyLossEnabled=true → CasualtyLossSection 렌더
    // (칩 클릭 = casualtyLossEnabled 직접 토글 = 내부 토글 클릭과 동일 효과)
    await page.getByText("재해손실공제 §23").click();

    // 재난 발생일 2024-7-1 (상속개시 2024-6-1 이후, 신고기한 2024-12-31 이내 — §23 요건)
    const dateField = page.getByTestId("casualty-disaster-date");
    await fillDateAndVerify(
      page,
      { year: "2024", month: "7", day: "1" },
      { scope: dateField },
    );

    // 손실 4억 · 보전 1억 (CurrencyInput 라벨 미연결 → 라벨 텍스트 부모에서 textbox)
    await page.getByText("재해손실재산가액").locator("..").getByRole("textbox").fill("400000000");
    await page.getByText("보전가능금액").locator("..").getByRole("textbox").fill("100000000");

    // 자동계산 박스 = 3억
    await expect(page.getByText("300,000,000").first()).toBeVisible();

    await calcAndWaitResult(page);

    // 결과: 상속공제 상세 펼침 → 재해손실공제 (§23) 행 + 3억
    await page.getByRole("button", { name: /상속공제 상세 내역/ }).click();
    const row = page.getByTestId("casualty-loss-deduction-row");
    await expect(row).toBeVisible();
    await expect(row.getByText("재해손실공제 (§23)")).toBeVisible();
    await expect(row.getByText("300,000,000")).toBeVisible();
  });
});
