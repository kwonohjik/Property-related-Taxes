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
import { NblCarryoverDeemedNoteCard } from "@/components/calc/results/transfer/NblCarryoverDeemedNoteCard";
import { withoutCarryoverDeemedDuplicate } from "@/lib/calc/nbl-carryover-deemed-before-gift";
import type { NblCarryoverDeemedBeforeGift } from "@/lib/calc/nbl-carryover-deemed-before-gift";
import { ExpropriationValuationCard } from "@/components/calc/results/transfer/ExpropriationValuationCard";
import { HousingExpropriationValuationCard } from "@/components/calc/results/transfer/HousingExpropriationValuationCard";
import { SplitLandExpropriationValuationCard } from "@/components/calc/results/transfer/SplitLandExpropriationValuationCard";
import { AuctionValuationCard } from "@/components/calc/results/transfer/AuctionValuationCard";
import { CommercialBuildingValuationDetailCard } from "@/components/calc/results/CommercialBuildingValuationDetailCard";
import { PreHousingDisclosureDetailSection } from "@/components/calc/results/transfer/PreHousingDisclosureDetailSection";
import { RentalHousingExceptionDetailCard } from "@/components/calc/results/transfer/RentalHousingExceptionDetailCard";
import { FamilyBusinessImputedComparisonCard } from "@/components/calc/results/transfer/FamilyBusinessImputedComparisonCard";
import { CarryoverComparisonCard } from "@/components/calc/results/transfer/CarryoverComparisonCard";
import { SplitGainDetailSection } from "@/components/calc/results/transfer/SplitGainDetailSection";
import { Pre1990LandValuationDetailCard } from "@/components/calc/results/transfer/Pre1990LandValuationDetailCard";
import { PreDeemedPurchaseResultCard } from "@/components/calc/results/transfer/PreDeemedPurchaseResultCard";
import { SelfBuiltPenaltyCard } from "@/components/calc/results/transfer/SelfBuiltPenaltyCard";
import { CommercialNblPartCard } from "@/components/calc/results/transfer/CommercialNblPartCard";

interface Props {
  /** `depreciationAmount`는 자산별 breakdown이 싣는 §97③ echo — 상가 환산 카드 산식이 공제 후 값과 맞도록 읽는다. */
  result: TransferValuationDetailSource & {
    depreciationAmount?: number;
    /** 자산별 §97②2호 단서 swap echo(`PerPropertyBreakdown.filingDisplay`)·엔진 필요경비 — 상가 환산 카드 양도차익 산식(R-c01-04). */
    filingDisplay?: { swapApplied?: boolean };
    necessaryExpense?: number;
  };
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
  /**
   * §166⑧ 예외 근거 문구 — **엔진을 거치지 않으므로**(계획서 §15.3) 폼에서 읽어 내려온다.
   * 다자산 모드에서는 자산별로 다르므로 `assetKind`와 같은 층위에서 자산별로 넘긴다.
   */
  exemptionNote?: string;
  /** 부담부증여 × 소유자 분리(증여한 부분만 §159) — 호출부가 엔진 결과(`bgOwnedPartOfResult`)로 판정해 넘긴다(`SplitGainDetailSection`의 비소유 파트 열). */
  bgOwnerSplit?: boolean;
  /** 사용자가 양도가액 구분 방식을 «구분 기재»로 골랐는가 — 엔진 미전송이라 폼에서 읽어 내려온다(`SplitGainDetailSection`). */
  saleSplitActual?: boolean;
  /** PHD(§164⑦ 환산) 주택 종류가 공동주택인가 — 엔진 미전송(표시 축)이라 폼(`phdHousingType`)에서 읽어 내려온다. */
  phdApartment?: boolean;
  /** 전액 비과세 자산 — 분리 카드의 장특 행 설명용(`SplitGainDetailSection`). */
  isExempt?: boolean;
  /** 이월과세 토지 × 양도일 의제일 ≤ 증여 등기접수일 고지(+ 겹치는 엔진 주의사항) — 엔진 미전송(폼 사실)이라 호출부가 `nblCarryoverDeemedBeforeGift(asset)`로 만들어 내려준다. */
  nblCarryoverDeemed?: NblCarryoverDeemedBeforeGift;
}

