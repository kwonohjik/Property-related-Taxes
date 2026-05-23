"use client";

/**
 * Page5GoodwillTable — 별지 부표3 제5쪽 6.영업권 (가~자 9행)
 *
 * 표 구조 (상증령 §59② + §55③ + 상증규 §19①):
 *   가. 평가기준일 이전 3년간 순손익액의 가중평균액 (① ×3 + ② ×2 + ③ ×1) / 6
 *   나. 가 × 50%
 *   다. 평가기준일 현재 자기자본 (영업권 포함 전 순자산가액)
 *   라. 기획재정부령이 정하는 이자율 (10% — 상증규 §19①)
 *   마. 다 × 라
 *   바. 영업권 지속연수 (5년)
 *   사. 영업권 계산액 Σⁿ₌₁⁵ (나 − 마)/(1+0.1)ⁿ
 *   아. 영업권 상당액 중 매입 무체재산권 감가상각비 공제분
 *   자. 영업권 평가액 (사 − 아) → 제2쪽 4.라 기재
 *
 * §55③ 자동배제 4종 badge:
 *   liquidation·real_estate_80·lt3y·continuous_loss_3y
 *
 * PDF: ~/Downloads/비상장주식 평가 사례.pdf page=9 좌측 (사례 6)
 * Plan: docs/00-pm/inheritance-unlisted-stock-besshi-form-full-replica.plan.md §3.3
 * Design: docs/02-design/features/inheritance-unlisted-stock-besshi-form-full-replica.engine.design.md §5
 */

import type {
  UnlistedGoodwillResult,
  FiscalYearBreakdown,
} from "@/lib/tax-engine/types/unlisted-stock-valuation.types";
import { fmt, renderDelta, SectionTitle } from "./BesshiSharedAtoms";

export interface Page5GoodwillTableProps {
  goodwill: UnlistedGoodwillResult;
  fiscalYearBreakdowns: [FiscalYearBreakdown, FiscalYearBreakdown, FiscalYearBreakdown];
}

// §55③ 자동배제 4종 — Record 타입 강제 (memory `enum-verification-before-mapping`)
const excludedReasonLabel: Record<NonNullable<UnlistedGoodwillResult["excludedByLaw"]>, string> = {
  liquidation: "§55③ 1호 — 청산절차 진행 → 영업권 가산 없음",
  real_estate_80: "§55③ 2호 본문 — 부동산 80% 이상 → 영업권 가산 없음",
  lt3y: "§55③ 2호 단서 — 사업개시 3년 미만·휴·폐업",
  continuous_loss_3y: "§55③ 3호 — 직전 3년 계속 결손 → 영업권 자동 0",
};

