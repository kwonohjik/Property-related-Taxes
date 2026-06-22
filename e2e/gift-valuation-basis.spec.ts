/**
 * E2E: 증여재산 평가 산출근거 카드 (결과탭)
 *
 * 검증:
 *   1. 결과탭에 "증여재산 평가 산출근거" 카드 + 자산명 노출
 *   2. 펼침 토글 → 엔진 breakdown 단계("토지 평가액") 표시
 *
 * 정책: [[feedback_browser_verify_with_playwright]] — claude-in-chrome·수동안내 금지, spec 통과로 충족.
 * 상세 단위는 vitest __tests__/components/calc/results/gift-valuation-basis-card.test.tsx 에 위임.
 */

import { test, expect } from "@playwright/test";
import {
  addLandAsset,
  calcAndWaitResult,
  fillDateAndVerify,
  nextSteps,
} from "./_helpers/tax-flow";

test.describe("증여재산 평가 산출근거 카드", () => {
  test("토지 — 카드 노출 + 펼침 시 breakdown 단계 표시", async ({ page }) => {
    test.setTimeout(90_000);

    // Step0: 증여일
    await page.goto("/calc/gift-tax");
    await fillDateAndVerify(page, { year: "2024", month: "6", day: "10" });
    await page.getByRole("button", { name: /^다음/ }).click();

    // Step1: 토지 (1,000,000원/㎡ × 300㎡ = 300,000,000) + 자산명
    //   자산 카드 테이블+모달 전환(2026-06-10) 이후 자산명 입력란은 편집 모달 안 → keepModalOpen.
    await addLandAsset(page, {
      area: "300",
      unitPrice: "1000000",
      addButtonName: /증여재산 추가/,
      keepModalOpen: true,
    });
    const editDialog = page.getByRole("dialog");
    await editDialog.getByPlaceholder(/본가 토지/).fill("본가 토지");
    await editDialog.getByRole("button", { name: "닫기" }).click();
    await expect(editDialog).toBeHidden();

    // Step2→3→계산
    await nextSteps(page, 2);
    await calcAndWaitResult(page, { taxType: "gift" });

    // 1) 카드 + 자산명 노출
    const card = page.getByTestId("gift-valuation-basis-card");
    await expect(card).toBeVisible();
    await expect(card.getByText("증여재산 평가 산출근거")).toBeVisible();
    await expect(card.getByText("본가 토지")).toBeVisible();

    // 2) 펼침 → breakdown 단계 표시
    await card.getByRole("button", { name: /펼치기/ }).first().click();
    await expect(card.getByText("토지 평가액")).toBeVisible();
  });
});
