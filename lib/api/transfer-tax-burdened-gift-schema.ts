/**
 * 부담부증여 입력 Zod 스키마 (소령 §159).
 *
 * 14개 동기화 지점 ⑫(Zod 객체 정의) — 침묵 stripping 차단.
 * transfer-tax-schema.ts에서 import하여 propertyBaseShape에 부착.
 */

import { z } from "zod";

export const burdenedGiftInfoSchema = z.object({
  /** 양도(증여)시 평가 모드. */
  valuationMode: z.enum(["sangjeungbeop_standard", "sangjeungbeop_market"]),
  /** 임대보증금 총액 (채무로 인수). */
  lendingDepositTotal: z.number().int().nonnegative(),
  /** 담보차입금 (채무로 인수, 실제 채무잔액). */
  mortgageDebtAmount: z.number().int().nonnegative(),
  /** 연간 임대료 (환산평가용 — 채무 아님). */
  annualRentTotal: z.number().int().nonnegative(),
  /** (근)저당 설정액 — 미입력 시 mortgageDebtAmount fallback. */
  mortgageSetAmount: z.number().int().nonnegative().optional(),
  /** 시가 모드 양도시 평가액 (총액). sangjeungbeop_market 시 필수. */
  marketValueAtTransfer: z.number().int().nonnegative().optional(),
  /** 시가 모드 취득시 평가액 (총액, legacy backward-compat). */
  marketValueAtAcquisition: z.number().int().nonnegative().optional(),
  /** [신설] 취득가액 산정방식 (K-4 실지·K-5 환산). 시가 모드 시 필수. */
  acquisitionMethod: z.enum(["actual", "converted"]).optional(),
  /** [신설] K-4 실지취득가액 — 토지. */
  actualLandAcquisitionPrice: z.number().int().nonnegative().optional(),
  /** [신설] K-4 실지취득가액 — 건물. */
  actualBuildingAcquisitionPrice: z.number().int().nonnegative().optional(),
  /** [신설] K-4 실지취득가액 — 단일자산. */
  actualAcquisitionTotal: z.number().int().nonnegative().optional(),
  /** 양도시 토지 기준시가 (개별공시지가 × 면적). */
  landStdPriceAtTransfer: z.number().int().nonnegative(),
  /** 양도시 건물 기준시가 합계 (층별 합계). */
  buildingStdPriceAtTransfer: z.number().int().nonnegative(),
  /** 취득시 토지 기준시가. */
  landStdPriceAtAcquisition: z.number().int().nonnegative(),
  /** 취득시 건물 기준시가. */
  buildingStdPriceAtAcquisition: z.number().int().nonnegative(),
  /**
   * 증여재산 평가용 양도시 건물 기준시가 (상증법 §61 — 층별 가감율 적용).
   * 미입력 시 양도세용 buildingStdPriceAtTransfer fallback.
   */
  giftBuildingStdPriceAtTransfer: z.number().int().nonnegative().optional(),
  // Phase 3 (2026-05-12): 증여세 통합 입력
  /** 증여자-수증자 관계 (상증법 §53 증여재산공제). */
  donorRelation: z
    .enum([
      "spouse",
      "lineal_ascendant_adult",
      "lineal_ascendant_minor",
      "lineal_descendant",
      "other_relative",
    ])
    .optional(),
  /** 수증자 미성년 여부 (세대생략 20억 초과 40% 판정). */
  isMinorDonee: z.boolean().optional(),
  /** 세대생략 증여 여부 (§57). */
  isGenerationSkip: z.boolean().optional(),
  /** 법정신고기한 내 신고 여부 (§69 신고세액공제 3%). */
  isFiledOnTime: z.boolean().optional(),
  /** 10년 이내 사전증여 내역 (상증법 §47②·§58). 동일 증여자→동일 수증자. */
  priorGiftsWithin10Years: z
    .array(
      z.object({
        giftDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        giftAmount: z.number().int().nonnegative(),
        giftTaxPaid: z.number().int().nonnegative(),
        // §58 Phase A 안분 (PR3) — 당시 산출세액·과세표준
        computedTax: z.number().int().nonnegative().optional(),
        giftTaxBase: z.number().int().nonnegative().optional(),
      }),
    )
    .optional(),
});

export type BurdenedGiftInfoSchema = z.infer<typeof burdenedGiftInfoSchema>;
