/**
 * 증여세 입력 Zod superRefine 본문 (⑩) — `property-valuation-input.ts` 800줄 정책으로 분리(2026-11-28).
 *
 * `giftTaxInputSchema = giftTaxInputObjectSchema.superRefine(refineGiftTaxInput)`.
 * `giftSubFormSchema`가 같은 스키마라 동시증여 추가 건에도 그대로 적용된다.
 * 각 검사는 ⑧ `components/calc/gift-tax-form-validate.ts`와 같은 술어·문구다.
 */
import { z } from "zod";
import { refineGiftRequiredInputs } from "./inheritance-gift-required-refines";
import type { giftTaxInputObjectSchema } from "./property-valuation-input";
// 특례 귀속 가능 재산 종류 — 엔진 단일 진실 (UI ⑤·validateStep ⑧과 동일 헬퍼)
import {
  isSpecialTreatmentEligibleCategory,
  SPECIAL_TREATMENT_CATEGORY_BLOCK_REASON,
} from "@/lib/tax-engine/gift-special-stream";
import { findFamilyBusinessItemsMissingTotalAssets } from "@/lib/tax-engine/gift-family-business-asset-equivalent";
import { FAMILY_BUSINESS_TOTAL_ASSETS_MISSING_MESSAGE } from "@/lib/tax-engine/gift-family-business-asset-equivalent";
import type { AssetCategory } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
// 대납(代納) gross-up 차단 판정 — donorGroup=B 시 세대생략 할증 ↔ 대납 fold-back 미지원
import { getDonorGroup } from "@/lib/tax-engine/gift-prior-aggregation";

type GiftTaxInputData = z.infer<typeof giftTaxInputObjectSchema>;

export function refineGiftTaxInput(data: GiftTaxInputData, ctx: z.RefinementCtx): void {
  // 사전증여(§47② 합산)·외국납부세액 필수 입력 — ⑧ `gift-tax-form-validate.ts`와 같은 술어(2026-09-30).
  // 비우면 증여자 없는 회차는 합산에서 빠지고 동일 그룹 회차는 §58 한도가 0이 됐다(동일인 회차는 존재만 요구).
  refineGiftRequiredInputs(data, ctx);

  // T-12 (동기화 지점 ⑩): 조특법 특례 2-스트림 — 혼합 자산 귀속 미설정 차단
  // §30의5⑪: 창업자금 외 자산은 특례 스트림 과세가액에 §47② 합산 금지.
  // 혼합 증여(N≥2 자산)에서 특례 선택 시 isSpecialTreatmentAsset 명시 필수.
  const specialTreatment = data.creditInput?.specialTreatment;
  if (specialTreatment && data.giftItems.length >= 2) {
    const unassigned = data.giftItems.filter(
      (item) => item.isSpecialTreatmentAsset === undefined,
    );
    if (unassigned.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["giftItems"],
        message:
          `조특법 특례(${specialTreatment === "startup" ? "창업자금 §30의5" : "가업승계 §30의6"}) 선택 시 ` +
          `혼합 자산 ${data.giftItems.length}개 중 미귀속 자산 ${unassigned.length}개에 ` +
          `특례 귀속(isSpecialTreatmentAsset)을 명시해야 합니다 (§30의5⑪).`,
      });
    }
  }

  // 특례 귀속 자산 재산 종류 제약 (동기화 지점 ⑩ — R3 잔여 해소):
  //   startup — 소득세법 §94① 재산(부동산·주식) 제외 (조특령 §27의5①)
  //   family_business — 주식·출자지분만 (§30의6①)
  // 명시 태깅(true) + 단일 자산 자동 귀속(엔진 partition이 1개면 자동 특례) 모두 검사.
  // (주식 부담부증여 채무 입력이 생긴 뒤로 「특례 자산 + assumedDebtForGift」 조합은 가능하다 — 엔진이
  //  특례 자산 채무를 특례 과세가액에서 차감한다. 이 검사는 재산 종류만 막는다.)
  if (specialTreatment) {
    const effectiveSpecialItems =
      data.giftItems.length === 1
        ? data.giftItems
        : data.giftItems.filter(
            (item) => item.isSpecialTreatmentAsset === true,
          );
    const ineligible = effectiveSpecialItems.filter(
      (item) =>
        !isSpecialTreatmentEligibleCategory(
          item.category as AssetCategory,
          specialTreatment,
        ),
    );
    if (ineligible.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["giftItems"],
        message: `특례 귀속 불가 재산 ${ineligible.length}개 — ${SPECIAL_TREATMENT_CATEGORY_BLOCK_REASON[specialTreatment]}`,
      });
    }
  }

  // U-17 (⑩): 가업자산상당액(조특령 §27의6⑩) — 특례 주식의 법인 총자산 미입력 차단(자동 fallback 금지).
  //   ⑧ validateStep과 같은 엔진 술어·문구. giftSubFormSchema = giftTaxInputSchema라 동시증여 추가 건에도 적용된다.
  //   (Zod 출력은 날짜 필드가 string | Date라 EstateItem과 다르다 — 술어는 귀속·합산배제·총자산 필드만 읽는다)
  if (findFamilyBusinessItemsMissingTotalAssets(data.giftItems as EstateItem[], data.creditInput).length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["giftItems"],
      message: FAMILY_BUSINESS_TOTAL_ASSETS_MISSING_MESSAGE,
    });
  }

  // ──────────────────────────────────────────────────────────────
  // 대납(代納) gross-up 차단 조합 ⑫ (Zod superRefine)
  // ⑧ validateStep과 동일 메시지로 동기화
  // ──────────────────────────────────────────────────────────────
  if (data.donorPaysGiftTax === true) {
    // ⓐ 동시증여 + 대납 — 상증령 §46①2호 안분 ↔ 대납 fold-back 미지원
    if (data.deductionInput?.simultaneousGifts && data.deductionInput.simultaneousGifts.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["donorPaysGiftTax"],
        message: "동시증여와 대납(代納)은 현재 함께 계산할 수 없습니다.",
      });
    }
    // ⓑ 2-스트림 특례 + 대납 — aggregatedOrdinaryValue 주입 미지원
    if (data.creditInput?.specialTreatment) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["donorPaysGiftTax"],
        message: "가업·창업 특례(2-스트림)와 대납(代納)은 현재 함께 계산할 수 없습니다.",
      });
    }
    // ⓒ 세대생략(donorGroup=B) + 대납 — §57 grossGiftValue 조정 미구현
    if (getDonorGroup(data.donor) === "B") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["donorPaysGiftTax"],
        message: "세대생략 할증 대상 증여와 대납(代納)은 현재 함께 계산할 수 없습니다.",
      });
    }
  }
}
