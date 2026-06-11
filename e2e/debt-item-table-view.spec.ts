/**
 * E2E: 상속세 — 채무·공과·장례비 항목 카드 → 요약 테이블 + 편집 모달 전환
 *
 * 검증: Step2 협의분할 모드 토글 ON → 카테고리별 추가 버튼 → 항목 생성 +
 *       편집 모달 자동 오픈(E-1) → 이름·금액·분배 입력 → 닫기 → 행 요약(이름·금액·✓ 배지) →
 *       행 클릭 재편집 → 모달 내 삭제 → 행 소멸(E-2).
 *
 * 계획: docs/02-design/features/debt-item-table-view.plan.md §6 단계 5
 */
import { test, expect, type Page } from "@playwright/test";
import { addHeir } from "./_helpers/tax-flow";

/** Step0 상속개시일 + 상속인(배우자) → Step1 건너뛰고 Step2(비과세·장례비)로 이동 */
async function gotoDebtAllocationMode(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2023");
  await page.getByLabel("월").first().fill("3");
  await page.getByLabel("일").first().fill("10");
  await addHeir(page, "heir", "spouse");
  // 단계 네비게이션 버튼으로 비과세·장례비 단계 직접 이동 (자산 미입력 — 채무만 검증)
  await page.getByRole("button", { name: "비과세·장례비 단계로 이동" }).click();
  // 협의분할 모드 토글 ON
  await page.getByText("채무·공과·장례비 협의분할 입력").click();
}

test.describe("채무·공과·장례비 테이블 + 모달", () => {
  test("공과금 추가 → 모달 자동 오픈 → 입력 → 행 요약 + 분배 ✓ 배지 → 재편집 → 삭제", async ({
    page,
  }) => {
    await gotoDebtAllocationMode(page);

    // 카테고리별 추가 버튼 영역 확인
    await expect(page.getByTestId("debt-add-buttons")).toBeVisible();

    // [공과금 추가] → 항목 생성 + 편집 모달 자동 오픈 (E-1)
    await page.getByRole("button", { name: /공과금 추가/ }).click();
    const dialog = page.getByTestId("debt-edit-dialog");
    await expect(dialog).toBeVisible();
    await expect(page.getByText("공과금 편집")).toBeVisible();

    // 이름·금액 입력
    await dialog.getByPlaceholder("채권자·내용").fill("주택분 재산세");
    await dialog.getByPlaceholder("금액").fill("2500000");

    // 협의분할 — 배우자 칩 선택 → 잔여(전액) 자동 채움
    await dialog.getByRole("button", { name: /배우자/ }).first().click();

    // 모달 닫기
    await page.getByRole("button", { name: "닫기" }).click();
    await expect(dialog).toBeHidden();

    // 행 요약 — 이름·금액·✓ 분배 배지 (read-only)
    const row = page.locator('tr[role="button"]').first();
    await expect(row).toContainText("주택분 재산세");
    await expect(row).toContainText("2,500,000");
    await expect(row).toContainText("✓");

    // 행 클릭 → 재편집 모달
    await row.click();
    const dialog2 = page.getByTestId("debt-edit-dialog");
    await expect(dialog2).toBeVisible();
    await expect(dialog2.getByPlaceholder("채권자·내용")).toHaveValue("주택분 재산세");

    // 모달 내 삭제 → 행 소멸 (E-2 — 삭제 행 선택 중이면 모달 자동 닫힘)
    await page.getByRole("button", { name: "삭제" }).click();
    await expect(page.getByTestId("debt-edit-dialog")).toBeHidden();
    await expect(page.locator('tr[role="button"]')).toHaveCount(0);
  });

  test("장례비 봉안 항목 추가 → 행에 봉안 배지", async ({ page }) => {
    await gotoDebtAllocationMode(page);

    await page.getByRole("button", { name: /장례비 추가/ }).click();
    const dialog = page.getByTestId("debt-edit-dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByPlaceholder("채권자·내용").fill("봉안시설 사용료");
    await dialog.getByPlaceholder("금액").fill("5000000");
    // 봉안시설 사용료 토글 ON
    await dialog.getByRole("switch", { name: /봉안시설 사용료/ }).click();

    await page.getByRole("button", { name: "닫기" }).click();

    const row = page.locator('tr[role="button"]').first();
    await expect(row).toContainText("봉안시설 사용료");
    await expect(row).toContainText("봉안");
  });
});
