/**
 * ⑫ 가업상속공제 §97의2④ 의제 취득가액 입력 (소령 §163의2③) — 단건(base-shape)과 컴패니언(companionAssetSchema)이 **같은 객체**를 쓴다.
 * 두 곳이 갈리면 단건이 막는 입력을 컴패니언이 통과시킨다(transfer-fb-share 계획서 §12.3).
 * 금액(피상속인 취득가액·평가액·자본적지출)은 물건 전체(100%) 기준 — 엔진 STEP 0.42가 카드의 `ownershipRatio`로 줄인다.
 * ★ 침묵 stripping 차단: Zod 객체 정의가 없으면 route handler에서 자동 제거된다.
 */
import { z } from "zod";
import { familyBusinessRateBasisError } from "@/lib/tax-engine/family-business-applied-rate";

export const familyBusinessInheritanceSchema = z.object({
  decedentAcquisitionPrice: z.number().int().nonnegative(),
  inheritanceMarketValue: z.number().int().nonnegative(),
  fbDeductionAppliedRate: z.number().min(0).max(1),
  inheritanceDate: z.string().date(),
  decedentCapitalExpenditure: z.number().int().nonnegative().optional(),
  /**
   * F-3 적용률 법정량(소령 §163의2③ — 공제금액 ÷ 가업상속 재산가액). 부동산은 `deduction_ratio`만 —
   * 법인가업 대상 자산은 주식등이다(소령 §163의2④2호). 형식·정합은 ⑧과 같은 술어로 막는다.
   */
  fbRateBasis: z.object({
    kind: z.literal("deduction_ratio"),
    deductionAmount: z.number(),
    businessEstateValue: z.number(),
  }).optional(),
}).superRefine((fb, ctx) => {
  const msg = familyBusinessRateBasisError(fb.fbRateBasis, fb.fbDeductionAppliedRate);
  if (msg) ctx.addIssue({ code: "custom", path: ["fbRateBasis"], message: `가업상속공제 — ${msg}` });
});