export function ValuationDetailCards({
  result,
  transferPrice,
  transferGain,
  longTermDeduction,
  taxableIncome,
  assetKind,
  exemptionNote,
  saleSplitActual,
  phdApartment,
  isExempt,
  nblCarryoverDeemed,
  bgOwnerSplit,
}: Props) {
  const hasAny =
    !!result.commercialBuildingValuationDetail ||
    !!result.commercialNblPart ||
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
    !!result.pre1990LandValuationDetail ||
    !!result.preDeemedPurchaseDetail ||
    !!result.selfBuiltHousingPenalty;

  if (!hasAny) return null;

  return (
    <div className="mt-3 space-y-3">
      {result.multiHouseSurchargeDetail && (
        <MultiHouseSurchargeDetailCard detail={result.multiHouseSurchargeDetail} />
      )}
      {result.nonBusinessLandJudgmentDetail && (
        <NonBusinessLandResultCard
          judgment={withoutCarryoverDeemedDuplicate(result.nonBusinessLandJudgmentDetail, result.carryoverTaxationDetail ? nblCarryoverDeemed : undefined)}
          nblSurchargeExcluded={result.nblSurchargeExcluded}
          nblSurchargeExcludedBy={result.nblSurchargeExcludedBy}
        />
      )}
      {result.nonBusinessLandJudgmentDetail && result.carryoverTaxationDetail && (
        <NblCarryoverDeemedNoteCard note={nblCarryoverDeemed?.note} />
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
        <PreHousingDisclosureDetailSection result={result} phdApartment={phdApartment} />
      )}
      {result.commercialBuildingValuationDetail && (
        <CommercialBuildingValuationDetailCard
          detail={result.commercialBuildingValuationDetail}
          transferPrice={transferPrice}
          acquisitionGain={transferGain}
          longTermDeduction={longTermDeduction}
          taxableIncome={taxableIncome}
          depreciation={result.depreciationAmount}
          swapApplied={result.filingDisplay?.swapApplied}
          swapDirectSide={result.filingDisplay?.swapApplied ? result.necessaryExpense : undefined}
        />
      )}
      {result.commercialNblPart && <CommercialNblPartCard part={result.commercialNblPart} />}
      {result.rentalHousingExceptionDetail && (
        <RentalHousingExceptionDetailCard detail={result.rentalHousingExceptionDetail} />
      )}
      {result.carryoverTaxationDetail && (
        <CarryoverComparisonCard detail={result.carryoverTaxationDetail} />
      )}
      {result.familyBusinessDetail && (
        <FamilyBusinessImputedComparisonCard detail={result.familyBusinessDetail} />
      )}
      {result.preDeemedPurchaseDetail && <PreDeemedPurchaseResultCard detail={result.preDeemedPurchaseDetail} />}
      {result.pre1990LandValuationDetail && (
        <Pre1990LandValuationDetailCard detail={result.pre1990LandValuationDetail} />
      )}
      {/* 일체 주택 본인 신축 §114조의2 가산세(건물분) — 자산별 echo (Q-12 PR-3) */}
      <SelfBuiltPenaltyCard echo={result.selfBuiltHousingPenalty} />
      {/*
        🔴 `splitDetail` **안쪽** 중첩 detail 2종. 종전에는 단건 결과뷰에만 인라인으로 배선돼
           일괄·다건에서는 환산취득가액의 분모가 왜 낮아졌는지(§164⑨1호) 보여주는 근거가
           화면에서 통째로 사라졌다. `SplitGainDetailSection`은 이 둘을 읽지 않는다
           (본문에서 참조 0건 — 토지/건물 2열 표와 매매 분리 판정만 그린다).
           데이터는 `transfer-tax-aggregate-pickers.ts`가 `splitDetail`을 통째로 복사하므로
           이미 도달해 있었다 (결과탭 코드리뷰 #063).
      */}
      {result.splitDetail?.splitLandExpropriationValuationDetail && (
        <SplitLandExpropriationValuationCard
          detail={result.splitDetail.splitLandExpropriationValuationDetail}
        />
      )}
      {result.splitDetail?.housingExpropriationValuationDetail && (
        <HousingExpropriationValuationCard
          detail={result.splitDetail.housingExpropriationValuationDetail}
        />
      )}
      {result.splitDetail && (
        <SplitGainDetailSection
          splitDetail={result.splitDetail}
          assetKind={assetKind}
          {...(exemptionNote ? { exemptionNote } : {})}
          {...(saleSplitActual ? { saleSplitActual } : {})}
          {...(isExempt ? { isExempt } : {})}
          {...(bgOwnerSplit ? { bgOwnerSplit } : {})}
        />
      )}
    </div>
  );
}
