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
  /** 시가 모드 취득시 평가액 (총액). sangjeungbeop_market 시 필수. */
  marketValueAtAcquisition: z.number().int().nonnegative().optional(),
  /** 양도시 토지 기준시가 (개별공시지가 × 면적). */
  landStdPriceAtTransfer: z.number().int().nonnegative(),
  /** 양도시 건물 기준시가 합계 (층별 합계). */
  buildingStdPriceAtTransfer: z.number().int().nonnegative(),
  /** 취득시 토지 기준시가. */
  landStdPriceAtAcquisition: z.number().int().nonnegative(),
  /** 취득시 건물 기준시가. */
  buildingStdPriceAtAcquisition: z.number().int().nonnegative(),
});

export type BurdenedGiftInfoSchema = z.infer<typeof burdenedGiftInfoSchema>;
