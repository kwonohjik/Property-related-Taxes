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

import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
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

interface Props {
  result: TransferTaxResult;
}

export function ReductionDetailCards({ result }: Props) {
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
      {/* P5 모드 2 — 보유 감면주택 주택수 제외 (2026-06-12 리뷰 H-2) */}
      {result.specialHouseExclusionDetail &&
        result.specialHouseExclusionDetail.entries.length > 0 && (
          <SpecialHouseExclusionDetailCard detail={result.specialHouseExclusionDetail} />
        )}
    </>
  );
}
