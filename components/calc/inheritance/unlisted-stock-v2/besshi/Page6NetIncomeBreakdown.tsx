"use client";

/**
 * Page6NetIncomeBreakdown — 별지 부표3 제6쪽 7.순손익액 (3년치)
 *
 * 2025.07.10 개정 양식: 가산 ②~⑦(6) + 차감 ⑧~㉒(15) 세부 21행 전개.
 *   가. 소계 = ① + Σ(②~⑦) = taxableIncome + addTotal
 *   나. 소계 = Σ(⑧~㉒) = subTotal
 *   다. 순손익액 = 가 − 나 = adjustedNetIncome
 *
 * 엔진 산식 무변경 — 세부값은 FiscalYearBreakdown echo 필드(C-4·C-5).
 * Design: docs/02-design/features/inheritance-unlisted-stock-besshi-2025-revision.engine.design.md §5.1
 */

import type {
  UnlistedStockValuationResult,
  FiscalYearBreakdown,
} from "@/lib/tax-engine/types/unlisted-stock-valuation.types";
import { fmt, BreakdownRow, SectionTitle } from "./BesshiSharedAtoms";

type EchoKey = keyof FiscalYearBreakdown;

// 소득에 가산할 금액 (②~⑦) — §56④ 1호
const ADD_ROWS: { num: string; label: string; key: EchoKey }[] = [
  { num: "②", label: "국세·지방세 과오납에 대한 환급금이자", key: "addRefundInterest" },
  { num: "③", label: "수입배당금 중 익금불산입액", key: "addLossFromDividend" },
  { num: "④", label: "이월된 기부금 손금산입액", key: "addCarriedDonation" },
  { num: "⑤", label: "이월된 업무용승용차 관련 손금산입액", key: "addCarriedCarPayment" },
  { num: "⑥", label: "외화환산이익(법인세 계산시 미반영분)", key: "addForexValuationGain" },
  { num: "⑦", label: "그 밖에 기획재정부령으로 정하는 금액", key: "addOtherByOrdinance" },
];

// 소득에서 차감할 금액 (⑧~㉒) — §56④ 2호
const SUB_ROWS: { num: string; label: string; key: EchoKey }[] = [
  { num: "⑧", label: "당해 사업연도의 법인세액", key: "subCorporateTax" },
  { num: "⑨", label: "법인세액 감면액 또는 농어촌특별세·지방소득세", key: "subAdditionalTaxes" },
  { num: "⑩", label: "벌금·과료·과태료·가산금 및 강제징수비 손금불산입", key: "subFines" },
  { num: "⑪", label: "법령상 의무 아닌 공과금 손금불산입", key: "subCompulsoryPublicCharges" },
  { num: "⑫", label: "징벌적 목적의 손해배상금 등 손금불산입", key: "subPunitiveDamages" },
  { num: "⑬", label: "각 세법 징수불이행 납부세액", key: "subWithholdingPenalty" },
  { num: "⑭", label: "과다경비 등의 손금불산입액", key: "subExcessiveExpenses" },
  { num: "⑮", label: "기부금 손금불산입액", key: "subDonationExcess" },
  { num: "⑯", label: "기업업무추진비 손금불산입액", key: "subEntertainmentExcess" },
  { num: "⑰", label: "업무와 관련 없는 비용 손금불산입액", key: "subNonBusinessExpenses" },
  { num: "⑱", label: "업무용승용차 관련 비용의 손금불산입액", key: "subNonBusinessCarExpenses" },
  { num: "⑲", label: "지급이자의 손금불산입액", key: "subInterestPayment" },
  { num: "⑳", label: "감가상각비 시인부족액 상각부인 추인분 차감", key: "subDepreciationShortage" },
  { num: "㉑", label: "외화환산손실(법인세 계산시 미반영분)", key: "subForexValuationLoss" },
  { num: "㉒", label: "그 밖에 기획재정부령으로 정하는 금액", key: "subOtherByOrdinance" },
];

export interface Page6NetIncomeBreakdownProps {
  result: UnlistedStockValuationResult;
  /** §17의3② 연환산 적용 여부 — evaluateUnlistedStockV2 result.annualizationApplied */
  annualizationApplied?: [boolean, boolean, boolean];
  /** 연환산 후 1주당 순손익액 — evaluateUnlistedStockV2 result.annualizedPerShareNetIncome */
  annualizedPerShareNetIncome?: [number, number, number];
}

