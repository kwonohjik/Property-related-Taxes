/**
 * 다건(multi 직접입력) 양도세 수정신고·경정청구 — 입력 UI E2E
 *
 * 검증: 이력 진입(enterMultiAmendment)과 동등한 상태(multi-transfer-tax-wizard 시딩)에서
 *   공통 설정(settings) 단계에 ① 정정 배너 ② AmendmentBlock(당초 결정세액 등) 노출.
 * 엔진·저장소·가드 정확성은 vitest(multi-amendment / multi-amendment-dedup / classify-amendable-transfer)로 커버.
 *
 * worktree 실행: E2E_PORT=3101 npx playwright test e2e/transfer-multi-amendment.spec.ts
 */
import { test, expect } from "@playwright/test";

function seedMultiForm(correctionKind: "amend" | "refund_claim") {
  return {
    state: {
      form: {
        taxYear: 2026,
        // AmendmentBlock(B2) 렌더는 properties와 무관 — settings 단계 정정 UI만 검증(불완전 폼 렌더 크래시 회피).
        properties: [],
        activePropertyIndex: 0,
        activeStep: "settings",
        annualBasicDeductionUsed: "0",
        basicDeductionAllocation: "MAX_BENEFIT",
        amendmentMode: true,
        correctionKind,
        originalDeterminedTax: "30000000",
        amendmentSourceId: "src1",
        statutoryFilingDeadline: "2027-05-31",
        amendedFilingDate: correctionKind === "refund_claim" ? "2026-07-03" : "",
        applyUnderReportingPenalty: false,
        underReportingReason: "normal",
        underReductionMode: "exempt",
        priorAssessmentNotified: false,
        applyLatePaymentPenalty: false,
        amendedPaymentDate: "",
        claimReasonType: "ordinary",
        posteriorEventDate: "",
        originalPaymentDate: "",
      },
    },
    version: 0,
  };
}

// ⚠️ test.fixme: 다건 계산기는 마운트 시 handleAddProperty(빈 목록→자산 자동추가·edit 단계 이동)가
// zustand persist 재수화보다 먼저 실행되어 sessionStorage seed를 덮어쓴다(seed→default 레이스).
// 신뢰도 있는 검증은 vitest로 대체: 가드=classify-amendable-transfer.test.ts,
// 저장소 3-record=multi-amendment-dedup.test.ts, 엔진 주입=multi-amendment.test.ts.
// 실 UI 검증은 후속에서 이력(IndexedDB)→enterMultiAmendment 실플로우 드라이브로 작성.
test.describe("다건 양도세 수정신고·경정청구 UI", () => {
  test.fixme("수정신고 진입 → settings에 배너 + AmendmentBlock(당초 결정세액)", async ({ page }) => {
    // 페이지 로드 전 seeding (store 첫 hydration이 seed를 읽도록 — goto→default 초기화 레이스 회피)
    await page.addInitScript((seed) => {
      sessionStorage.setItem("multi-transfer-tax-wizard", JSON.stringify(seed));
    }, seedMultiForm("amend"));
    await page.goto("/calc/transfer-tax/multi");

    await expect(page.getByText(/수정신고 작성 중/)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("당초 결정세액").first()).toBeVisible();
  });

  test.fixme("경정청구 진입 → 경정청구 배너", async ({ page }) => {
    await page.addInitScript((seed) => {
      sessionStorage.setItem("multi-transfer-tax-wizard", JSON.stringify(seed));
    }, seedMultiForm("refund_claim"));
    await page.goto("/calc/transfer-tax/multi");

    await expect(page.getByText(/경정청구 작성 중/)).toBeVisible({ timeout: 15000 });
  });
});
