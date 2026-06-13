/**
 * E2E: 주식·지분 목록 카드 → 요약 테이블 + 편집 모달 전환
 *
 * 설계: docs/02-design/features/stock-item-table-view.{plan,ui.design}.md
 *
 * ST-1: 상장+비상장 추가 → 요약 테이블 2행 렌더 (종류 셀·평가방식 배지)
 * ST-2: 행 클릭 → 모달 편집(ls-avg-price) → 닫기 → 재오픈 시 입력값 영속
 * ST-3: 추가 직후 모달 자동 오픈(E-1) → 푸터 삭제 → 모달 닫힘 + 행 제거(E-2)
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 */

import { test, expect, type Page } from "@playwright/test";
import { addHeir, closeHeirEditModal, closeStockModal } from "./_helpers/tax-flow";

/** 상속세 Step0(상속개시일 + 자녀 1명) → Step1(상속재산) 이동 */
async function gotoStockStep(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2026");
  await page.getByLabel("월").first().fill("5");
  await page.getByLabel("일").first().fill("15");
  await addHeir(page, "heir", "child");
  await closeHeirEditModal(page);
  await page.getByRole("button", { name: /^다음/ }).click();
}

/** 주식 추가 (헤더 버튼 → 카테고리) — 추가 직후 모달은 열린 상태로 둠 */
async function addStockOpen(page: Page, kind: "listed" | "unlisted") {
  await page.getByTestId("estate-add-header-stock").click();
  await page
    .getByText(kind === "listed" ? "상장주식" : "비상장주식", { exact: true })
    .click();
  await expect(page.getByTestId("stock-edit-dialog")).toBeVisible();
}

test.describe("주식·지분 목록 — 테이블 + 편집 모달", () => {
  test("ST-1: 상장+비상장 추가 → 요약 테이블 2행 렌더", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoStockStep(page);

    await addStockOpen(page, "listed");
    await closeStockModal(page);
    await addStockOpen(page, "unlisted");
    await closeStockModal(page);

    // 2행 렌더 (stock-card = tr 병기)
    await expect(page.getByTestId("stock-card")).toHaveCount(2);
    // 종류 셀 — 상장주식 / 비상장주식 (테이블 셀 텍스트)
    await expect(page.getByRole("cell", { name: /상장주식/ }).first()).toBeVisible();
    // 비상장 평가방식 배지(간편 기본)
    await expect(page.getByText("간편", { exact: true })).toBeVisible();
  });

  test("ST-2: 행 클릭 → 모달 편집 → 닫기 → 재오픈 시 입력값 영속", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoStockStep(page);

    await addStockOpen(page, "listed");
    // 모달 안 종가 평균 입력
    await page.getByTestId("ls-avg-price").fill("50000");
    await closeStockModal(page);

    // 행 클릭 → 모달 재오픈
    await page.getByTestId("stock-card").first().click();
    await expect(page.getByTestId("stock-edit-dialog")).toBeVisible();
    // 입력값 영속 (onUpdate 실시간 반영)
    await expect(page.getByTestId("ls-avg-price")).toHaveValue("50,000");
  });

  test("ST-3: 추가 직후 모달 자동 오픈 → 푸터 삭제 → 모달 닫힘 + 행 제거", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoStockStep(page);

    // 추가 직후 모달 자동 오픈(E-1)
    await addStockOpen(page, "unlisted");
    await expect(page.getByTestId("stock-card")).toHaveCount(1);

    // 모달 푸터 삭제 → 모달 닫힘(E-2) + 행 제거 (칩 헤더 noop 삭제는 hideRemove로 제거됨)
    await page.getByRole("dialog").getByRole("button", { name: "🗑 삭제" }).click();
    await expect(page.getByTestId("stock-edit-dialog")).toHaveCount(0);
    await expect(page.getByTestId("stock-card")).toHaveCount(0);
  });
});