export function Page6NetIncomeBreakdown({
  result,
  annualizationApplied,
  annualizedPerShareNetIncome,
}: Page6NetIncomeBreakdownProps) {
  // result.annualizationApplied/annualizedPerShareNetIncome을 우선 사용, props fallback
  const appliedFlags = result.annualizationApplied ?? annualizationApplied;
  const annualizedValues = result.annualizedPerShareNetIncome ?? annualizedPerShareNetIncome;
  const hasAnnualization = appliedFlags?.some((a) => a) ?? false;

  const fyb = result.fiscalYearBreakdowns;
  const cell = (key: EchoKey) => fyb.map((fy) => (fy[key] as number | undefined) ?? 0);

  return (
    <section aria-label="제6쪽 순손익액 명세">
      <SectionTitle>7. 순손익액 (3년치 — 별지 제6쪽)</SectionTitle>
      <table className="w-full border-collapse border border-black mb-3 text-[10px]">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-black p-1">구분</th>
            {fyb.map((fy, i) => (
              <th key={i} className="border border-black p-1">
                {fy.label}
                <br />
                가중치 ×{i === 0 ? 3 : i === 1 ? 2 : 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <BreakdownRow testid="p6-①" label="① 각 사업연도 소득금액" values={fyb.map((fy) => fy.taxableIncome)} />
          {ADD_ROWS.map((r) => (
            <BreakdownRow key={r.num} testid={`p6-${r.num}`} label={`${r.num} ${r.label}`} values={cell(r.key)} />
          ))}
          <BreakdownRow testid="p6-가" label="가. 소계 (① + ②~⑦)" values={fyb.map((fy) => fy.taxableIncome + fy.addTotal)} emphasized />
          {SUB_ROWS.map((r) => (
            <BreakdownRow key={r.num} testid={`p6-${r.num}`} label={`${r.num} ${r.label}`} values={cell(r.key)} />
          ))}
          <BreakdownRow testid="p6-나" label="나. 소계 (⑧~㉒)" values={fyb.map((fy) => fy.subTotal)} emphasized />
          <BreakdownRow testid="p6-다" label="다. 순손익액 (가 − 나)" values={fyb.map((fy) => fy.adjustedNetIncome)} emphasized />
          <BreakdownRow testid="p6-라" label="라. 유상증(감)자시 반영액 (§56⑤)" values={fyb.map((fy) => fy.capitalIncreaseAdjustment)} />
          <BreakdownRow testid="p6-마" label="마. 순손익액 (다 ± 라)" values={fyb.map((fy) => fy.finalNetIncome)} emphasized />
          <BreakdownRow testid="p6-바" label="바. 사업연도말 주식수 또는 환산주식수" values={fyb.map((fy) => fy.convertedShares)} unit="주" />
          <BreakdownRow testid="p6-사" label="사. 주당순손익액 (마 ÷ 바) ㉓㉔㉕" values={fyb.map((fy) => fy.perShareNetIncome)} />
          {/* §17의3② 연환산 행 — 1년 미만 사업연도 있을 때만 표시 */}
          {hasAnnualization && annualizedValues && appliedFlags && (
            <tr className="bg-amber-50/60 border-t border-amber-200">
              <td className="border border-black p-1 text-amber-800 font-semibold">
                사-환산. 연환산 후 1주당 순손익액 (§17의3②)
              </td>
              {annualizedValues.map((val, i) => (
                <td key={i} className="border border-black p-1 text-right font-mono">
                  {appliedFlags[i] ? (
                    <span className="text-amber-800 font-semibold">
                      {fmt(fyb[i]?.perShareNetIncome ?? 0)} → {fmt(val)}
                      <span className="block text-[9px] font-normal text-amber-600">
                        1년 미만 사업연도 ×12/N개월 환산
                      </span>
                    </span>
                  ) : (
                    <span className="text-gray-400 text-[10px]">12개월(미환산)</span>
                  )}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
      <p className="mb-2">
        <strong>아. 1주당 가중평균 순손익액</strong> {"{(㉓×3 + ㉔×2 + ㉕) ÷ 6}"} = {fmt(result.weightedNetIncomePerShare)}원
        {hasAnnualization && (
          <span className="ml-2 text-[10px] text-amber-700">※ §17의3② 1년 미만 사업연도 연환산 반영</span>
        )}
      </p>
      <p className="mb-2">
        <strong>자. 환원율</strong> = {(result.capitalizationRate * 100).toFixed(0)}% (상증규 §17)
      </p>
      <p className="mb-3" data-besshi-cell="p6-차" data-testid="p6-차">
        <strong>차. 1주당 가액</strong> = 아 ÷ 자 = {fmt(result.netIncomePerShare)}원 (제1쪽 ⑤)
      </p>
    </section>
  );
}
