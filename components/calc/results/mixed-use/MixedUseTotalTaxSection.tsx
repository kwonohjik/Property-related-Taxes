"use client";

/**
 * 겸용주택 결과 — **합산 세액 + 감면 산출근거 카드** (800줄 분리, 2026-09-30)
 *
 * `MixedUseCalculationSections.tsx`가 762줄로 위험구간(≥750)이라 분리했다. 이음매는 본문의 마지막
 * 두 블록이다 — 쓰는 상위 심볼이 `breakdown`·`formData`·접기 상태뿐이라 props 4개로 끊긴다.
 * (주택부분 블록이 더 크지만 취득 경로 파생 플래그 5개를 함께 요구해 파생이 두 곳으로 갈린다.)
 *
 * ⚠️ 접기 상태는 **부모 소유**다(인쇄 전체펼침 토글이 함께 쓴다) — 값과 핸들러만 받는다.
 */

import type { MixedUseGainBreakdown } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { ReductionDetailCards } from "@/components/calc/results/transfer/ReductionDetailCards";
import {
  fmt,
  fmtPlain,
  fmtPct,
  ResultSection,
  Row,
  DivRow,
} from "@/components/calc/results/mixed-use/MixedUseResultCardParts";
import { adoptedCalculatedTax, deriveBasicRateBracket } from "@/components/calc/results/mixed-use/MixedUseResultCardAdapter";

interface Props {
  breakdown: MixedUseGainBreakdown;
  formData?: TransferFormData;
  open: boolean;
  onToggle: () => void;
}

