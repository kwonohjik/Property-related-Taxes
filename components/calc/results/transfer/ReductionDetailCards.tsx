"use client";

/**
 * 감면·환산취득가 상세 카드 묶음 (800줄 정책 분리)
 *
 * TransferTaxResultView.tsx에서 import 1줄 + 렌더 1줄로 사용.
 * 아래 5가지 detail이 있을 때 조건부 렌더:
 *   - selfFarmingReductionDetail  — 자경농지 감면 (조특법 §69)
 *   - inheritedAcquisitionDetail  — 상속 취득가액 의제 (소령 §176의2④/§163⑨)
 *   - inheritedHouseValuationDetail — 상속주택 환산취득가액
 *   - newHousingReductionDetail   — 신축주택 감면 (조특법 §99 등)
 *   - rentalReductionDetail       — 장기임대 감면 (조특법 §97·§97의3·§97의4·§97의5)
 *     ※ rentalHousingExceptionDetail(임대주택 비과세 §155⑳)과 별개
 */

import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import { SelfFarmingReductionDetailCard } from "./SelfFarmingReductionDetailCard";
import { InheritedAcquisitionDetailCard } from "./InheritedAcquisitionDetailCard";
import { InheritedHouseValuationDetailCard } from "./InheritedHouseValuationDetailCard";
import { NewHousingReductionDetailCard } from "./NewHousingReductionDetailCard";
import { RentalReductionDetailCard } from "./RentalReductionDetailCard";

interface Props {
  result: TransferTaxResult;
}

export function ReductionDetailCards({ result }: Props) {
  const hasAny =
    !!result.selfFarmingReductionDetail ||
    !!result.inheritedAcquisitionDetail ||
    !!result.inheritedHouseValuationDetail ||
    !!result.newHousingReductionDetail ||
    !!result.rentalReductionDetail;

  if (!hasAny) return null;

  return (
    <>
      {result.selfFarmingReductionDetail && (
        <SelfFarmingReductionDetailCard detail={result.selfFarmingReductionDetail} />
      )}
      {result.inheritedAcquisitionDetail && (
        <InheritedAcquisitionDetailCard detail={result.inheritedAcquisitionDetail} />
      )}
      {result.inheritedHouseValuationDetail && (
        <InheritedHouseValuationDetailCard detail={result.inheritedHouseValuationDetail} />
      )}
      {result.newHousingReductionDetail && (
        <NewHousingReductionDetailCard detail={result.newHousingReductionDetail} />
      )}
      {result.rentalReductionDetail && (
        <RentalReductionDetailCard detail={result.rentalReductionDetail} />
      )}
    </>
  );
}
