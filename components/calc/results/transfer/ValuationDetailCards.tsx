"use client";

/**
 * 평가·판정 상세 카드 묶음 — **일괄(bundled) 자산별 카드 전용** (R1-a).
 *
 * ## 왜 있는가
 *
 * 일괄 모드는 자산별로 `calculateTransferTax`를 완전히 호출해 **계산은 정상**인데,
 * `PerPropertyBreakdown`이 결과의 Detail을 버려 **산출근거가 화면에 안 나왔다**.
 * `pickValuationDetails()`가 값을 옮기고, 이 컴포넌트가 자산별로 렌더한다.
 *
 * ## 왜 단건 결과뷰는 이걸 쓰지 않는가 (의도된 비대칭)
 *
 * `TransferTaxResultView`는 같은 카드들을 **`<PrintSection>`으로 감싸고 다른 콘텐츠와
 * 교차 배치**한다(인쇄 선택 출력 기능). 이 컴포넌트로 강제 통합하면 인쇄 섹션 id와 순서가
 * 깨진다 — 표시 갭을 메우려다 기존 기능을 망치는 셈이다.
 *
 * 대신 **계약 타입 `TransferValuationDetailSource`가 단일 진실**이고,
 * `__tests__/api/transfer.route.bundled-swallows-special.test.ts`가
 * 계약 ↔ `pickValuationDetails` ↔ 이 컴포넌트의 필드 목록 동기화를 소스 수준에서 검증한다.
 * 즉 "무엇을 보여줄지"는 한 곳(계약)에서만 정의된다.
 */

import type { TransferValuationDetailSource } from "@/lib/tax-engine/types/transfer-result.types";
import { MultiHouseSurchargeDetailCard } from "@/components/calc/MultiHouseSurchargeDetailCard";
import { NonBusinessLandResultCard } from "@/components/calc/NonBusinessLandResultCard";
import { ExpropriationValuationCard } from "@/components/calc/results/transfer/ExpropriationValuationCard";
import { HousingExpropriationValuationCard } from "@/components/calc/results/transfer/HousingExpropriationValuationCard";
import { AuctionValuationCard } from "@/components/calc/results/transfer/AuctionValuationCard";
import { CommercialBuildingValuationDetailCard } from "@/components/calc/results/CommercialBuildingValuationDetailCard";
import { PreHousingDisclosureDetailSection } from "@/components/calc/results/transfer/PreHousingDisclosureDetailSection";
import { RentalHousingExceptionDetailCard } from "@/components/calc/results/transfer/RentalHousingExceptionDetailCard";
import { FamilyBusinessImputedComparisonCard } from "@/components/calc/results/transfer/FamilyBusinessImputedComparisonCard";
import { CarryoverComparisonCard } from "@/components/calc/results/transfer/CarryoverComparisonCard";
import { SplitGainDetailSection } from "@/components/calc/results/transfer/SplitGainDetailSection";
import { Pre1990LandValuationDetailCard } from "@/components/calc/results/transfer/Pre1990LandValuationDetailCard";

interface Props {
  result: TransferValuationDetailSource;
  /**
   * 상가 환산 카드(§164⑥)가 쓰는 자산-수준 금액.
   * 일괄에서는 **안분된 자산별 값**을 넘긴다 — 단건의 총계약가와 의미가 다르므로
   * `result`에서 읽지 않고 명시 prop으로 받는다.
   */
  transferPrice: number;
  transferGain?: number;
  longTermDeduction?: number;
  taxableIncome?: number;
  /** 토지·건물 분리 안내 문구 분기(§99①1호 나목)용 — 자산별로 다르다. */
  assetKind?: string;
}

export function ValuationDetailCards({
  result,
  transferPrice,
  transferGain,
  longTermDeduction,
  taxableIncome,
  assetKind,
}: Props) {
  const hasAny =
    !!result.commercialBuildingValuationDetail ||
    !!result.nonBusinessLandJudgmentDetail ||
    !!result.multiHouseSurchargeDetail ||
    !!result.expropriationValuationDetail ||
    !!result.housingExpropriationValuationDetail ||
    !!result.auctionValuationDetail ||
    !!result.preHousingDisclosureDetail ||
    !!result.rentalHousingExceptionDetail ||
    !!result.familyBusinessDetail ||
    !!result.carryoverTaxationDetail ||
    !!result.splitDetail ||
    !!result.pre1990LandValuationDetail;

  if (!hasAny) return null;

  return (
    <div className="mt-3 space-y-3">
      {result.multiHouseSurchargeDetail && (
        <MultiHouseSurchargeDetailCard detail={result.multiHouseSurchargeDetail} />
      )}
      {result.nonBusinessLandJudgmentDetail && (
        <NonBusinessLandResultCard
          judgment={result.nonBusinessLandJudgmentDetail}
          nblSurchargeExcluded={result.nblSurchargeExcluded}
        />
      )}
      {result.expropriationValuationDetail && (
        <ExpropriationValuationCard detail={result.expropriationValuationDetail} />
      )}
      {result.auctionValuationDetail && (
        <AuctionValuationCard detail={result.auctionValuationDetail} />
      )}
      {result.housingExpropriationValuationDetail && (
        <HousingExpropriationValuationCard detail={result.housingExpropriationValuationDetail} />
      )}
      {result.preHousingDisclosureDetail && (
        <PreHousingDisclosureDetailSection result={result} />
      )}
      {result.commercialBuildingValuationDetail && (
        <CommercialBuildingValuationDetailCard
          detail={result.commercialBuildingValuationDetail}
          transferPrice={transferPrice}
          acquisitionGain={transferGain}
          longTermDeduction={longTermDeduction}
          taxableIncome={taxableIncome}
        />
      )}
      {result.rentalHousingExceptionDetail && (
        <RentalHousingExceptionDetailCard detail={result.rentalHousingExceptionDetail} />
      )}
      {result.carryoverTaxationDetail && (
        <CarryoverComparisonCard detail={result.carryoverTaxationDetail} />
      )}
      {result.familyBusinessDetail && (
        <FamilyBusinessImputedComparisonCard detail={result.familyBusinessDetail} />
      )}
      {result.pre1990LandValuationDetail && (
        <Pre1990LandValuationDetailCard detail={result.pre1990LandValuationDetail} />
      )}
      {result.splitDetail && (
        <SplitGainDetailSection splitDetail={result.splitDetail} assetKind={assetKind} />
      )}
    </div>
  );
}
