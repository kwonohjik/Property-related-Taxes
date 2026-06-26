/**
 * E2E: 계산 결과 선택 출력 (증여세, PR-B1) — 화면 인쇄
 *
 * 검증:
 *   1. 결과 화면에 "출력 항목 선택" 패널 노출 + 기본 전체 미선택 → 인쇄 버튼 disabled
 *   2. "증여세 과세 요약" 1개 선택 → 인쇄 버튼 활성
 *   3. print 미디어 에뮬레이션 → 선택 섹션(tax-summary)은 보이고, 미선택(core-result)은 숨김
 *
 * 정책: [[feedback_browser_verify_with_playwright]] — claude-in-chrome·수동안내 금지, spec 통과로 충족.
 * 상세 단위는 vitest __tests__/print/gift-print-sections.test.ts 에 위임.
 */

import { test, expect, type Page } from "@playwright/test";
import {
  addLandAsset,
  calcAndWaitResult,
  fillDateAndVerify,
  nextSteps,
} from "./_helpers/tax-flow";

/** Step0: 증여일 (관계는 기본값 직계존속-성인) → 다음 */
async function fillStep0(page: Page) {
  await page.goto("/calc/gift-tax");
  await fillDateAndVerify(page, { year: "2024", month: "6", day: "10" });
  await page.getByRole("button", { name: /^다음/ }).click();
}

/** Step1: 토지(공시지가 1,000,000원/㎡ × 300㎡) + 자산명(증여세 §validateStep Step1 필수) */
async function addGiftLandAsset(page: Page) {
  // 자산명은 편집 모달 안에 있으므로 keepModalOpen으로 모달 유지 후 입력 → 직접 닫기.
  await addLandAsset(page, {
    area: "300",
    unitPrice: "1000000",
    addButtonName: /증여재산 추가/,
    keepModalOpen: true,
  });
  // 토지는 자산명 필수(cash·financial·deposit만 면제) — 모달 안 입력
  const editDialog = page.getByRole("dialog");
  await editDialog.getByPlaceholder(/본가 토지/).fill("본가 토지");
  await editDialog.getByRole("button", { name: "닫기" }).click();
  await expect(page.getByTestId("estate-edit-dialog")).toBeHidden();
}

/** Step2→3→계산 → 결과 대기 (증여세 4단계 마법사) */
async function proceedToResult(page: Page) {
  await nextSteps(page, 2); // Step1→2→3
  await calcAndWaitResult(page, { taxType: "gift" });
}

test.describe("계산 결과 선택 출력 (증여세) — 화면 인쇄", () => {
  test("SP-gift-1·2·3: 패널 노출 → 0건 가드 → 선택 시 print 가시성 토글", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await fillStep0(page);
    await addGiftLandAsset(page);
    await proceedToResult(page);

    // SP-gift-1: 선택 패널 노출 + 기본 전체 미선택 → 인쇄 버튼 disabled
    const panel = page.getByTestId("print-selection-panel");
    await expect(panel).toBeVisible();
    const printBtn = page.getByTestId("print-selected-button");
    await expect(printBtn).toBeDisabled();

    // SP-gift-2: "핵심 결과 (결정세액)" 항목 체크 → 버튼 활성
    //   (tax-summary는 신고서 양식과 중복이라 화면 카드 제거 → PDF 전용 섹션으로 전환됨)
    await panel.getByRole("checkbox", { name: "핵심 결과 (결정세액)" }).check();
    await expect(printBtn).toBeEnabled();

    // SP-gift-3: print 미디어 — 선택 섹션(core-result) 보이고, 미선택(valuation-form) 숨김
    await page.emulateMedia({ media: "print" });
    await expect(page.locator('[data-print-id="core-result"]')).toBeVisible();
    await expect(page.locator('[data-print-id="valuation-form"]')).toBeHidden();
    await page.emulateMedia({ media: "screen" });

    // 화면(screen)에서는 미선택 섹션도 그대로 보임 (화면 표시 불변 원칙)
    await expect(page.locator('[data-print-id="valuation-form"]')).toBeVisible();
  });
});
