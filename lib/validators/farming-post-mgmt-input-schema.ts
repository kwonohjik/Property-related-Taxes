/**
 * 영농상속공제 사후관리 추징 입력 스키마 — property-valuation-input.ts 800줄 정책 분리 (2026-06-07)
 *
 * F-7: §18의3④⑥ + 시행령 §16⑥⑦⑧
 * 외부 import 경로 보존: property-valuation-input.ts에서 re-export.
 */
import { z } from "zod";

export const farmingPostMgmtInputSchema = z.object({
  violation: z.enum([
    "asset_disposed",
    "farming_ceased",
    "tax_fraud_conviction",
    "accounting_fraud",
  ]),
  violationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식"),
  /** §18의3④ 5년 사후관리기간 기산 (상속개시일) */
  inheritanceStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식"),
  filingDeadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식"),
  baseTaxableAmount: z.number().nonnegative(),
  interestRate: z.number().min(0).max(1, "이자율은 소수(0~1) 형식 — 예: 0.029"),
  /** §16⑥ 정당사유 — violation ∈ {asset_disposed, farming_ceased}에만 적용 */
  justifiedReason: z
    .enum([
      "heir_death",
      "overseas_relocation",
      "expropriation",
      "government_transfer",
      "land_exchange",
      "corporate_stock_disposal",
      "other_similar",
    ])
    .optional(),
  maintainsMajorShareholder: z.boolean().optional(),
});

export type FarmingPostMgmtInputSchema = z.infer<typeof farmingPostMgmtInputSchema>;
