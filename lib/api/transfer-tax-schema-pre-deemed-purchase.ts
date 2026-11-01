/**
 * ⑫ 의제취득일 전 «매수» 영 §176조의2④ 입력 — 단건·컴패니언 공용 스키마
 * 계획서: docs/02-design/features/realestate-pre-deemed-purchase-176-2-4.plan.md §4.3 · ⑧ `preDeemedPurchaseInputError`와 같은 규칙.
 */
import { z } from "zod";
import { isBeforePpiSeries } from "@/lib/tax-engine/producer-price-ratio";
import { PRE_DEEMED_PURCHASE_PPI_RATIO_REQUIRED_MESSAGE } from "@/lib/tax-engine/transfer-pre-deemed-purchase-messages";

export const preDeemedPurchaseSchema = z
  .object({
    /** 실제 취득일 — 의제취득일(1985-01-01) 전 */
    originalAcquisitionDate: z.string().date(),
    /** 환산·감정·매매사례 모드의 함께 견줄 취득 당시 실지거래가액(지분 금액) */
    actualPrice: z.number().int().positive().optional(),
    /** 토지·건물 취득일 분리 — 의제취득일 전 매수인 파트 */
    part: z.enum(["land", "building"]).optional(),
    /** 1965.01. 전 취득 직접 입력 배율 */
    ppiRatio: z.number().positive().optional(),
  })
  .superRefine((v, ctx) => {
    if (!(v.originalAcquisitionDate < "1985-01-01")) {
      ctx.addIssue({ code: "custom", path: ["originalAcquisitionDate"], message: "실제 취득일은 의제취득일(1985.1.1.) 전이어야 합니다" });
    }
    if (isBeforePpiSeries(v.originalAcquisitionDate) && v.ppiRatio === undefined) {
      ctx.addIssue({ code: "custom", path: ["ppiRatio"], message: PRE_DEEMED_PURCHASE_PPI_RATIO_REQUIRED_MESSAGE });
    }
  });
