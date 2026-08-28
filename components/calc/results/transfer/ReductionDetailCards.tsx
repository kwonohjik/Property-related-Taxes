"use client";

/**
 * 감면·환산취득가 상세 카드 묶음 (800줄 정책 분리)
 *
 * TransferTaxResultView.tsx에서 import 1줄 + 렌더 1줄로 사용.
 * 아래 detail이 있을 때 조건부 렌더:
 *   - selfFarmingReductionDetail  — 자경농지 감면 (조특법 §69)
 *   - inheritedAcquisitionDetail  — 상속 취득가액 의제 (소령 §176의2④/§163⑨)
 *   - inheritedHouseValuationDetail — 상속주택 환산취득가액
 *   - newHousingReductionDetail   — 신축주택 감면 (조특법 §99 등)
 *   - rentalReductionDetail       — 장기임대 감면 (조특법 §97·§97의3·§97의4·§97의5, 구 방식)
 *     ※ rentalHousingExceptionDetail(임대주택 비과세 §155⑳)과 별개
 *   - rental97LthdDetail          — §97의3 장기보유특별공제 특례 (Phase 2)
 *   - rental97TaxDetail           — §97·§97의2·§97의5 세액감면 (Phase 2)
 *   - usageConversionDetail       — 비주택→주택 용도변경 LTHD (소득세법 §95⑤·⑥)
 *     ※ 감면은 아니지만 LTHD가 낳는 echo라 `rental97LthdDetail`과 같은 계약에 실린다.
 */

import type { TransferReductionDetailSource } from "@/lib/tax-engine/types/transfer-result.types";
import { SelfFarmingReductionDetailCard } from "./SelfFarmingReductionDetailCard";
import { InheritedAcquisitionDetailCard } from "./InheritedAcquisitionDetailCard";
import { InheritedHouseValuationDetailCard } from "./InheritedHouseValuationDetailCard";
import { NewHousingReductionDetailCard } from "./NewHousingReductionDetailCard";
import { RentalReductionDetailCard } from "./RentalReductionDetailCard";
import { Rental97DetailCard } from "./Rental97DetailCard";
import { New994DetailCard } from "./New994DetailCard";
import { Unsold989DetailCard } from "./Unsold989DetailCard";
import { IncomeDeductionDetailCard } from "./IncomeDeductionDetailCard";
import { SpecialHouseExclusionDetailCard } from "./SpecialHouseExclusionDetailCard";
import {
  New993DetailCard,
  PublicExpropriationDetailCard,
} from "./TransferReductionRows";
import { ReplacementLand77_2DetailCard } from "./ReplacementLand77_2DetailCard";
import { GbDesignatedLand77_3DetailCard } from "./GbDesignatedLand77_3DetailCard";
import { UsageConversionDetailCard } from "./UsageConversionDetailCard";
import { ReductionOverlapExclusionBanner } from "./ReductionOverlapExclusionBanner";

interface Props {
  /**
   * 단건 `TransferTaxResult` · 일괄 `PerPropertyBreakdown` 양쪽이 만족하는 **좁은 계약**.
   * 덕분에 같은 컴포넌트를 두 모드에서 재사용한다(dual-truth 회피).
   */
  result: TransferReductionDetailSource;
  /**
   * 감면세액 산출근거(§77·§77의2·§77의3 카드)가 쓰는 기준값.
   *
   * ⚠️ `result`에서 읽지 않고 **명시 prop**으로 받는다 — 일괄 모드에서는 합산 과세표준 기준이라
   * 자산별 값이 다르고(`refCalculatedTax`·`taxBaseShare`), 이름이 같으면 의미가 뭉개진다.
   */
  calculatedTax: number;
  taxBase: number;
  /**
   * 장기보유특별공제 총액 — §95⑤ 용도변경 카드(`UsageConversionDetailCard`)의 머리글 값.
   *
   * ⚠️ `calculatedTax`·`taxBase`와 같은 이유로 **명시 prop**이다. 계약 타입
   * `TransferReductionDetailSource`에는 `longTermHoldingDeduction`이 없고(감면 detail만 모은
   * Pick), 일괄·다건에서는 자산별 값(`breakdown.longTermHoldingDeduction`)이라 의미가 다르다.
   * 필수로 둬야 호출부 누락이 컴파일 에러로 드러난다(침묵 누락 방지).
   */
  longTermHoldingDeduction: number;
  /**
   * 다건(multi) 결과뷰 전용 — §77·§77의2·§77의3 카드에서 ⑤ 감면세액·capping을 숨기고
   * ①~④ 구성만 보인다. 최종 감면세액은 조특법 §133 **합산 재계산 카드**가 낸다.
   *
   * 단건은 기본값 `false` — 자산별 산출세액·과세표준으로 ⑤까지 표시한다.
   * (일괄도 §133 합산 재계산 경로라 `true`를 넘긴다 — #044.)
   */
  aggregatedContext?: boolean;
  /**
   * **채택된 감면 유형 식별자** — 조특법 §127⑦ 중복배제 표시의 단일 신호.
   *
   * 감면 라우터는 후보 중 가장 큰 것 하나만 채택하는데 detail은 **적격 후보 전부**를 돌려준다.
   * 이 값이 없으면 카드가 승자를 알 수 없어, 배제된 감면이 자기 감면세액을 그대로 인쇄한다
   * (결과탭 코드리뷰 #045).
   *
   * ⚠️ `result`에서 읽지 않고 **명시 prop**으로 받는다 — 단건은 `reductionTypeApplied`,
   *   집계 자산별은 `PerPropertyBreakdown.reductionType`으로 **필드 이름이 다르다**.
   */
  appliedReductionType?: string;
  /**
   * **최종 적용 감면세액**(조특법 §133 연간·5년 누적 한도 반영 후).
   *
   * §77 계열 detail의 `reductionAmount`는 **연간 한도까지만** 반영된 값이라, 5년 누적 한도가
   * 걸리면 카드가 실제 적용액보다 큰 금액을 마지막 줄로 인쇄한다 — 실측 카드 65,540,250 vs
   * 실제 50,000,000, 차액 15,540,250이 아무 설명 없이 남았다(결과탭 코드리뷰 #046).
   */
  appliedReductionAmount?: number;
}

