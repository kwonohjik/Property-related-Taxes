/**
 * E2E: 자산 카드 → 요약 테이블 + 편집 모달 전환 (신규 기능 spec)
 *
 * 설계: docs/02-design/features/estate-asset-table-view.{plan,ui.design}.md
 *
 * 시나리오:
 *   AT-1: 상속재산(토지) 추가 → 편집 모달 자동 오픈(E-1)·입력·닫기 → 요약 테이블 행 표시 →
 *         행 클릭 → 모달 재오픈 → 모달 안 삭제 → 모달 닫힘 + 행 제거(E-2)
 *   AT-2: 증여세 모드 — 분류·옵션 컬럼 미표시(4컬럼 자동 축소)
 *   AT-3: 추정상속재산 §15 — 추가 → 모달 자동 오픈 → 닫기 → 테이블 행 → 삭제
 *
 * 정책: [[feedback_browser_verify_with_playwright]] — spec 통과로 브라우저 확인 충족
 */

import { test, expect, type Page } from "@playwright/test";
import { addHeir, addLandAsset, closeHeirEditModal } from "./_helpers/tax-flow";

/** 상속세 Step0(상속개시일 + 자녀 1명) → Step1 이동 */
async function gotoInheritanceStep1(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2026");
  await page.getByLabel("월").first().fill("5");
  await page.getByLabel("일").first().fill("15");
  await addHeir(page, "heir", "child");
  await closeHeirEditModal(page); // 상속인 편집 모달 자동 오픈 → 닫고 다음 단계로
  await page.getByRole("button", { name: /^다음/ }).click();
}

test.describe("AT: 자산 카드 테이블 + 편집 모달", () => {
  test("AT-1: 토지 추가 → 모달 자동오픈·닫기 → 테이블 행 → 행 클릭 재오픈 → 삭제 → 행 제거", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await gotoInheritanceStep1(page);

    // 추가 → 모달 자동 오픈(E-1) → 면적·공시지가 입력 → 닫기 (헬퍼 내장)
    await addLandAsset(page, { area: "300", unitPrice: "1000000" });

    // 요약 테이블 행 표시 — 종류 "토지" + 평가액 3억(300㎡ × 100만)
    const row = page.locator('[data-testid^="estate-table-row-"]').first();
    await expect(row).toBeVisible();
    await expect(row).toContainText("토지");
    await expect(row).toContainText("300,000,000");

    // 행 클릭 → 편집 모달 재오픈
    await row.click();
    await expect(page.getByTestId("estate-edit-dialog")).toBeVisible();

    // 모달 안 삭제 → 모달 닫힘 + 행 제거 (E-2)
    await page.locator('[data-testid^="estate-card-remove-"]').first().click();
    await expect(page.getByTestId("estate-edit-dialog")).toBeHidden();
    await expect(page.locator('[data-testid^="estate-table-row-"]')).toHaveCount(0);
  });

  test("AT-2: 증여세 모드 — 분류·옵션 컬럼 미표시 (4컬럼)", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/calc/gift-tax");
    await page.getByLabel("연도").first().fill("2024");
    await page.getByLabel("월").first().fill("6");
    await page.getByLabel("일").first().fill("10");
    await page.getByRole("button", { name: /^다음/ }).click();

    await addLandAsset(page, {
      area: "300",
      unitPrice: "1000000",
      addButtonName: /증여재산 추가/,
    });

    const table = page.locator('[role="group"][aria-label="증여재산 목록"]');
    await expect(table).toBeVisible();
    await expect(table).toContainText("종류");
    await expect(table).toContainText("평가액");
    // 증여는 분류·옵션 컬럼 미표시 (resolveChips가 평가액 칩만 반환 → 컬럼 자동 생략)
    await expect(table.getByRole("columnheader", { name: "분류·옵션" })).toHaveCount(0);
  });

  test("AT-3: 추정상속재산 §15 — 추가 → 모달 자동오픈 → 닫기 → 테이블 행 → 삭제", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await gotoInheritanceStep1(page);

    // 추정상속재산 §15 그룹의 카테고리 추가 버튼 (부동산 처분)
    await page
      .getByRole("button", { name: /부동산 및 부동산권리 처분/ })
      .click();

    // 편집 모달 자동 오픈
    await expect(page.getByTestId("presumed-edit-dialog")).toBeVisible();

    // 닫기 → 요약 테이블 행
    await page.getByRole("dialog").getByRole("button", { name: "닫기" }).click();
    const row = page.locator('[data-testid^="presumed-table-row-"]').first();
    await expect(row).toBeVisible();
    await expect(row).toContainText("부동산");

    // 행 클릭 → 재오픈 → 삭제 → 행 제거
    await row.click();
    await expect(page.getByTestId("presumed-edit-dialog")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "삭제" }).click();
    await expect(page.locator('[data-testid^="presumed-table-row-"]')).toHaveCount(0);
  });
});
