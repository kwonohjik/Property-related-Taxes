/**
 * ⑫ 의제취득일 전 «매수» 영 §176조의2④ 입력 — 단건·컴패니언 공용 스키마
 * 계획서: docs/02-design/features/realestate-pre-deemed-purchase-176-2-4.plan.md §4.3 · ⑧ `preDeemedPurchaseInputError`와 같은 규칙.
 */
import { z } from "zod";
import { isBeforePpiSeries } from "@/lib/tax-engine/producer-price-ratio";
import { PRE_DEEMED_PURCHASE_PPI_RATIO_REQUIRED_MESSAGE } from "@/lib/tax-engine/transfer-pre-deemed-purchase-messages";
import { TRANSFER } from "@/lib/tax-engine/legal-codes/transfer";

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

/** 일반건물이 서브객체 밖 자리로 보낸 의제취득일 전 매수 — 받아 놓고 무시하게 되므로 거부한다. */
export const PRE_DEEMED_PURCHASE_GB_PLACEMENT_MESSAGE =
  `일반건물의 의제취득일 전 매수(${TRANSFER.PRE_DEEMED_PURCHASE_MAX})는 generalBuildingValuation.preDeemedPurchase(지분은 generalBuildingShares[].valuation.preDeemedPurchase)로 보냅니다 — 이 자리의 값은 일반건물 계산에 쓰이지 않습니다`;

/**
 * 일반건물은 의제취득일 전 매수를 서브객체로만 계산한다(④ `buildGbPreDeemedPurchasePayload` · route `general-building-route-actual.ts`).
 * 최상위·컴패니언 레벨 `preDeemedPurchase`는 일반건물 경로가 읽지 않아 200 + 비교 없는 세액이었다
 * (실측 2026-11-16: 단건 113,060,000 vs 서브객체 111,083,795 · 함께 양도 컴패니언 200,730,000 vs 198,654,985).
 */
export function refinePreDeemedPurchaseGbPlacement(
  data: {
    propertyType?: string;
    preDeemedPurchase?: unknown;
    companionAssets?: ReadonlyArray<{ assetKind?: string; preDeemedPurchase?: unknown }>;
  },
  ctx: z.RefinementCtx,
) {
  if (data.propertyType === "general_building" && data.preDeemedPurchase !== undefined)
    ctx.addIssue({ code: "custom", path: ["preDeemedPurchase"], message: PRE_DEEMED_PURCHASE_GB_PLACEMENT_MESSAGE });
  data.companionAssets?.forEach((c, i) => {
    if (c.assetKind === "general_building" && c.preDeemedPurchase !== undefined)
      ctx.addIssue({ code: "custom", path: ["companionAssets", i, "preDeemedPurchase"], message: PRE_DEEMED_PURCHASE_GB_PLACEMENT_MESSAGE });
  });
}