/** 자경농지 감면의 식별자 3종 — 상속인 합산·편입일 부분감면 변형까지 **같은 감면**이다. */
const SELF_FARMING_TYPES = ["self_farming", "self_farming_inherited", "self_farming_incorp"];

export function ReductionDetailCards({
  result,
  calculatedTax,
  taxBase,
  longTermHoldingDeduction,
  aggregatedContext = false,
  appliedReductionType,
  appliedReductionAmount,
}: Props) {
  /**
   * 이 카드가 §127⑦로 **배제된 후보인가** — 승자 식별자가 자기 것이 아니면 배제다.
   * 승자를 모르면(prop 미전달) 판정하지 않는다 — 근거 없이 「적용 불가」를 찍는 쪽이 더 위험하다.
   */
  const excludedByOverlap = (...ownTypes: string[]) =>
    !!appliedReductionType && !ownTypes.includes(appliedReductionType);
  const hasAny =
    !!result.usageConversionDetail ||
    !!result.selfFarmingReductionDetail ||
    !!result.inheritedAcquisitionDetail ||
    !!result.inheritedHouseValuationDetail ||
    !!result.newHousingReductionDetail ||
    !!result.rentalReductionDetail ||
    !!result.rental97LthdDetail ||
    !!result.rental97TaxDetail ||
    !!result.new994Detail ||
    !!result.unsold989Detail ||
    !!result.new99Detail ||
    !!result.unsold988Detail ||
    !!result.unsold987Detail ||
    !!result.unsold992Detail ||
    !!result.unsold983Detail ||
    !!result.unsold985Detail ||
    !!result.unsold986Detail ||
    !!result.unsold982Detail ||
    !!result.unsold984Detail ||
    !!result.unsold98Detail ||
    !!result.new993Detail ||
    !!result.publicExpropriationDetail ||
    !!result.replacementLandDetail ||
    !!result.gbDesignatedLandDetail ||
    !!(result.specialHouseExclusionDetail &&
      result.specialHouseExclusionDetail.entries.length > 0);

  if (!hasAny) return null;

  return (
    <>
      {/* 비주택 → 주택 용도변경 §95⑤·⑥ — 보유분이 표1+표2로 나뉜 근거.
          미적용(토글 없음·2025-01-01 전 양도·표2 대상 아님)이면 필드 자체가 없다. */}
      {result.usageConversionDetail && (
        <UsageConversionDetailCard
          detail={result.usageConversionDetail}
          deduction={longTermHoldingDeduction}
        />
      )}
      {result.selfFarmingReductionDetail && (
        <>
          {excludedByOverlap(...SELF_FARMING_TYPES) && (
            <ReductionOverlapExclusionBanner appliedType={appliedReductionType!} />
          )}
          <SelfFarmingReductionDetailCard detail={result.selfFarmingReductionDetail} />
        </>
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
        <RentalReductionDetailCard
          detail={result.rentalReductionDetail}
          calculatedTax={calculatedTax}
        />
      )}
      {/* §97 시리즈 Phase 2 — 정밀 계산 결과 카드 */}
      {result.rental97LthdDetail && (
        <Rental97DetailCard
          detail={result.rental97LthdDetail}
          effectLabel="장기보유특별공제 특례 (§97의3)"
          calculatedTax={calculatedTax}
        />
      )}
      {result.rental97TaxDetail && (
        <Rental97DetailCard
          detail={result.rental97TaxDetail}
          effectLabel="장기임대주택 세액감면"
          calculatedTax={calculatedTax}
        />
      )}
      {/* §99의4 농어촌·고향주택 주택수 제외 (2026-06-11) */}
      {result.new994Detail && <New994DetailCard detail={result.new994Detail} />}
      {/* §98의9 수도권 밖 준공후미분양 주택수 제외 (2026-06-11) */}
      {result.unsold989Detail && <Unsold989DetailCard detail={result.unsold989Detail} />}
      {/* P1 차감형 (2026-06-11): §99 신축주택 IMF 1차 · §98의8 준공후미분양 50% */}
      {result.new99Detail && <IncomeDeductionDetailCard kind="new_99" result={result.new99Detail} calculatedTax={calculatedTax} />}
      {result.unsold988Detail && (
        <IncomeDeductionDetailCard kind="unsold_98_8" result={result.unsold988Detail} calculatedTax={calculatedTax} />
      )}
      {/* P2 하이브리드 (2026-06-11): §98의7 9억↓ 미분양 · §99의2 신축·미분양·1세대1주택 */}
      {result.unsold987Detail && (
        <IncomeDeductionDetailCard kind="unsold_98_7" result={result.unsold987Detail} calculatedTax={calculatedTax} />
      )}
      {result.unsold992Detail && (
        <IncomeDeductionDetailCard kind="unsold_99_2" result={result.unsold992Detail} calculatedTax={calculatedTax} />
      )}
      {/* P3 하이브리드 (2026-06-12) */}
      {result.unsold983Detail && (
        <IncomeDeductionDetailCard kind="unsold_98_3" result={result.unsold983Detail} calculatedTax={calculatedTax} />
      )}
      {result.unsold985Detail && (
        <IncomeDeductionDetailCard kind="unsold_98_5" result={result.unsold985Detail} calculatedTax={calculatedTax} />
      )}
      {result.unsold986Detail && (
        <IncomeDeductionDetailCard kind="unsold_98_6" result={result.unsold986Detail} calculatedTax={calculatedTax} />
      )}
      {/* P4 (2026-06-12) */}
      {result.unsold982Detail && (
        <IncomeDeductionDetailCard kind="unsold_98_2" result={result.unsold982Detail} calculatedTax={calculatedTax} />
      )}
      {result.unsold984Detail && (
        <IncomeDeductionDetailCard kind="unsold_98_4" result={result.unsold984Detail} calculatedTax={calculatedTax} />
      )}
      {/* P5 (2026-06-12) */}
      {result.unsold98Detail && (
        <IncomeDeductionDetailCard kind="unsold_98" result={result.unsold98Detail} calculatedTax={calculatedTax} />
      )}
      {/* §99의3 신축주택 과세특례 — 양도소득금액 차감 방식 5년 안분 산식 */}
      {result.new993Detail && <New993DetailCard detail={result.new993Detail} />}
      {/* 비자발적 양도 감면 §77·§77의2·§77의3 — 감면세액 산출근거(변수값).
          적용 불가여도 렌더한다 — 카드가 사유를 표시한다(§77의2·§77의3과 동일).
          detail은 §77 감면을 입력했을 때만 생성되므로(transfer-tax-reductions-calc.ts:171)
          미입력 시 카드가 뜨지 않는다. */}
      {result.publicExpropriationDetail && (
        <>
          {excludedByOverlap("public_expropriation") && (
            <ReductionOverlapExclusionBanner appliedType={appliedReductionType!} />
          )}
          <PublicExpropriationDetailCard
            detail={result.publicExpropriationDetail}
            calculatedTax={calculatedTax}
            taxBase={taxBase}
            aggregatedContext={aggregatedContext}
            excludedByOverlap={excludedByOverlap("public_expropriation")}
            appliedReductionAmount={appliedReductionAmount}
          />
        </>
      )}
      {result.replacementLandDetail && (
        <>
          {excludedByOverlap("replacement_land_comp") && (
            <ReductionOverlapExclusionBanner appliedType={appliedReductionType!} />
          )}
          <ReplacementLand77_2DetailCard
            detail={result.replacementLandDetail}
            calculatedTax={calculatedTax}
            taxBase={taxBase}
            aggregatedContext={aggregatedContext}
            excludedByOverlap={excludedByOverlap("replacement_land_comp")}
            appliedReductionAmount={appliedReductionAmount}
          />
        </>
      )}
      {result.gbDesignatedLandDetail && (
        <>
          {excludedByOverlap("gb_designated_land") && (
            <ReductionOverlapExclusionBanner appliedType={appliedReductionType!} />
          )}
          <GbDesignatedLand77_3DetailCard
            detail={result.gbDesignatedLandDetail}
            calculatedTax={calculatedTax}
            taxBase={taxBase}
            aggregatedContext={aggregatedContext}
            excludedByOverlap={excludedByOverlap("gb_designated_land")}
            appliedReductionAmount={appliedReductionAmount}
          />
        </>
      )}
      {/* P5 모드 2 — 보유 감면주택 주택수 제외 (2026-06-12 리뷰 H-2) */}
      {result.specialHouseExclusionDetail &&
        result.specialHouseExclusionDetail.entries.length > 0 && (
          <SpecialHouseExclusionDetailCard detail={result.specialHouseExclusionDetail} />
        )}
    </>
  );
}
