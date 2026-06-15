"use client";

/**
 * GoodwillCalculationTable — 별지 부표3 5쪽 6.영업권 (자동 표시)
 *
 * 법령: 상증령 §59 ② + 상증규 §19 ① (KoreanLaw 검증 2026-05-22)
 *
 * 산식 (별지 5쪽):
 *   가. 가중평균 (§59③ 준용 §56①) — 회사 전체 3년 가중평균 순손익액
 *   나. 가 × 50%
 *   다. 평가기준일 현재 자기자본
 *   라. 이자율 10% (상증규 §19①)
 *   마. 다 × 라
 *   바. 영업권 지속연수 = 5년
 *   사. ∑(나 − 마) / (1 + 0.1)^n  for n=1..5
 *   아. 매입 무체재산권 가액 차감 (선택)
 *   자. 영업권 평가액 = max(사 − 아, 0)
 *
 * 본 컴포넌트는 평가 결과를 표시만 함 — 입력은 NetAssetCalculationTable + 사업연도 가산·차감에서 도출
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-valuation-besshi-4-buppyo-3.plan.md
 */

import type { UnlistedGoodwillResult } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";
import { LawArticleModal } from "@/components/ui/law-article-modal";

export interface GoodwillCalculationTableProps {
  goodwill: UnlistedGoodwillResult;
  /** 매입 무체재산권 차감액 (선택 입력) */
  onIntangibleDeductionChange?: (value: number) => void;
  /** 섹션 번호 (부모 UnlistedStockV2Card 단일 출처 — 다-섹션 카드 패턴) */
  sectionNum?: number;
}

function fmt(n: number): string {
  return n.toLocaleString();
}

export function GoodwillCalculationTable({ goodwill, sectionNum = 6 }: GoodwillCalculationTableProps) {
  const isExcluded = !!goodwill.excludedByLaw;

  return (
    <div className={`rounded-lg border-2 p-3 space-y-3 ${
      isExcluded ? "border-rose-300 bg-rose-50/60" : "border-amber-300 bg-amber-50/60"
    }`}>
      <div className="flex items-center gap-2">
        <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold select-none ${
          isExcluded ? "bg-rose-200 text-rose-800" : "bg-amber-200 text-amber-800"
        }`}>{sectionNum}</span>
        <p className={`text-xs font-semibold ${isExcluded ? "text-rose-800" : "text-amber-800"}`}>
          영업권 평가 (별지 5쪽 + 상증령 §59 ② + 상증규 §19 ①){" "}
          <LawArticleModal legalBasis="상증령 §59" label="§59" />{" "}
          <LawArticleModal legalBasis="상증규 §19" label="규§19" />
        </p>
      </div>

      {isExcluded ? (
        <div className="rounded border border-rose-300 bg-rose-100/60 p-3 text-[12px] text-rose-800">
          ⚠️ <strong>영업권 자동 배제 (상증령 §55 ③)</strong>
          <ul className="list-disc ml-4 mt-1 text-[11px] space-y-0.5">
            {goodwill.excludedByLaw === "liquidation" && <li>1호 — 청산절차 진행 (§54④ 1호 + §55③ 1호)</li>}
            {goodwill.excludedByLaw === "real_estate_80" && <li>1호 — 부동산 80% 이상 (§54④ 3호 + §55③ 1호)</li>}
            {goodwill.excludedByLaw === "lt3y" && <li>2호 — 사업개시 3년 미만 (§54④ 2호 + §55③ 2호)</li>}
            {goodwill.excludedByLaw === "continuous_loss_3y" && <li>3호 — 평가기준일 직전 3년 계속 결손법인</li>}
          </ul>
          <p className="mt-2 text-[11px] font-bold">자. 영업권 평가액 = 0원</p>
        </div>
      ) : (
        <table className="w-full text-[11px]">
          <tbody>
            <RowDisplay cellNum="가" label="3년 가중평균 순손익액" value={goodwill.weightedAvg3y} hint="§59③ 준용 §56① — 회사 전체" />
            <RowDisplay cellNum="나" label="가 × 50%" value={goodwill.weightedAvgHalf} />
            <RowDisplay cellNum="다" label="평가기준일 현재 자기자본" value={goodwill.selfCapital} hint="§55① 영업권 포함 전 순자산가액" />
            <RowDisplay cellNum="라" label="이자율" value={Math.floor(goodwill.rate * 100)} unit="%" hint="상증규 §19 ①" />
            <RowDisplay cellNum="마" label="다 × 라" value={goodwill.selfCapitalRate} />
            <RowDisplay
              cellNum="초과이익"
              label="(나 − 마)"
              value={goodwill.annualExcessProfit}
              emphasized
              hint={goodwill.weightedAvgHalf - goodwill.selfCapitalRate < 0 ? "★ 음수 → 0 처리" : "양수"}
            />
            <RowDisplay cellNum="바" label="영업권 지속연수" value={goodwill.durationYears} unit="년" />
            <RowDisplay
              cellNum="사"
              label="영업권 계산액"
              value={goodwill.goodwillCalc}
              hint="∑(나−마) / (1+0.1)^n for n=1..5 (정확 산식)"
            />
            <RowDisplay cellNum="아" label="매입 무체재산권 차감액" value={goodwill.intangibleDeduction} />
            <tr className="border-t-2 border-amber-400 bg-amber-100/60">
              <td className="py-2 pr-2 font-bold text-amber-900">자.</td>
              <td className="py-2 px-1 font-bold text-amber-900">영업권 평가액 = max(사 − 아, 0)</td>
              <td className="py-2 pl-1 text-right font-mono font-bold text-amber-900">
                {fmt(goodwill.goodwillFinal)}원
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

interface RowDisplayProps {
  cellNum: string;
  label: string;
  value: number;
  unit?: string;
  hint?: string;
  emphasized?: boolean;
}

function RowDisplay({ cellNum, label, value, unit = "원", hint, emphasized }: RowDisplayProps) {
  return (
    <tr className={`border-b border-amber-100 ${emphasized ? "bg-amber-100/40" : ""}`}>
      <td className={`py-1 pr-2 font-mono ${emphasized ? "text-amber-900 font-bold" : "text-amber-700"}`}>{cellNum}.</td>
      <td className="py-1 px-1">
        <div className={emphasized ? "font-semibold text-amber-900" : ""}>{label}</div>
        {hint && <div className="text-[10px] text-gray-500">{hint}</div>}
      </td>
      <td className={`py-1 pl-1 text-right font-mono ${emphasized ? "text-amber-900 font-bold" : ""}`}>
        {fmt(value)}{unit}
      </td>
    </tr>
  );
}