export function Page5GoodwillTable({ goodwill, fiscalYearBreakdowns }: Page5GoodwillTableProps) {
  // 사례 6 OQ-1: 나-마 양수인데 자=0 시 footer 안내 조건
  const naMinusMa = goodwill.weightedAvgHalf - goodwill.selfCapitalRate;
  const showZeroAnomalyFooter = naMinusMa > 0 && goodwill.goodwillFinal === 0 && !goodwill.excludedByLaw;

  return (
    <section aria-label="제5쪽 6. 영업권">
      <SectionTitle>6. 영업권 (별지 제5쪽)</SectionTitle>
      <table className="w-full border-collapse border border-black mb-3 text-[10px]">
        <tbody>
          {/* 가. 3년 가중평균 + 3 sub-cell */}
          <tr className="bg-yellow-50 font-bold print:bg-yellow-50" data-besshi-cell="p5-가" data-testid="p5-가">
            <td className="border border-black p-1 text-center font-mono w-12">가</td>
            <td className="border border-black p-1">
              평가기준일 이전 3년간 순손익액의 가중평균액
              <span className="text-[9px] text-gray-600 ml-1">(① ×3 + ② ×2 + ③ ×1) ÷ 6</span>
            </td>
            <td className="border border-black p-1 text-right font-mono w-40">{fmt(goodwill.weightedAvg3y)}</td>
          </tr>
          <tr data-besshi-cell="p5-가-①" data-testid="p5-가-①">
            <td className="border border-black p-1 text-center font-mono">①</td>
            <td className="border border-black p-1 pl-6">
              평가기준일 이전 1년 사업연도 순손익액 (×3)
              <span className="text-[9px] text-gray-600 ml-1">{fiscalYearBreakdowns[0].label}</span>
            </td>
            <td className="border border-black p-1 text-right font-mono">{renderDelta(fiscalYearBreakdowns[0].finalNetIncome)}</td>
          </tr>
          <tr data-besshi-cell="p5-가-②" data-testid="p5-가-②">
            <td className="border border-black p-1 text-center font-mono">②</td>
            <td className="border border-black p-1 pl-6">
              평가기준일 이전 2년 사업연도 순손익액 (×2)
              <span className="text-[9px] text-gray-600 ml-1">{fiscalYearBreakdowns[1].label}</span>
            </td>
            <td className="border border-black p-1 text-right font-mono">{renderDelta(fiscalYearBreakdowns[1].finalNetIncome)}</td>
          </tr>
          <tr data-besshi-cell="p5-가-③" data-testid="p5-가-③">
            <td className="border border-black p-1 text-center font-mono">③</td>
            <td className="border border-black p-1 pl-6">
              평가기준일 이전 3년 사업연도 순손익액 (×1)
              <span className="text-[9px] text-gray-600 ml-1">{fiscalYearBreakdowns[2].label}</span>
            </td>
            <td className="border border-black p-1 text-right font-mono">{renderDelta(fiscalYearBreakdowns[2].finalNetIncome)}</td>
          </tr>

          {/* 나~자 */}
          <tr data-besshi-cell="p5-나" data-testid="p5-나">
            <td className="border border-black p-1 text-center font-mono">나</td>
            <td className="border border-black p-1">가 × 50%</td>
            <td className="border border-black p-1 text-right font-mono">{fmt(goodwill.weightedAvgHalf)}</td>
          </tr>
          <tr data-besshi-cell="p5-다" data-testid="p5-다">
            <td className="border border-black p-1 text-center font-mono">다</td>
            <td className="border border-black p-1">평가기준일 현재 자기자본 (영업권 포함 전 순자산가액)</td>
            <td className="border border-black p-1 text-right font-mono">{fmt(goodwill.selfCapital)}</td>
          </tr>
          <tr data-besshi-cell="p5-라" data-testid="p5-라">
            <td className="border border-black p-1 text-center font-mono">라</td>
            <td className="border border-black p-1">기획재정부령이 정하는 이자율 (상증규 §19①)</td>
            <td className="border border-black p-1 text-right font-mono">{(goodwill.rate * 100).toFixed(0)}%</td>
          </tr>
          <tr data-besshi-cell="p5-마" data-testid="p5-마">
            <td className="border border-black p-1 text-center font-mono">마</td>
            <td className="border border-black p-1">다 × 라</td>
            <td className="border border-black p-1 text-right font-mono">{fmt(goodwill.selfCapitalRate)}</td>
          </tr>
          <tr data-besshi-cell="p5-바" data-testid="p5-바">
            <td className="border border-black p-1 text-center font-mono">바</td>
            <td className="border border-black p-1">영업권 지속연수</td>
            <td className="border border-black p-1 text-right font-mono">{goodwill.durationYears}년</td>
          </tr>
          <tr data-besshi-cell="p5-사" data-testid="p5-사">
            <td className="border border-black p-1 text-center font-mono">사</td>
            <td className="border border-black p-1">
              영업권 계산액
              <span className="text-[9px] text-gray-600 ml-1">Σⁿ₌₁⁵ (나 − 마) / (1 + 0.1)ⁿ</span>
            </td>
            <td className="border border-black p-1 text-right font-mono">{fmt(goodwill.goodwillCalc)}</td>
          </tr>
          <tr data-besshi-cell="p5-아" data-testid="p5-아">
            <td className="border border-black p-1 text-center font-mono">아</td>
            <td className="border border-black p-1">영업권 상당액 중 매입 무체재산권 감가상각비 공제분</td>
            <td className="border border-black p-1 text-right font-mono">{fmt(goodwill.intangibleDeduction)}</td>
          </tr>
          <tr
            className="bg-emerald-50 font-bold border-t-2 border-black print:bg-emerald-50"
            data-besshi-cell="p5-자"
            data-testid="p5-자"
          >
            <td className="border border-black p-1 text-center font-mono">자</td>
            <td className="border border-black p-1">
              영업권 평가액 (사 − 아)
              <span className="text-[9px] text-gray-600 ml-1">→ 제2쪽 4.라 기재</span>
            </td>
            <td className="border border-black p-1 text-right font-mono">{fmt(goodwill.goodwillFinal)}</td>
          </tr>
        </tbody>
      </table>

      {/* §55③ 자동배제 사유 badge */}
      {goodwill.excludedByLaw && (
        <p
          className="text-[10px] bg-rose-50 border border-rose-200 p-2 text-rose-800 print:bg-rose-50"
          data-testid="p5-excluded-badge"
          data-besshi-cell="p5-excluded-badge"
        >
          ⚠ {excludedReasonLabel[goodwill.excludedByLaw]}
        </p>
      )}

      {/* OQ-1: 나-마 양수인데 자=0 시 footer 안내 (사례 6 대응) */}
      {showZeroAnomalyFooter && (
        <p
          className="text-[10px] text-amber-700 bg-amber-50 p-2 border border-amber-200 mt-2 print:bg-amber-50"
          data-testid="p5-zero-anomaly-footer"
        >
          ※ 나(가 × 50%) − 마(다 × 라) = {fmt(naMinusMa)}원 양수이나 5년 PV 산식 적용 후 영업권 평가액이 0으로
          산출되었습니다. 상세 근거는 엔진 출력 `appliedRules`·`warnings` 참조.
        </p>
      )}
    </section>
  );
}
