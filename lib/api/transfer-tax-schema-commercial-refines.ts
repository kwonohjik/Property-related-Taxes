/**
 * ⑫ 상업용건물·오피스텔 환산 서브객체 — **§164⑥ 산식 괄호 단서(§164⑧ 준용)** 필수 입력
 * (2026-09-30 Zod↔엔진 필수 점검 2차 · CB1, 계획서 `docs/00-pm/zod-engine-required-mismatch.plan.md` §4.2).
 *
 * 「소득세법 시행령」 §164⑥ 산식 괄호: 취득당시 기준시가합과 최초고시당시 기준시가합이 **같으면**
 * §164⑧을 준용한다 — 엔진은 그 분모를 전기(취득 직전 고시분) 기준시가합 B로 대체한다
 * (`commercial-building-valuation.ts` `calcSec164_8AdjustedDenominator`). B가 없으면 대체가 **조용히
 * 생략되어** 비율 1로 계산됐다(200 + 다른 세액).
 *
 * ⑧ 거울: `transfer-tax-validate-commercial-asset.ts` `validateCommercialEstimatedAsset` pre_disclosure 분기의
 * `isSec164_8ProvisoApplicable(asset) && !cbPrevStdPriceSum`. 합계 산식은 엔진과 **같은 함수**
 * (`calcStdPriceSum` — 토지분 INT 후 합산)를 쓴다 — ⑧의 `stdPriceSumAt`도 같은 산식이다.
 *
 * ⚠️ ⑧은 취득시 개별공시지가를 **직접 입력값**(`cbLandPricePerSqmAtAcq`)으로 판정하고, ④는 1990.8.30. 전
 *    취득이면 §164④ 등급환산값을 실어 보낸다(`effectiveCommercialLandPriceAtAcq`). 여기서는 엔진이 실제로
 *    보는 값(④가 보낸 값)으로 판정한다 — 등급환산값이 최초고시 값과 우연히 같아지는 조합에서만 둘이
 *    갈릴 수 있다(계획서 §4.3 확인 필요로 기록).
 */
import { z } from "zod";
import { commercialBuildingValuationSchema } from "./transfer-tax-building-schemas";
import { calcStdPriceSum } from "@/lib/tax-engine/commercial-building-valuation";

type Cbv = z.infer<typeof commercialBuildingValuationSchema>;

export function refineCommercialSec164_8Proviso(v: Cbv, ctx: z.RefinementCtx): void {
  if (v.isPreDisclosure !== true) return;
  const { landPriceAtAcquisition, buildingStdPriceAtAcquisition } = v;
  const { landPriceAtFirstDisclosure, buildingStdPriceAtFirstDisclosure } = v;
  // 부재는 형제 refine(`transfer-tax-schema-refines.ts` pre_disclosure 필수)이 따로 막는다.
  if (!landPriceAtAcquisition || !buildingStdPriceAtAcquisition) return;
  if (!landPriceAtFirstDisclosure || !buildingStdPriceAtFirstDisclosure) return;
  const atAcq = calcStdPriceSum(landPriceAtAcquisition, v.landArea, buildingStdPriceAtAcquisition);
  const atFirst = calcStdPriceSum(landPriceAtFirstDisclosure, v.landArea, buildingStdPriceAtFirstDisclosure);
  if (atAcq > 0 && atAcq === atFirst && !v.prevStdPriceSum) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["prevStdPriceSum"],
      message:
        "취득당시 기준시가합과 최초고시당시 기준시가합이 같습니다 — §164⑥ 산식 괄호 단서에 따라 §164⑧을 준용하므로 전기(취득 직전 고시분)의 토지·건물 기준시가 합계액이 필요합니다 (소득세법 시행령 §164⑥·⑧)",
    });
  }
}

/** 단건·다건 본체(`propertyBaseShape`)와 컴패니언(`companionAssetSchema`)이 **같은 스키마**를 쓴다. */
export const commercialBuildingValuationRequiredSchema =
  commercialBuildingValuationSchema.superRefine(refineCommercialSec164_8Proviso);
