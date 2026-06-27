/**
 * E2E: §60² 가상화폐(가상자산) 평가 — UI 통합 검증
 *
 * 법령: 상증법 §65² → 상증령 §60²
 *   1호(고시사업장): 평가기준일 전·후 각 1개월 일평균가액의 평균액
 *   2호(그 밖): 거래일 일평균가액·종료시각 시세
 *   적용시기: 2022.1.1. 이후 상속개시·증여분 (부칙 1단서)
 *
 * 검증 케이스:
 *   TC-1: direct 모드 — 단가 50,000 × 수량 1.5 → 평가액 75,000 미리보기
 *   TC-2: timeseries 모드 — 1호 토글 ON + 거래일 [10,000·20,000] → 평균단가 15,000 표시
 *   TC-3: 부칙 게이트 — 평가기준일 2021년 → amber 안내(적용 대상 아님) 표시
 *
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_e2e_gift_modal_chip_switch_selectors]]
 */

import { test, expect, type Page } from "@playwright/test";
import { addHeir, closeHeirEditModal } from "./_helpers/tax-flow";

async function gotoInheritanceStep1(page: Page, year: string) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill(year);
  await page.getByLabel("월").first().fill("5");
  await page.getByLabel("일").first().fill("15");
  await addHeir(page, "heir", "child");
  await closeHeirEditModal(page);
  await page.getByRole("button", { name: /^다음/ }).click();
}

/** 상속재산 추가 → 가상화폐(가상자산) 선택 → 편집 모달 열기 */
async function addCryptoCardAndOpen(page: Page) {
  await page.getByRole("button", { name: /재산 추가|상속재산 추가/ }).first().click();
  await page.getByText("가상화폐 (가상자산)").first().click();
  await expect(page.getByTestId("estate-edit-dialog")).toBeVisible();
}

test.describe("§60² 가상자산 평가 UI — EstateBodyCryptoAsset", () => {
  test.setTimeout(60_000);

  test("TC-1: direct 모드 — 단가 × 수량 → 평가액 미리보기", async ({ page }) => {
    await gotoInheritanceStep1(page, "2026");
    await addCryptoCardAndOpen(page);

    const dialog = page.getByTestId("estate-edit-dialog");

    // 섹션 타이틀
    await expect(dialog.getByText("가상화폐(가상자산) 평가")).toBeVisible();

    // 평가 방법 RadioCardGroup — direct 기본 선택
    const directRadio = dialog.getByRole("radio", { name: /평가단가 직접입력/ });
    await expect(directRadio).toBeChecked();

    // 단가·수량 입력
    await dialog.getByTestId(/crypto-unit-price-/).fill("50000");
    await dialog.getByTestId(/crypto-quantity-/).fill("1.5");

    // 평가액 = 50,000 × 1.5 = 75,000 미리보기 (미리보기 고유 패턴 "= N 원")
    await expect(dialog.getByText(/= 75,000 원/)).toBeVisible();
  });

  test("TC-2: timeseries 모드 — 1호 토글 + 거래일 시계열 → 평균단가 표시", async ({ page }) => {
    await gotoInheritanceStep1(page, "2026");
    await addCryptoCardAndOpen(page);

    const dialog = page.getByTestId("estate-edit-dialog");

    // 일평균가액 시계열 모드 선택
    await dialog.getByRole("radio", { name: /일평균가액 시계열/ }).click();

    // 1호(고시사업장) 토글 — 기본 ON 확인 (ToggleCard = role switch)
    const listedSwitch = dialog.getByRole("switch", { name: /국세청 고시사업장/ });
    await expect(listedSwitch).toBeChecked();

    // 거래일 2건 추가 — [10,000 · 20,000]
    const addBtn = dialog.getByTestId(/crypto-daily-add-/);
    await addBtn.click();
    await dialog.getByTestId(/crypto-daily-price-.*-0$/).fill("10000");
    await addBtn.click();
    await dialog.getByTestId(/crypto-daily-price-.*-1$/).fill("20000");

    // 수량 입력
    await dialog.getByTestId(/crypto-quantity-/).fill("1");

    // 일평균가액의 평균액 = (10,000 + 20,000) / 2 = 15,000 표시 (미리보기 고유 "평균액: N 원")
    await expect(dialog.getByText(/일평균가액의 평균액: 15,000 원/)).toBeVisible();
  });

  test("TC-3: 부칙 게이트 — 2022.1.1. 이전 평가기준일 → 적용 대상 아님 안내", async ({ page }) => {
    await gotoInheritanceStep1(page, "2021");
    await addCryptoCardAndOpen(page);

    const dialog = page.getByTestId("estate-edit-dialog");

    // 부칙 안내 (amber) — §60² 평균평가 신설규정 적용 대상 아님
    await expect(
      dialog.getByText(/2022\.1\.1\. 이전.*적용 대상이 아닙니다/),
    ).toBeVisible();
  });
});
