/**
 * E2E: 무체재산권 평가 — 특허권 (상증법 §64·상증령 §59⑤·상증규 §19②③④)
 *
 * 계획서: docs/00-pm/inheritance-gift-intangible-ip-valuation.plan.md
 * 설계: docs/02-design/features/inheritance-gift-intangible-ip-valuation.{engine,ui}.design.md
 *
 * 검증: 무체재산권 자산 카드 추가 → 권리종류·수입모드 RadioCardGroup + 잔존연수 자동 산정(§19③ 20년 한도).
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

test.describe("무체재산권 자산 카드 — 특허권 평가", () => {
  test("특허권 fixed 입력 → 권리·수입모드 위젯 + 잔존연수 자동 산정(20년 한도)", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoStep1WithChild(page);

    // 무체재산권 카드 추가 → 편집 모달
    await page.getByRole("button", { name: /재산 추가|상속재산 추가/ }).first().click();
    await page.getByText("무체재산권", { exact: true }).click();
    await expect(page.getByTestId("estate-edit-dialog")).toBeVisible();

    // 섹션 헤더
    await expect(page.getByText("무체재산권 평가").first()).toBeVisible();

    // ① 권리종류 = 특허권 (RadioCardGroup)
    await page.getByText("특허권", { exact: true }).click();
    // ② 수입모드 = 미래 확정수입
    await page.getByText("미래 확정수입", { exact: true }).click();

    // ③ 연수입 입력
    await page.getByTestId(/^intangible-ip-annual-income-/).fill("15000000");

    // 출원일 2015-07-01 (래퍼 div scope)
    const originWrap = page.getByTestId(/^intangible-ip-origin-date-/);
    await originWrap.getByLabel("연도").fill("2015");
    await originWrap.getByLabel("월").fill("7");
    await originWrap.getByLabel("일").fill("1");

    // 잔존연수 자동: 출원2015.7.1 + 20년 = 만료2035.7.1, 평가2026.5.15 → 9년
    await expect(page.getByTestId(/^intangible-ip-remaining-years-/)).toHaveValue("9");
    await expect(page.getByText(/자동 산정\s*9년/)).toBeVisible();
  });

  test("감정가액 모드 → 존속기간 필드 숨김", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep1WithChild(page);

    await page.getByRole("button", { name: /재산 추가|상속재산 추가/ }).first().click();
    await page.getByText("무체재산권", { exact: true }).click();
    await expect(page.getByTestId("estate-edit-dialog")).toBeVisible();

    await page.getByText("저작권", { exact: true }).click();
    await page.getByText("감정가액", { exact: true }).click();

    // 감정가액 필드 노출, 잔존연수·기산일 숨김
    await expect(page.getByTestId(/^intangible-ip-appraised-/)).toBeVisible();
    await expect(page.getByTestId(/^intangible-ip-remaining-years-/)).toHaveCount(0);
  });

  test("실용신안 avg3y → 직전3년 합계·연수 입력 + 잔존연수 자동", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep1WithChild(page);

    await page.getByRole("button", { name: /재산 추가|상속재산 추가/ }).first().click();
    await page.getByText("무체재산권", { exact: true }).click();
    await expect(page.getByTestId("estate-edit-dialog")).toBeVisible();

    await page.getByText("실용신안권", { exact: true }).click();
    await page.getByText("직전 3년 평균", { exact: true }).click();

    // avg3y 전용 필드 노출
    await page.getByTestId(/^intangible-ip-prior3y-total-/).fill("45000000");
    await page.getByTestId(/^intangible-ip-prior3y-years-/).fill("3");

    // 출원 2018.1.1 + 10년 = 만료 2028.1.1, 평가 2026.5.15 → 잔존 1년(floor)
    const originWrap = page.getByTestId(/^intangible-ip-origin-date-/);
    await originWrap.getByLabel("연도").fill("2018");
    await originWrap.getByLabel("월").fill("1");
    await originWrap.getByLabel("일").fill("1");

    await expect(page.getByTestId(/^intangible-ip-remaining-years-/)).toHaveValue("1");
  });

  test("저작권 fixed → 사망일 입력 + 잔존연수 20년 cap", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep1WithChild(page);

    await page.getByRole("button", { name: /재산 추가|상속재산 추가/ }).first().click();
    await page.getByText("무체재산권", { exact: true }).click();
    await expect(page.getByTestId("estate-edit-dialog")).toBeVisible();

    await page.getByText("저작권", { exact: true }).click();
    await page.getByText("미래 확정수입", { exact: true }).click();
    await page.getByTestId(/^intangible-ip-annual-income-/).fill("5000000");

    // 저작권은 출원일 대신 사망일 필드 노출
    const deathWrap = page.getByTestId(/^intangible-ip-author-death-date-/);
    await expect(deathWrap).toBeVisible();
    await deathWrap.getByLabel("연도").fill("2000");
    await deathWrap.getByLabel("월").fill("1");
    await deathWrap.getByLabel("일").fill("1");

    // 사망 2000 + 70년 = 만료 2070, 평가 2026 → 잔존 44 → 20년 cap (§19③)
    await expect(page.getByTestId(/^intangible-ip-remaining-years-/)).toHaveValue("20");
    await expect(page.getByText(/자동 산정\s*20년/)).toBeVisible();
  });
});
