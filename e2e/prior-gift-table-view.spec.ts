/**
 * E2E: 사전증여 테이블 + 편집 모달 전환 (prior-gift-table-view, 2026-06-13)
 *
 * 계획서: docs/02-design/features/prior-gift-table-view.plan.md §6 P5
 * 정책: [[feedback_browser_verify_with_playwright]]
 *
 * 카드 나열 → 요약 테이블 + 행 클릭 Dialog 모달 전환의 핵심 신규 동작 검증:
 *   PT-1: 2건 추가 → 테이블 2행 렌더 + 영리법인 행 배지 + 수증자 라벨
 *   PT-2: 기존 행 재클릭 → 편집 모달 재오픈 + 입력값 유지 (index 기반 선택)
 *
 * (배지 derive 8케이스·수증자 5케이스는 컴포넌트 anchor
 *  __tests__/components/prior-gift-table-view.test.tsx 에서 단위 검증)
 */

import { test, expect, type Page } from "@playwright/test";
import {
  addHeir,
  addLandAsset,
  closePriorGiftModal,
} from "./_helpers/tax-flow";

/** Step0(자녀+영리법인) → Step3(사전증여)까지 이동 */
async function gotoStep3(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2024");
  await page.getByLabel("월").first().fill("6");
  await page.getByLabel("일").first().fill("10");
  await addHeir(page, "heir", "child");
  await addHeir(page, "corporate");
  await page.getByRole("button", { name: /^다음/ }).click(); // → Step1
  await addLandAsset(page, { area: "300", unitPrice: "1000000" });
  await page.getByRole("button", { name: /^다음/ }).click(); // → Step2
  await page.getByRole("button", { name: /^다음/ }).click(); // → Step3
}

/** 사전증여 1건 추가 (모달 자동 오픈) + 가액·수증자 입력 후 닫기. doneeIndex: select option index */
async function addGiftAndClose(page: Page, amount: string, doneeIndex: number) {
  await page.getByRole("button", { name: /사전증여 추가/ }).click();
  const dialog = page.getByTestId("prior-gift-edit-dialog");
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await dialog.getByRole("textbox", { name: "연도" }).fill("2021");
  await dialog.getByRole("textbox", { name: "월" }).fill("8");
  await dialog.getByRole("textbox", { name: "일" }).fill("10");
  const amountInput = dialog.getByPlaceholder("금액 입력").first();
  await amountInput.fill(amount);
  await amountInput.press("Tab");
  await dialog.getByTestId("gift-donee-select").selectOption({ index: doneeIndex });
  await closePriorGiftModal(page);
}

test.describe("사전증여 테이블 + 편집 모달", () => {
  test("PT-1: 2건 추가 → 테이블 2행 + 영리법인 배지 표시", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoStep3(page);

    // 1건: 자녀 수증 (option index 1)
    await addGiftAndClose(page, "250000000", 1);
    // 2건: 영리법인 수증 (option index 2)
    await addGiftAndClose(page, "700000000", 2);

    // 테이블 2행 렌더 (index 기반 testid)
    await expect(page.getByTestId("prior-gift-table-row-0")).toBeVisible();
    await expect(page.getByTestId("prior-gift-table-row-1")).toBeVisible();

    // 영리법인 행(2건째)에 "🏢 영리법인" 배지
    await expect(
      page.getByTestId("prior-gift-table-row-1").getByText("🏢 영리법인"),
    ).toBeVisible();

    // 수증자 라벨 (자녀 행)
    await expect(
      page.getByTestId("prior-gift-table-row-0").getByText("자녀"),
    ).toBeVisible();
  });

  test("PT-2: 기존 행 재클릭 → 편집 모달 재오픈 + 입력값 유지", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoStep3(page);

    await addGiftAndClose(page, "250000000", 1);

    // 모달 닫힌 상태 확인
    await expect(page.getByTestId("prior-gift-edit-dialog")).toHaveCount(0);

    // 행 클릭 → 편집 모달 재오픈
    await page.getByTestId("prior-gift-table-row-0").click();
    const dialog = page.getByTestId("prior-gift-edit-dialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // 입력값 유지 — 증여재산가액 25,000만
    await expect(dialog.getByPlaceholder("금액 입력").first()).toHaveValue(
      /250,?000,?000/,
    );

    await closePriorGiftModal(page);
    await expect(page.getByTestId("prior-gift-edit-dialog")).toHaveCount(0);
  });
});
