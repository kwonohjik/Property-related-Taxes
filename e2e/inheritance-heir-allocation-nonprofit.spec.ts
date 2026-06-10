/**
 * E2E: 협의분할 비영리법인 노출 + 기본값 제거(미선택) + 2열 배치
 *
 * 계획서: docs/01-plan/inheritance-heir-allocation-nonprofit-default-layout.plan.md
 * 설계:   docs/02-design/features/inheritance-heir-allocation-nonprofit-default-layout.ui.design.md
 *
 * 시나리오:
 *   N-1: 자녀 + 비영리법인 등록 → 토지 자산 협의분할 칩 클릭 →
 *        (이슈1) 비영리법인 칩 노출
 *        (이슈2) ON 직후 아무도 미선택(분배 금액 input 0개)
 *        (이슈3) 2열 그리드 레이아웃
 *        → 비영리법인 칩 클릭 시 평가액 전액 자동입력
 *
 * 정책: [[feedback_browser_verify_with_playwright]] — spec 통과로 브라우저 확인 충족
 */

import { test, expect } from "@playwright/test";
import { fillDateAndVerify, addLandAsset,
  addHeir,
  closeHeirEditModal,
} from "./_helpers/tax-flow";

test.describe("협의분할 — 비영리법인 노출·기본값 제거·2열", () => {
  test("N-1: 비영리법인 노출 + ON 미선택 + 칩 선택 시 전액", async ({ page }) => {
    await page.goto("/calc/inheritance-tax");

    // 상속개시일
    await fillDateAndVerify(page, { year: "2024", month: "6", day: "10" });

    // 자녀 추가 (addHeir가 모달 안 주민번호 입력 + 닫기까지 수행)
    await addHeir(page, "heir", "child");

    // 법인 추가 → 모달 유지(keepModalOpen)하여 영리법인 여부 토글 OFF(비영리법인) → 닫기
    await addHeir(page, "corporate", undefined, { keepModalOpen: true });
    await page
      .locator('[data-slot="toggle-card"]')
      .filter({ hasText: "영리법인 여부" })
      .getByRole("switch")
      .click();
    await closeHeirEditModal(page);

    // Step1 (상속재산)
    await page.getByRole("button", { name: /^다음/ }).click();

    // 토지 자산 추가 (면적 300 × 공시지가 1,000,000 = 3억)
    await addLandAsset(page, { area: "300", unitPrice: "1000000" });

    // 협의분할 칩 클릭 → 인라인 패널 ON (heirAllocations=[] 빈 배열)
    const allocChip = page.locator(
      '[data-testid^="estate-chip-heir-allocation-"]',
    );
    await expect(allocChip.first()).toBeVisible();
    await allocChip.first().click();

    // 협의분할 입력 행 컨테이너
    const rows = page.getByTestId("heir-allocation-rows");
    await expect(rows).toBeVisible();

    // (이슈3) 2열 그리드
    await expect(rows).toHaveClass(/sm:grid-cols-2/);

    // (이슈1) 비영리법인 칩 노출 — heirShortLabel "법인"
    await expect(rows.getByRole("button", { name: /법인/ })).toBeVisible();

    // (이슈2) ON 직후 아무도 미선택 → 분배 금액 input 0개
    await expect(page.getByPlaceholder("분배 금액")).toHaveCount(0);

    // 비영리법인 칩 클릭 → 분배 금액 input 등장 + 평가액 전액(300,000,000)
    await rows.getByRole("button", { name: /법인/ }).click();
    const amountInput = page.getByPlaceholder("분배 금액");
    await expect(amountInput).toHaveCount(1);
    await expect(amountInput).toHaveValue(/300,000,000/);
  });
});