export function MixedUseTotalTaxSection({ breakdown, formData, open, onToggle }: Props) {
  const { housingPart: h, commercialPart: c, nonBusinessLandPart: nb, total: t } = breakdown;

  return (
    <>
      {/* 합산 세액 */}
      <ResultSection
        title="합산 세액"
        basis="소득세법 §92~§107"
        open={open}
        onToggle={onToggle}
      >
        <Row
          label="합산 양도소득금액"
          value={fmt(t.aggregateIncome)}
          formula={`주택부분 ${fmtPlain(h.incomeAmount)} + 상가부분 ${fmtPlain(c.incomeAmount)}${
            nb ? ` + 비사업용토지 ${fmtPlain(nb.incomeAmount)}` : ""
          }`}
        />
        <Row
          label="기본공제"
          value={`△ ${fmt(t.basicDeduction)}`}
          formula="연 250만원 (소득세법 §103)"
        />
        <Row
          label="과세표준"
          value={fmt(t.taxBase)}
          formula={`합산 양도소득금액 ${fmtPlain(t.aggregateIncome)} - 기본공제 ${fmtPlain(t.basicDeduction)}`}
        />
        <DivRow />
        <Row
          label={t.rateBasis === "clause2" ? "산출세액 (자산별 합계)" : "산출세액 (기본세율)"}
          value={fmt(adoptedCalculatedTax(t))}
          formula={(() => {
            // §104⑤2호가 채택되면 세액은 파트별 산출세액의 합이라 `taxByBasicRate`(1호)와 다르다.
            // 1호 값을 그대로 인용하면 표시-계산 drift가 된다.
            // 배율 초과분(비사업용 토지)은 §104⑤ 본문 **후단**에 따라 **별개 자산**으로 보아
            // §104①8호(누진 + 10%p)를 자기 과세표준에만 적용한다. 총액에 별도로 얹지 않으므로
            // 위 「비사업용토지 +10%p 가산세」 행이 뜨지 않는다 — 산식에서마저 빠지면
            // 사용자는 중과가 누락된 것으로 오해한다.
            const nbTerm = nb && t.nonBusinessSurcharge === 0
              ? ` + 비사업용토지분 과세표준 × (누진세율 + 10%p, 소득세법 §104①8호)`
              : "";
            if (t.rateBasis === "clause2") {
              const addon = t.surchargeAddon;
              return addon !== undefined
                ? `주택분 과세표준 × (누진세율 + ${fmtPct(addon)}) + 상가분 과세표준 × 누진세율${nbTerm} — 자산별 산출세액 합계가 합산 누진(${fmtPlain(t.taxByBasicRate)})보다 커서 채택 (소득세법 §104⑤ 2호·§104⑦)`
                : `파트별 과세표준 × 각 적용세율 합계${nbTerm} — 합산 누진(${fmtPlain(t.taxByBasicRate)})보다 커서 채택 (소득세법 §104⑤ 2호)`;
            }
            if (t.taxBase <= 0) return "과세표준 × 누진세율 (6%~45% 8구간) — 소득세법 §104";
            // 엔진이 신규 필드를 채웠으면 그대로 사용, 아니면 taxBase로부터 도출 (캐시 fallback)
            const fallback = deriveBasicRateBracket(t.taxBase);
            const rate = t.appliedRate && t.appliedRate > 0 ? t.appliedRate : fallback.rate;
            const deduction = t.progressiveDeduction && t.progressiveDeduction > 0 ? t.progressiveDeduction : fallback.deduction;
            // 1호(합산 누진)가 채택된 경우 — 비사업용 가산이 포함된 2호보다 1호가 컸다는 뜻이다.
            const nbNote = nbTerm
              ? ` · 비사업용토지분은 별개 자산으로 보아 §104①8호를 적용한 자산별 합계(§104⑤ 2호)와 비교했으나, 합산 누진(1호)이 더 커서 1호가 채택되었습니다`
              : "";
            return `${fmtPlain(t.taxBase)} × ${fmtPct(rate)} - ${fmtPlain(deduction)} (소득세법 §104)${nbNote}`;
          })()}
        />
        {t.nonBusinessSurcharge > 0 && (
          <Row
            label="비사업용토지 +10%p 가산세"
            value={fmt(t.nonBusinessSurcharge)}
            formula={(() => {
              // 중과 base = 비사업용 양도소득금액 − 기본공제 귀속분(최고세율 부분에 전액 귀속).
              // 적용공제 = 합산 양도소득금액 − 과세표준 (§104①8호, 납세자 유리 원칙).
              const surchargeBase = nb
                ? Math.max(0, nb.incomeAmount - (t.aggregateIncome - t.taxBase))
                : 0;
              return `비사업용토지 과세표준 귀속분 ${fmtPlain(surchargeBase)} × 10%`;
            })()}
          />
        )}
        <Row
          label="양도소득세"
          value={fmt(t.transferTax)}
          formula={`산출세액 ${fmtPlain(adoptedCalculatedTax(t))}${
            t.nonBusinessSurcharge > 0
              ? ` + 비사업용토지 가산세 ${fmtPlain(t.nonBusinessSurcharge)}`
              : ""
          }`}
        />
        {/**
         * 산출세액 이후 단계 — 감면세액·결정세액·가산세·농어촌특별세.
         *
         * 🔴 종전에는 이 네 행이 통째로 없었다. 엔진은
         *   `totalPayable = 결정세액 + 지방소득세 + 가산세 + 농특세`인데
         *   (`transfer-tax-mixed-use-totals.ts:249`) 표에는 산출세액·지방소득세·총 납부세액만
         *   있어 총액과 그 아래 산식이 감면·가산세·농특세만큼 어긋났다. 지방소득세 산식도
         *   「양도소득세 × 10%」라고 적혀 있었지만 실제 base는 **결정세액**이라
         *   감면이 붙으면 산식으로 검산이 되지 않았다(결과탭 코드리뷰 #001 · #087).
         */}
        {t.reductionAmount > 0 && (
          <>
            <Row
              label="감면세액"
              value={`△ ${fmt(t.reductionAmount)}`}
              formula="조세특례제한법상 세액감면 — 산출세액에서 차감 (중복배제 후 채택된 1건, 조특법 §127⑦)"
            />
            <Row
              label="결정세액"
              value={fmt(t.determinedTax)}
              formula={`산출세액 ${fmtPlain(t.transferTax)} - 감면세액 ${fmtPlain(t.reductionAmount)}`}
            />
          </>
        )}
        <Row
          label="지방소득세 (10%)"
          value={fmt(t.localTax)}
          formula={`결정세액 ${fmtPlain(t.determinedTax)} × 10% (지방세법 §103의3)`}
        />
        {t.penaltyTax > 0 && (
          <Row
            label="가산세"
            value={fmt(t.penaltyTax)}
            formula="신고불성실·납부지연 가산세 (국세기본법 §47의2~§47의4)"
          />
        )}
        {t.ruralSurtax > 0 && (
          <Row
            label="농어촌특별세"
            value={fmt(t.ruralSurtax)}
            formula={`감면세액 ${fmtPlain(t.reductionAmount)} × 20% (농어촌특별세법 §5①1호)`}
          />
        )}
        <DivRow />
        <Row
          // 정정 모드에서는 AmendmentResultCard의 "참고 · 수정/경정 후 전체 세액"과 라벨을 맞춘다
          // (같은 금액에 다른 라벨이 한 화면에 뜨는 것을 방지).
          label={
            breakdown.amendmentDetail
              ? breakdown.amendmentDetail.correctionKind === "refund_claim"
                ? "경정 후 전체 세액"
                : "수정 후 전체 세액"
              : "총 납부세액"
          }
          value={fmt(t.totalPayable)}
          highlight
          large
          formula={[
            `결정세액 ${fmtPlain(t.determinedTax)}`,
            `지방소득세 ${fmtPlain(t.localTax)}`,
            ...(t.penaltyTax > 0 ? [`가산세 ${fmtPlain(t.penaltyTax)}`] : []),
            ...(t.ruralSurtax > 0 ? [`농어촌특별세 ${fmtPlain(t.ruralSurtax)}`] : []),
          ].join(" + ")}
        />
      </ResultSection>

      {/*
        감면 산출근거 카드 — 나머지 세 결과뷰(단건·일괄·다건)는 모두 갖는데 겸용만 없었다
        (결과탭 코드리뷰 #049). §77 요건 미충족으로 감면이 0이 된 경우에도 **사유를 알려주는
        카드가 없어** 「왜 안 붙었는지」가 화면에서 사라졌다. 엔진은 detail을 만들고도
        `computeMixedUsePostTax`에서 버리고 있었다 — 이제 echo로 받아 같은 공용 컴포넌트에 넘긴다.

        ⚠️ 겸용은 **세액감면형만** 계산한다(차감형은 어느 파트에서 뺄지 정한 명문이 없어 고지만
           한다) — 그래서 `calculatedTax`는 감면 차감 전 산출세액 `t.transferTax`다.

        🔴 조특법 주택 수 제외(§99의4·§98의9·감면주택)는 §89①3호 판정 축이라 결과 **최상위**에 실린다
           (D4-02 echo) — 종전에는 넘기지 않아 카드·사유·§99의4⑥ 경고가 사라졌다. `houses`는 「보유 주택 N」용.
      */}
      <ReductionDetailCards
        result={{
          ...t.reductionDetails,
          new994Detail: breakdown.new994Detail,
          unsold989Detail: breakdown.unsold989Detail,
          houseCountExclusionDetails: breakdown.houseCountExclusionDetails,
          specialHouseExclusionDetail: breakdown.specialHouseExclusionDetail,
        }}
        houses={formData?.houses}
        calculatedTax={t.transferTax}
        taxBase={t.taxBase}
        longTermHoldingDeduction={
          h.longTermDeductionAmount +
          c.longTermDeductionAmount +
          (nb?.longTermDeductionAmount ?? 0)
        }
        appliedReductionType={t.reductionTypeApplied}
        appliedReductionAmount={t.reductionAmount}
      />
    </>
  );
}
