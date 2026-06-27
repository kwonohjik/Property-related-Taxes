/**
 * E2E: §63④ 예금·저금·적금 평가 보완 — 3 케이스 UI 통합 검증
 *
 * 법령: 상증법 §63④ — 평가액 = ㉠예입원금 + ㉡미수이자 − ㉢원천징수세액
 *
 * 검증 케이스:
 *   TC-1: 잔액평가 (balance) — marketValue 직접 입력 → 사이드바 표시
 *   TC-2: §63④ 자동 계산 (auto) — 원금·이율·예입일 입력 → 미리보기 렌더
 *   TC-3: §63④ 직접 입력 (manual) — 원금·미수이자·원천징수세액 직접 입력 → 미리보기
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 */

import { test, expect, type Page } from "@playwright/test";
import { addHeir, closeHeirEditModal } from "./_helpers/tax-flow";

async function gotoStep1WithChild(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2026");
  await page.getByLabel("월").first().fill("5");
  await page.getByLabel("일").first().fill("15");
  await addHeir(page, "heir", "child");
  await closeHeirEditModal(page);
  await page.getByRole("button", { name: /^다음/ }).click();
}

/** 상속재산 추가 → financial(예금·펀드·채권·공제금) 선택 → 편집 모달 열기 */
async function addFinancialCardAndOpen(page: Page) {
  await page.getByRole("button", { name: /재산 추가|상속재산 추가/ }).first().click();
  await page.getByText("예금·펀드·채권·공제금").first().click();
  await expect(page.getByTestId("estate-edit-dialog")).toBeVisible();
}

test.describe("§63④ 예금 평가 UI — EstateBodyFinancial", () => {
  test.setTimeout(60_000);

  test("TC-1: 잔액평가 — marketValue 입력, 평가방법 라디오 기본 선택", async ({ page }) => {
    await gotoStep1WithChild(page);
    await addFinancialCardAndOpen(page);

    const dialog = page.getByTestId("estate-edit-dialog");

    // 섹션 타이틀 확인
    await expect(dialog.getByText("예금·저금·적금 평가")).toBeVisible();

    // RadioCardGroup(emerald) — 잔액평가 기본 선택 확인 (getByRole radio 사용)
    const balanceRadio = dialog.getByRole("radio", { name: /잔액평가/ });
    await expect(balanceRadio).toBeChecked();

    // "잔액 또는 시가" FieldCard 렌더 확인 (balance 모드 기본) — exact: true로 hint 중복 회피
    await expect(dialog.getByText("잔액 또는 시가", { exact: true })).toBeVisible();

    // 잔액 입력 — fill() 후 DOM 값은 포맷 전 숫자 그대로 (CurrencyInput 포맷은 blur 시 적용)
    const marketValueInput = dialog.getByTestId(/savings-market-value-/);
    await marketValueInput.fill("100000000");
    await expect(marketValueInput).toHaveValue("100000000");
  });

  test("TC-2: §63④ 자동 계산 — 원금·이율·예입일 입력 후 미리보기 렌더", async ({ page }) => {
    await gotoStep1WithChild(page);
    await addFinancialCardAndOpen(page);

    const dialog = page.getByTestId("estate-edit-dialog");

    // §63④ 정밀평가 라디오 선택
    const preciseRadio = dialog.getByRole("radio", { name: /정밀평가/ });
    await preciseRadio.click();

    // 자동 계산 서브 라디오 표시 확인
    await expect(dialog.getByText("미수이자 산정 방법")).toBeVisible();
    const autoRadio = dialog.getByRole("radio", { name: /자동 계산/ });
    await expect(autoRadio).toBeVisible();

    // 자동 계산 기본 선택 → 원금·이율·예입일 필드 노출 (exact: true로 hint 중복 회피)
    await expect(dialog.getByText("㉠ 예입원금", { exact: true })).toBeVisible();
    await expect(dialog.getByText("연이율", { exact: true })).toBeVisible();
    await expect(dialog.getByText("예입일 (최초 납입일)", { exact: true })).toBeVisible();
    await expect(dialog.getByText("원천징수율", { exact: true })).toBeVisible();
    await expect(dialog.getByText("지방소득세 포함", { exact: true })).toBeVisible();

    // 원금 입력
    const principalInput = dialog.getByTestId(/savings-principal-/);
    await principalInput.fill("1000000000");

    // 이율 입력 (5%)
    const rateInput = dialog.getByTestId(/savings-annual-rate-/);
    await rateInput.fill("5");

    // 예입일 입력 (2007.7.1) — DateInput label 기반
    const allYearInputs = dialog.getByLabel("연도");
    const allMonthInputs = dialog.getByLabel("월");
    const allDayInputs = dialog.getByLabel("일");
    await allYearInputs.last().fill("2007");
    await allMonthInputs.last().fill("7");
    await allDayInputs.last().fill("1");

    // 미리보기 블록 렌더 확인 — exact: true로 hint 중복 회피
    await expect(dialog.getByText("§63④ 자동 계산 미리보기", { exact: true })).toBeVisible();
    await expect(dialog.getByText("경과일수", { exact: true })).toBeVisible();
    await expect(dialog.getByText("㉡ 미수이자", { exact: true })).toBeVisible();
  });

  test("TC-3: §63④ 직접 입력 — 원금·미수이자·원천징수세액 입력 후 미리보기", async ({
    page,
  }) => {
    await gotoStep1WithChild(page);
    await addFinancialCardAndOpen(page);

    const dialog = page.getByTestId("estate-edit-dialog");

    // §63④ 정밀평가 라디오 선택
    const preciseRadio = dialog.getByRole("radio", { name: /정밀평가/ });
    await preciseRadio.click();

    // 직접 입력 라디오 선택 — "잔액평가" 설명에도 "직접 입력" 포함되므로 name 속성으로 그룹 정확히 특정
    await dialog.locator('input[name*="savings-accrual-method"][value="manual"]').click();

    // 원금·미수이자·원천징수세액 FieldCard 라벨 확인 (exact: true로 미리보기 등 중복 회피)
    await expect(dialog.getByText("㉠ 예입원금", { exact: true })).toBeVisible();
    await expect(dialog.getByText("㉡ 미수이자", { exact: true })).toBeVisible();
    await expect(dialog.getByText("㉢ 원천징수세액", { exact: true })).toBeVisible();

    // 입력
    await dialog.getByTestId(/savings-principal-/).fill("1000000000");
    await dialog.getByTestId(/savings-accrued-interest-/).fill("38356164");
    await dialog.getByTestId(/savings-withholding-tax-/).fill("5969588");

    // 직접 입력 미리보기 표시 확인
    await expect(dialog.getByText(/미리보기/)).toBeVisible();
  });
});
