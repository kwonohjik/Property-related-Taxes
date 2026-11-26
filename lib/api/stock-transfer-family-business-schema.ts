/**
 * ⑫ 주식 양도 — 가업상속공제 자산 취득가액 특례(소득세법 §97의2④) Zod 입력 객체
 *
 * 단건(`stockTransferInputSchema.familyBusinessInheritance`)과 취득 lot
 * (`acquisitionLotSchema.familyBusinessInheritance`)이 **같은 객체**를 쓴다 — 엔진 타입 `StockFamilyBusinessInput`과 1:1.
 * 계획서: docs/02-design/features/fb-97-2-4-fixes.plan.md §7.1·§7.4(⑫)·§7.7
 *
 * 🔴 여기에 정의가 없으면 body에 실어도 Zod가 **침묵 strip**해 엔진에 도달하지 않는다(TypeScript 미감지).
 *
 * 값의 정합(정수·0 이상·분모 0·분자 > 분모·양도일 시대와 법정량 종류·상속 원인·실가 모드)은 여기서 `.int()` 등으로
 * 걸지 않는다 — 그러면 엔진·⑧과 문구가 갈라진다. 같은 술어(`stock-family-business-input-check.ts`)를 부르는
 * ⑩ refine(`stock-transfer-tax-refines-family-business.ts`)이 맡는다. 주식은 법인가업 대상 자산이라 `kind` 두 갈래 모두 받는다
 * (양도일 시대가 어느 쪽을 허용하는지는 술어가 본다). % 직접 입력은 없다(계획서 Q-7).
 */

import { z } from "zod";

export const stockFamilyBusinessInputSchema = z.object({
  /** 피상속인의 1주당 취득가액 — §97의2④1호 「제97조제1항제1호에 따른 금액」 */
  decedentAcquisitionPricePerShare: z.number(),
  /** 피상속인 자본적지출 총액(선택) — lot은 lot 전체 주식수 기준 총액 */
  decedentCapitalExpenditure: z.number().optional(),
  /** 가업상속공제적용률 법정량 — 소령 §163의2③ */
  fbRateBasis: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("deduction_ratio"),
      deductionAmount: z.number(),
      businessEstateValue: z.number(),
    }),
    z.object({
      kind: z.literal("corporate_business_assets"),
      totalAssets: z.number(),
      nonBusinessAssets: z.number(),
    }),
  ]),
});
