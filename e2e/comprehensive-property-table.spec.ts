import { test, expect, type Page } from "@playwright/test";

/**
 * 종합부동산세 주택분 — 요약 테이블 + 편집 모달 전환 E2E (신규)
 *
 * 카드 나열 → 테이블(행 클릭) + Dialog 모달(PropertyCardEditor) 구조 검증.
 * 상속재산 estate-asset-table-view.spec.ts와 동일한 행/모달 패턴.
 *
 * - PT-1: 주택 행 클릭 → 모달 입력 → 닫기 → 테이블 반영 → 계산
 * - PT-2: 주택 추가 → 모달 자동 오픈(E-1) → 2건 테이블
 * - PT-3: 모달 삭제 → 행 제거(E-2)
 * - PT-4: 고급 옵션 펼침 → 합산배제 선택 → 테이블 합산배제 컬럼 반영
 *
 * worktree: E2E_PORT=3100 npx playwright test e2e/comprehensive-property-table.spec.ts
 */

const PAGE = "/calc/comprehensive-tax";
const ROW = '[data-testid^="property-table-row-"]';

async function clickNext(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^다음/ }).click();
}

async function gotoStep2(page: Page): Promise<void> {
  await page.goto(PAGE);
  await page.getByRole("radio", { name: "2024" }).check();
  await clickNext(page);
}

/** 모달 닫기 (footer 닫기 버튼) */
async function closeModal(page: Page): Promise<void> {
  await page.getByRole("dialog").getByRole("button", { name: "닫기" }).click();
  await expect(page.getByTestId("property-edit-dialog")).toBeHidden();
}

test.describe("종부세 주택 — 테이블+모달", () => {
  test("PT-1: 주택 행 클릭 → 모달 입력 → 테이블 반영 → 계산", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoStep2(page);

    // 첫 주택 행 클릭 → 모달 오픈
    await page.locator(ROW).first().click();
    await expect(page.getByTestId("property-edit-dialog")).toBeVisible();

    // 모달 안 공시가격(첫 "금액 입력") + 전용면적
    await page.getByPlaceholder("금액 입력").first().fill("950000000");
    await page.getByPlaceholder("0.00").first().fill("84");
    await closeModal(page);

    // 테이블 행에 공시가격 반영
    await expect(page.locator(ROW).first()).toContainText("950,000,000");

    // Step3(합산배제 없음) → Step4(토지 없음) → 계산
    await clickNext(page);
    await clickNext(page);
    const calcResponse = page.waitForResponse(
      (r) => r.url().includes("/api/calc/comprehensive") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: /계산하기/ }).click();
    const resp = await calcResponse;
    expect(resp.ok(), `계산 API 비정상 ${resp.status()}`).toBe(true);
    await expect(page.getByText(/과세표준/).first()).toBeVisible({ timeout: 30_000 });
  });

  test("PT-2: 주택 추가 → 모달 자동 오픈 → 2건 테이블", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep2(page);

    // 최초 1건
    await expect(page.locator(ROW)).toHaveCount(1);

    // 주택 추가 → 모달 자동 오픈(E-1)
    await page.getByRole("button", { name: /주택 추가/ }).click();
    await expect(page.getByTestId("property-edit-dialog")).toBeVisible();
    await page.getByPlaceholder("금액 입력").first().fill("300000000");
    await closeModal(page);

    // 2건 행
    await expect(page.locator(ROW)).toHaveCount(2);
  });

  test("PT-3: 모달 삭제 → 행 제거", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep2(page);

    // 주택 추가 → 2건
    await page.getByRole("button", { name: /주택 추가/ }).click();
    await expect(page.getByTestId("property-edit-dialog")).toBeVisible();
    await expect(page.locator(ROW)).toHaveCount(2);

    // 모달 안 삭제 → 자동 닫힘 + 1건
    await page.locator('[data-testid^="property-remove-"]').click();
    await expect(page.getByTestId("property-edit-dialog")).toBeHidden();
    await expect(page.locator(ROW)).toHaveCount(1);
  });

  test("PT-4: 고급 옵션 펼침 → 합산배제 선택 → 테이블 반영", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep2(page);

    await page.locator(ROW).first().click();
    await expect(page.getByTestId("property-edit-dialog")).toBeVisible();

    // 고급 옵션 펼치기
    await page.getByRole("dialog").getByRole("button", { name: /펼치기/ }).click();

    // 합산배제 신청 유형 select → 가정어린이집용
    await page
      .locator('select:has(option[value="daycare_housing"])')
      .selectOption("daycare_housing");
    await closeModal(page);

    // 테이블 합산배제 컬럼에 배지 반영
    await expect(page.locator(ROW).first()).toContainText("가정어린이집");
  });
});
