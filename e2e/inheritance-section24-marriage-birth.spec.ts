/**
 * E2E: 상속세 §53의2 혼인·출산 증여재산공제 (§24③ 분자)
 *
 * 검증:
 *   - Step3 사전증여에서 수증자=자녀(피상속인의 직계비속) 선택 시
 *     §53의2 입력 위젯("혼인·출산 증여재산공제")이 노출된다 (도메인-aware 게이트 수정).
 *   - 적용액 입력 후 계산 완료.
 *
 * 엔진 설계: docs/02-design/features/inheritance-section24-marriage-birth-deduction.engine.design.md
 * UI 설계:  docs/02-design/features/inheritance-section24-marriage-birth-deduction.ui.design.md
 */
import { test, expect } from "@playwright/test";
import { fillDateAndVerify, calcAndWaitResult,
  addHeir,
} from "./_helpers/tax-flow";

test.describe("상속세 §53의2 혼인·출산 증여재산공제", () => {
  test("E2E-1: 자녀 수증자 사전증여 → §53의2 위젯 노출 + 입력 + 계산", async ({ page }) => {
    await page.goto("/calc/inheritance-tax");

    // Step0: 상속개시일 2024-6-1 + 자녀 1명
    await fillDateAndVerify(page, { year: "2024", month: "6", day: "1" });
    await addHeir(page, "heir", "child");
    await page.getByPlaceholder("앞 6자리-뒤 7자리").last().fill("700101-1000000");
    await page.getByRole("button", { name: /^다음/ }).click(); // → Step1

    // Step1: 아파트 10억
    await page.getByRole("button", { name: /상속재산 추가/ }).click();
    await page.getByRole("button", { name: /아파트.*공동주택/ }).click();
    await page.getByPlaceholder("금액 입력").first().fill("1000000000");
    await page.getByRole("button", { name: /^다음/ }).click(); // → Step2
    await page.getByRole("button", { name: /^다음/ }).click(); // → Step3 (사전증여)

    // Step3: 사전증여 추가
    await page.getByRole("button", { name: /사전증여 추가/ }).click();

    // 증여일 2023-6-10 (마지막 DateInput = 사전증여 행)
    await page.getByRole("textbox", { name: "연도" }).last().fill("2023");
    await page.getByRole("textbox", { name: "월" }).last().fill("6");
    await page.getByRole("textbox", { name: "일" }).last().fill("10");

    // 수증자(doneeId) select = 자녀 → doneeRelation lineal_descendant 파생 (옵션 "자녀" 보유 combobox)
    const doneeSelect = page
      .getByRole("combobox")
      .filter({ has: page.getByRole("option", { name: "자녀", exact: true }) });
    await doneeSelect.selectOption({ label: "자녀" });

    // §53의2 위젯 노출 확인 (게이트 수정 핵심)
    await expect(page.getByText("혼인·출산 증여재산공제 (직계존속 한정)")).toBeVisible();

    // §53의2 적용액 1억 입력
    await page
      .getByText("§53의2 적용액 (혼인·출산 합산 최대 1억)")
      .locator("..")
      .getByRole("textbox")
      .fill("100000000");

    // 계산 진행 (Step3→4→계산)
    await page.getByRole("button", { name: /^다음/ }).click(); // → Step4
    await calcAndWaitResult(page);

    // 결과 페이지 도달 (상속공제 상세 내역 버튼 존재)
    await expect(page.getByRole("button", { name: /상속공제 상세 내역/ })).toBeVisible();
  });
});
