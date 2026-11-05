/**
 * 부담부증여(§159) × 일체 주택 × 신축 — 「소득세법」 §114조의2 가산세 기준액을 **건물분**으로 (순수 leaf · V-7).
 *
 * 계획서: docs/02-design/features/bg-housing-114-2-building-base.plan.md (Q-1~Q-4 a)
 *
 * 조문은 「해당 건물의 감정가액 또는 환산취득가액」의 100분의 5다. 부담부증여 스텝은 일체 주택의 주택공시가격(토지 포함 한 값)을 건물 자리에 두므로
 * 그 자리의 환산·감정가액은 토지분을 포함한다. 일반 양도 선례(`transfer-tax-self-built-housing-penalty.ts` · `transfer-tax-carryover-donor-penalty.ts` `housingBase`)와
 * 같은 건물분 안분(주택공시가격 × 건물기준시가 ÷ (토지공시가격 + 건물기준시가) — 선례 계획서 Q-2 확정)을 부담부증여 값(채무비율 안분 후)에 적용한다.
 *
 * · 환산: S_b × B_acq ÷ B_tr — S = 건물 자리 양도가액(채무 안분 후 주택 전체), S_b = 그 건물분(양도 당시 토지·건물 기준시가 비율), B_acq·B_tr = 취득·양도 당시 건물분 기준시가.
 * · 감정: 건물 자리 취득가액(채무 안분 후 주택 전체 감정가액) × 건물 감정가액 ÷ 감정가액 총액. 건물 감정가액은 감정평가서 구분 값, 없으면 총액을 취득 당시 토지·건물 기준시가로 안분.
 * 비율만 쓰므로 지분 축소(`scaleBurdenedGiftInfo`)와 무관하다 — 취득·양도 당시 주택공시가격은 축소 전 값(입력 그대로)을 넘긴다.
 *
 * 입력이 모자라면 undefined — 호출부가 종전 기준액을 쓴다(PR-1 · 엄격화는 화면 PR-2).
 */
import { apportionByStdPrice } from "./std-price-apportion";
import { calculateEstimatedAcquisitionPrice, safeMultiplyThenDivide } from "./tax-utils";
import { calcLandStdPriceAtAcq } from "@/lib/calc/transfer-tax-split-acq-mode";

/** 건물분 안분 입력 — 본인 신축 `selfBuiltHousing`·당초 증여자 신축 `donorBuilt.housing`과 같은 칸 이름(둘 다 이 모양을 만족한다). */
export interface BgHousingSplitInput {
  landPricePerSqmAtAcquisition?: number;
  landArea?: number;
  buildingStdPriceAtAcquisition?: number;
  landStdPriceAtTransfer?: number;
  buildingStdPriceAtTransfer?: number;
  /** 감정평가서에 구분 표시된 건물 감정가액(물건 전체 · 채무 안분 전) — 본인 신축만 */
  buildingAppraisalValue?: number;
}

const positive = (n: number | undefined): n is number => typeof n === "number" && n > 0;

export function bgHousingBuildingPenaltyBase(args: {
  method: "estimated" | "appraisal";
  split: BgHousingSplitInput;
  /** 건물 자리 양도가액(채무 안분 후) */
  buildingTransferPrice: number;
  /** 건물 자리 취득가액(채무 안분 후) — 감정에서 쓴다. 환산은 §97②2호 단서(swap) 전 값 */
  buildingAcquisitionPrice: number;
  /** 취득 당시 주택공시가격(축소 전) */
  housingStdAtAcquisition: number;
  /** 양도 당시 주택공시가격(축소 전) */
  housingStdAtTransfer: number;
  /** 감정가액 총액(물건 전체 · 채무 안분 전) */
  appraisalTotal?: number;
}): number | undefined {
  const { split: s } = args;
  const landAtAcq = calcLandStdPriceAtAcq(s.landPricePerSqmAtAcquisition ?? 0, s.landArea ?? 0);
  if (args.method === "appraisal") {
    if (!positive(args.appraisalTotal)) return undefined;
    const buildingAppraisal = positive(s.buildingAppraisalValue)
      ? s.buildingAppraisalValue
      : landAtAcq != null && positive(s.buildingStdPriceAtAcquisition)
        ? apportionByStdPrice(args.appraisalTotal, landAtAcq, s.buildingStdPriceAtAcquisition).building
        : undefined;
    if (buildingAppraisal === undefined) return undefined;
    return safeMultiplyThenDivide(args.buildingAcquisitionPrice, buildingAppraisal, args.appraisalTotal);
  }
  if (
    landAtAcq == null || !positive(s.buildingStdPriceAtAcquisition) || !positive(s.landStdPriceAtTransfer) || !positive(s.buildingStdPriceAtTransfer) ||
    !positive(args.housingStdAtAcquisition) || !positive(args.housingStdAtTransfer)
  )
    return undefined;
  const acquisitionBuilding = apportionByStdPrice(args.housingStdAtAcquisition, landAtAcq, s.buildingStdPriceAtAcquisition).building;
  const transferBuilding = apportionByStdPrice(args.housingStdAtTransfer, s.landStdPriceAtTransfer, s.buildingStdPriceAtTransfer).building;
  const saleBuilding = apportionByStdPrice(args.buildingTransferPrice, s.landStdPriceAtTransfer, s.buildingStdPriceAtTransfer).building;
  if (!(transferBuilding > 0)) return undefined;
  return calculateEstimatedAcquisitionPrice(saleBuilding, acquisitionBuilding, transferBuilding);
}
