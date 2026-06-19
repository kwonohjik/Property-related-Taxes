import { test, expect, type Page } from "@playwright/test";

/**
 * E2E: 증여이익 계산기 — 의제 유형 상세 입력 모달 전환 (2026-06-19, E2E_PORT=3105)
 * 계획서: docs/00-pm/gift-deemed-detail-modal.plan.md · UI 설계: docs/02-design/features/gift-deemed-detail-modal.ui.design.md
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_e2e_worktree_port_isolation]]
 *
 * 유형 선택 → 모달 자동 오픈(증여일+상세) → 확인 닫기 → 요약 카드 → 계산.
 * 검증 실패 시 모달 자동 재오픈(D7) + 모달 내부 에러(deemed-detail-error).
 */

// 증여일은 모달 안에 있으므로 다이얼로그로 스코프 한정.
// (page 스코프 getByLabel("일")은 "정산기준일" 설명을 가진 listing_gain 라디오를 오매칭함)
async function fillGiftDate(page: Page) {
  const dialog = page.getByTestId("deemed-detail-dialog");
  await dialog.getByLabel("연도").fill("2025");
  await dialog.getByLabel("월").fill("3");
  await dialog.getByLabel("일", { exact: true }).fill("15");
}

test.describe("증여이익 계산기 — 상세 입력 모달", () => {
  test("M-1: 유형 선택 → 모달 오픈 → 입력 → 닫기 → 요약 카드 → 계산", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/calc/gift-deemed");

    // 유형 선택 → 모달 자동 오픈
    await page.getByTestId("deemed-type-bargain_transfer").click();
    await expect(page.getByTestId("deemed-detail-dialog")).toBeVisible();

    // 증여일 + 상세는 모달 안에서 입력
    await fillGiftDate(page);
    await page.getByPlaceholder("시가 (원)").fill("1000000000");
    await page.getByPlaceholder("거래대가 (원)").fill("600000000");

    // 확인 닫기 → 요약 카드
    await page.getByTestId("deemed-detail-confirm").click();
    await expect(page.getByTestId("deemed-detail-dialog")).toBeHidden();
    await expect(page.getByTestId("deemed-summary-card")).toContainText("저가양수·고가양도");
    await expect(page.getByTestId("deemed-summary-card")).toContainText("2025-03-15");

    // 계산
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("100,000,000");
  });

  test("M-2: [수정] 버튼 → 모달 재오픈 + 기존 입력 보존", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/calc/gift-deemed");
    await page.getByTestId("deemed-type-bargain_transfer").click();
    await fillGiftDate(page);
    await page.getByPlaceholder("시가 (원)").fill("1000000000");
    await page.getByTestId("deemed-detail-confirm").click();
    await expect(page.getByTestId("deemed-detail-dialog")).toBeHidden();

    // 수정 → 재오픈 + 시가 값 보존
    await page.getByTestId("deemed-edit-btn").click();
    await expect(page.getByTestId("deemed-detail-dialog")).toBeVisible();
    await expect(page.getByPlaceholder("시가 (원)")).toHaveValue(/1,000,000,000/);
  });

  test("M-3: 다른 유형 라디오 선택 → 새 유형으로 모달 재오픈", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/calc/gift-deemed");
    await page.getByTestId("deemed-type-bargain_transfer").click();
    await expect(page.getByTestId("deemed-detail-dialog")).toBeVisible();
    await page.getByTestId("deemed-detail-confirm").click();
    await expect(page.getByTestId("deemed-detail-dialog")).toBeHidden();

    // 다른 유형 선택 → onChange 발화 → 보험금 필드로 재오픈
    await page.getByTestId("deemed-type-insurance").click();
    await expect(page.getByTestId("deemed-detail-dialog")).toBeVisible();
    await expect(page.getByPlaceholder("보험금 (원)")).toBeVisible();
  });

  test("M-4: 증여일 미입력 후 계산 → 모달 자동 재오픈 + 모달 내 에러(D7)", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/calc/gift-deemed");
    await page.getByTestId("deemed-type-bargain_transfer").click();
    // 증여일 미입력, 상세만 채우고 닫기
    await page.getByPlaceholder("시가 (원)").fill("1000000000");
    await page.getByPlaceholder("거래대가 (원)").fill("600000000");
    await page.getByTestId("deemed-detail-confirm").click();
    await expect(page.getByTestId("deemed-detail-dialog")).toBeHidden();

    // 계산 → 검증 실패 → 모달 재오픈 + 모달 내 에러
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-detail-dialog")).toBeVisible();
    await expect(page.getByTestId("deemed-detail-error")).toContainText("증여일");
  });
});
