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
}

export function ReductionDetailCards({ result, calculatedTax, taxBase }: Props) {
  const hasAny =
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
    !!result.publicExpropriationDetail?.isEligible ||
    !!result.replacementLandDetail ||
    !!result.gbDesignatedLandDetail ||
    !!(result.specialHouseExclusionDetail &&
      result.specialHouseExclusionDetail.entries.length > 0);

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
      {/* §97 시리즈 Phase 2 — 정밀 계산 결과 카드 */}
      {result.rental97LthdDetail && (
        <Rental97DetailCard
          detail={result.rental97LthdDetail}
          effectLabel="장기보유특별공제 특례 (§97의3)"
        />
      )}
      {result.rental97TaxDetail && (
        <Rental97DetailCard
          detail={result.rental97TaxDetail}
          effectLabel="장기임대주택 세액감면"
        />
      )}
      {/* §99의4 농어촌·고향주택 주택수 제외 (2026-06-11) */}
      {result.new994Detail && <New994DetailCard detail={result.new994Detail} />}
      {/* §98의9 수도권 밖 준공후미분양 주택수 제외 (2026-06-11) */}
      {result.unsold989Detail && <Unsold989DetailCard detail={result.unsold989Detail} />}
      {/* P1 차감형 (2026-06-11): §99 신축주택 IMF 1차 · §98의8 준공후미분양 50% */}
      {result.new99Detail && <IncomeDeductionDetailCard kind="new_99" result={result.new99Detail} />}
      {result.unsold988Detail && (
        <IncomeDeductionDetailCard kind="unsold_98_8" result={result.unsold988Detail} />
      )}
      {/* P2 하이브리드 (2026-06-11): §98의7 9억↓ 미분양 · §99의2 신축·미분양·1세대1주택 */}
      {result.unsold987Detail && (
        <IncomeDeductionDetailCard kind="unsold_98_7" result={result.unsold987Detail} />
      )}
      {result.unsold992Detail && (
        <IncomeDeductionDetailCard kind="unsold_99_2" result={result.unsold992Detail} />
      )}
      {/* P3 하이브리드 (2026-06-12) */}
      {result.unsold983Detail && (
        <IncomeDeductionDetailCard kind="unsold_98_3" result={result.unsold983Detail} />
      )}
      {result.unsold985Detail && (
        <IncomeDeductionDetailCard kind="unsold_98_5" result={result.unsold985Detail} />
      )}
      {result.unsold986Detail && (
        <IncomeDeductionDetailCard kind="unsold_98_6" result={result.unsold986Detail} />
      )}
      {/* P4 (2026-06-12) */}
      {result.unsold982Detail && (
        <IncomeDeductionDetailCard kind="unsold_98_2" result={result.unsold982Detail} />
      )}
      {result.unsold984Detail && (
        <IncomeDeductionDetailCard kind="unsold_98_4" result={result.unsold984Detail} />
      )}
      {/* P5 (2026-06-12) */}
      {result.unsold98Detail && (
        <IncomeDeductionDetailCard kind="unsold_98" result={result.unsold98Detail} />
      )}
      {/* §99의3 신축주택 과세특례 — 양도소득금액 차감 방식 5년 안분 산식 */}
      {result.new993Detail && <New993DetailCard detail={result.new993Detail} />}
      {/* 비자발적 양도 감면 §77·§77의2·§77의3 — 감면세액 산출근거(변수값) */}
      {result.publicExpropriationDetail?.isEligible && (
        <PublicExpropriationDetailCard
          detail={result.publicExpropriationDetail}
          calculatedTax={calculatedTax}
          taxBase={taxBase}
        />
      )}
      {result.replacementLandDetail && (
        <ReplacementLand77_2DetailCard
          detail={result.replacementLandDetail}
          calculatedTax={calculatedTax}
          taxBase={taxBase}
        />
      )}
      {result.gbDesignatedLandDetail && (
        <GbDesignatedLand77_3DetailCard
          detail={result.gbDesignatedLandDetail}
          calculatedTax={calculatedTax}
          taxBase={taxBase}
        />
      )}
      {/* P5 모드 2 — 보유 감면주택 주택수 제외 (2026-06-12 리뷰 H-2) */}
      {result.specialHouseExclusionDetail &&
        result.specialHouseExclusionDetail.entries.length > 0 && (
          <SpecialHouseExclusionDetailCard detail={result.specialHouseExclusionDetail} />
        )}
    </>
  );
}
