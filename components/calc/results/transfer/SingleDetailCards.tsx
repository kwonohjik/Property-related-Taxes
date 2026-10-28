"use client";

/**
 * 단건 결과뷰 ⑦ 「상세 산출근거 카드」 묶음 — `TransferTaxResultView` 에서 분리했다(800줄 정책, Q-12 PR-3 · 동작 무변경).
 * `PrintSection id="detail-cards"` 래퍼와 렌더 게이트(`hasSingleDetailCards`)는 뷰에 남는다 — 인쇄 leaf id 가 뷰에 보여야 한다.
 */
import { redevSec166DisplayOf } from "@/lib/calc/redev-pre-approval-acq-mode";
import { bgRedevFiling } from "@/lib/tax-engine/burdened-gift-totals";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { CrossEngine1045Notice } from "@/components/calc/shared/CrossEngine1045Notice";
import { CommercialBuildingValuationDetailCard } from "@/components/calc/results/CommercialBuildingValuationDetailCard";
import { BurdenedGiftDetailCard } from "@/components/calc/results/transfer/BurdenedGiftDetailCard";
import { RedevelopmentDetailCard } from "@/components/calc/results/transfer/RedevelopmentDetailCard";
import { FamilyBusinessImputedComparisonCard } from "@/components/calc/results/transfer/FamilyBusinessImputedComparisonCard";
import { RentalHousingExceptionDetailCard } from "@/components/calc/results/transfer/RentalHousingExceptionDetailCard";
import { ReductionDetailCards, hasReductionDetailCards } from "@/components/calc/results/transfer/ReductionDetailCards";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/**
 * 단건 결과뷰의 ⑦ 「상세 산출근거 카드」 묶음이 **하나라도 렌더되는가**.
 *
 * 렌더 게이트(`<PrintSection id="detail-cards">`)와 「출력 항목 선택」 가용성이 **같은 술어**를
 * 부른다 — 두 곳이 어긋나면 「목록에 있는데 화면에 없다」가 생기고, 그 방향을 잡는 테스트가
 * 저장소에 0건이었다 (결과탭 코드리뷰 #089). 감면 카드 묶음의 판정은 그 컴포넌트가 export한
 * 술어를 그대로 재사용한다 — 조건을 여기 복제하면 같은 드리프트가 다시 열린다.
 */
export function hasSingleDetailCards(result: TransferTaxResult): boolean {
  return (
    !!result.familyBusinessDetail ||
    result.surchargeType === "non_business_land" ||
    !!result.nonBusinessLandJudgmentDetail?.isNonBusinessLand ||
    !!result.commercialBuildingValuationDetail ||
    !!result.transferBurdenedGiftBreakdown ||
    !!result.redevelopmentDetail ||
    !!result.rentalHousingExceptionDetail ||
    hasReductionDetailCards(result)
  );
}

export function SingleDetailCards({
  result,
  formData,
  asset,
}: {
  result: TransferTaxResult;
  formData?: TransferFormData;
  asset?: AssetForm;
}) {
  return (
    <>
      {/* ⑦ 가업상속공제 §97의2④ 의제·일반 비교 결과 카드 */}
      {result.familyBusinessDetail && (
        <FamilyBusinessImputedComparisonCard detail={result.familyBusinessDetail} />
      )}

      {/* §104⑤ 크로스 엔진 고지 — 비사업용 토지가 있을 때만(계획서 C-1 · R-5 좁은 노출).
          ⚠️ `surchargeType`은 부칙 §9270호 §14① 위기취득 배제 시 undefined가 되고
             `nonBusinessLandJudgmentDetail`은 `nonBusinessLandDetails` 제공 시만 채워지므로,
             비사토인데 안 뜨는 경우가 있다. **오탐보다 미탐이 낫다**는 R-5 방침상 의도된 것이다
             (§104⑤ 자체는 비사토와 무관하게 걸리며, 그 사실은 고지 본문이 적는다). */}
      {(result.surchargeType === "non_business_land" || result.nonBusinessLandJudgmentDetail?.isNonBusinessLand) && (
        <CrossEngine1045Notice from="real_estate" />
      )}

      {/* ⑦ 상업용건물·오피스텔 환산취득가 산정 근거 상세 (소령 §164⑥, §176조의2②2호) */}
      {/* `as any` 제거(2026-07-28) — `TransferTaxResult.commercialBuildingValuationDetail`이
          실재하므로 캐스트가 불필요하다. 이 캐스트가 경계의 타입 검사를 꺼두고 있었던 탓에,
          카드가 엔진 타입을 로컬 재선언해 7개 필드가 누락된 상태가 컴파일 에러로 드러나지 않았다. */}
      {result.commercialBuildingValuationDetail && (
        <CommercialBuildingValuationDetailCard
          detail={result.commercialBuildingValuationDetail}
          transferPrice={formData ? (parseAmount(formData.contractTotalPrice) || 0) : 0}
          acquisitionGain={result.transferGain ?? undefined}
          longTermDeduction={result.longTermHoldingDeduction ?? undefined}
          /* 🔴 종전에는 `(result as any).taxableIncome` — `TransferTaxResult`에 **없는 필드**라
               항상 undefined였고 카드의 「양도소득금액」 행이 영영 렌더되지 않았다. 바로 아래
               「과세표준 = 양도소득금액 − 기본공제」가 화면에 없는 값을 참조했다. 일괄·다건은
               `incomeAfterOffset`을 넘겨 그 행이 나오므로 뷰마다 구성이 달랐다 (#017·#086). */
          taxableIncome={Math.max(0, result.taxableGain - result.longTermHoldingDeduction)}
          /* 장특공률 미전달 시 카드가 라벨에 변수명을 그대로 노출했다 (#017). */
          lthdRate={result.longTermHoldingRate}
          taxBase={result.taxBase ?? undefined}
          taxAmount={result.calculatedTax ?? undefined}
          localTax={result.localIncomeTax ?? undefined}
          totalTax={result.totalTax ?? undefined}
          swapApplied={result.swapApplied ?? undefined}
          depreciation={result.swapApplied ? undefined : result.depreciationAmount}
        />
      )}

      {/* ⑦ 부담부증여 상증법 평가 명세 + Phase 2 증여세 (sibling 카드) */}
      {/* F-2 (2026-05-12): result.warnings 직접 연결 (케이스 12 다주택 중과 안내 등) */}
      {result.transferBurdenedGiftBreakdown && (
        <BurdenedGiftDetailCard
          breakdown={result.transferBurdenedGiftBreakdown}
          propertyType={asset?.assetKind ?? formData?.assets?.[0]?.assetKind}
          warnings={result.warnings}
          // 재개발 완공 아파트 × K-5 — 엔진이 §166③으로 계산한 값(명세의 일반 환산값 대신 표시)
          redevSec166={redevSec166DisplayOf(result)}
          // 원조합원 입주권·완공 아파트 — 인가 전 분과 신고서 합계(§166①1호)를 잇는다
          redevFilingAcquisition={bgRedevFiling(result)?.acquisition}
          redevFilingExpenses={bgRedevFiling(result)?.expenses}
        />
      )}

      {/*
        ⑦ 일반건물(토지+건물 일괄) 환산취득가 산정 근거 상세 — **블록을 제거했다** (#066).

        🔴 이 블록은 **어떤 입력으로도 렌더되지 않았다**. 게이트 필드
           `generalBuildingValuationDetail`은 저장소 전체에서 **집계 객체에만** 대입되고
           (`general-building-{fractional,route-actual,route-helper}.ts` 3곳 — 전부
           `aggregated.…= `), 단건 응답(`SingleTransferResult`)에는 채워지는 곳이 없다.
           게다가 일반건물은 route가 `mode:"bundled"`로 분기하므로 이 뷰 자체가 뜨지 않는다.
           `holdingYears`·`holdingMonths`는 `TransferTaxResult`에 **선언조차 없어** 카드의
           보유기간 문구도 항상 null이었다 — `as any` 3개가 그 사실을 컴파일 에러로
           드러나지 않게 가리고 있었다(같은 캐스트가 :556 상가 카드 결함도 함께 숨겼다).
           일괄 뷰는 이 사실을 알고 §100③·§163⑨·환산주택가격 3블록을 인라인으로 재구현했다
           (`BundledAllocationCard.tsx` :531 · :574 주석).

        ⚠️ **남은 갭**: 카드의 ④ 「자산별 양도차익·장특공제·양도소득금액」 표와
           ⑤ 「§102② 결손금 1차 통산」 표는 일괄 뷰에 대응 블록이 없어 여전히 어디에도
           나오지 않는다. 그 둘을 살리려면 카드를 쪼개 일괄에 배선해야 하는데(①②③ 중복
           렌더가 되므로 통째로는 못 넣는다) 이 커밋의 범위 밖이다.
      */}

      {/* 재개발/재건축 상세 (시행령 §166) — 사례 44 3분할 양도차익 + LTHD 3줄 */}
      {result.redevelopmentDetail && (
        <RedevelopmentDetailCard
          detail={result.redevelopmentDetail}
          subject={
            formData?.assets?.[0]?.assetKind === "right_to_move_in"
              ? "right"
              : (formData?.assets?.[0]?.redevSubject as "apt" | "right" | undefined) ?? "apt"
          }
          settlementDirection={
            (formData?.assets?.[0]?.redevSettlementDirection as "pay" | "receive" | undefined) ?? "pay"
          }
          {...(result.lthdExclusionReason ? { lthdExclusionReason: result.lthdExclusionReason } : {})}
        />
      )}

      {/* ⑦ 장기임대주택 보유자 거주주택 비과세 특례 상세 (소령 §155⑳) — applied=false 시 미적용 사유도 표시 */}
      {result.rentalHousingExceptionDetail && (
        <RentalHousingExceptionDetailCard detail={result.rentalHousingExceptionDetail} />
      )}

      {/* ⑦ 감면·환산취득가 상세 (자경농지·상속주택·신축주택·장기임대 + §95⑤ 용도변경 LTHD) */}
      <ReductionDetailCards
        result={result}
        calculatedTax={result.calculatedTax}
        taxBase={result.taxBase}
        longTermHoldingDeduction={result.longTermHoldingDeduction}
        // §127⑦ 승자·§133 한도 후 최종액 — 배제된 후보가 자기 감면세액을 단정하지 않게 한다(#045 #046).
        appliedReductionType={result.reductionTypeApplied}
        appliedReductionAmount={result.reductionAmount}
        houses={formData?.houses}
      />
    </>
  );
}
