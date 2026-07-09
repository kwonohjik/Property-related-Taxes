"use client";

/**
 * Page5GoodwillTable — 별지 부표3 제5쪽 6.영업권 (공식 2025.07.10 양식)
 *
 * 공식 3열 [번호+라벨][금액 col2][산식·참조·회색 col3]:
 *   col2(금액): 가/①②③/나/다/마/사/아/자. 라·바는 빈칸(파라미터 → col3).
 *   col3: 가=가중평균 산식 / 라=이자율(10%) / 바=지속연수(5년) / 자=cross-ref / 그 외 회색 빈칸.
 *
 * 라벨·산식·ref는 `besshi-form-constants.ts` 단일 출처 (PDF Page5Goodwill와 공유).
 * ①②③ 연도 annotation 보존(`fiscalYearBreakdowns[i].label`).
 *
 * §55③ 자동배제 4종 badge + OQ-1 zero-anomaly footer 유지.
 * 법령: 상증령 §59② + §55③ + 상증규 §19①
 */

import type {
  UnlistedGoodwillResult,
  FiscalYearBreakdown,
} from "@/lib/tax-engine/types/unlisted-stock-valuation.types";
import { fmt, renderDelta, SectionTitle } from "./BesshiSharedAtoms";
import { BESSHI_P5_SECTION6 } from "./besshi-form-constants";

export interface Page5GoodwillTableProps {
  goodwill: UnlistedGoodwillResult;
  fiscalYearBreakdowns: [FiscalYearBreakdown, FiscalYearBreakdown, FiscalYearBreakdown];
  /** PR-G2: §56② 추정이익 갈음 적용 시 가.(weightedAvg3y) §59③ 추정이익 환산 근거 표시 */
  estimatedProfitApplied?: boolean;
  estimatedProfitAverage?: number;
}

const excludedReasonLabel: Record<NonNullable<UnlistedGoodwillResult["excludedByLaw"]>, string> = {
  liquidation: "§55③ 1호 — 청산절차 진행 → 영업권 가산 없음",
  real_estate_80: "§55③ 1호 — 부동산 80%(§54④3호) → 영업권 가산 없음",
  lt3y: "§55③ 2호 — 사업개시 3년 미만·휴·폐업(§54④2호)",
  continuous_loss_3y: "§55③ 3호 — 직전 3년 계속 결손 → 영업권 자동 0",
};

const TD = "border border-black p-1";

/** 제5쪽 행 — [번호][라벨(다단)][금액 col2][col3] */
function P5Tr({
  cellNum,
  labelLines,
  amount,
  col3,
  testid,
  variant,
}: {
  cellNum: string;
  labelLines: string[];
  amount?: number;
  col3?: string;
  testid: string;
  variant?: "head" | "final";
}) {
  const rowClass =
    variant === "head"
      ? "bg-yellow-50 font-bold print:bg-yellow-50"
      : variant === "final"
        ? "bg-emerald-50 font-bold border-t-2 border-black print:bg-emerald-50"
        : "";
  return (
    <tr className={rowClass} data-besshi-cell={testid} data-testid={testid}>
      <td className={`${TD} text-center font-mono w-12`}>{cellNum}</td>
      <td className={TD}>
        {labelLines.map((ln, i) =>
          i === 0 ? (
            <span key={i}>{ln}</span>
          ) : (
            <span key={i} className="text-micro text-gray-500 ml-1">
              {ln}
            </span>
          ),
        )}
      </td>
      <td className={`${TD} text-right font-mono w-36`}>{amount === undefined ? "" : renderDelta(amount)}</td>
      <td
        className={`${TD} text-center text-micro w-44 ${col3 ? "text-gray-700" : "bg-gray-100 print:bg-gray-100"}`}
      >
        {col3 ?? ""}
      </td>
    </tr>
  );
}

export function Page5GoodwillTable({
  goodwill,
  fiscalYearBreakdowns,
  estimatedProfitApplied,
  estimatedProfitAverage,
}: Page5GoodwillTableProps) {
  const P5 = BESSHI_P5_SECTION6;
  const fyb = fiscalYearBreakdowns;
  // 사례 6 OQ-1: 나-마 양수인데 자=0 시 footer 안내 조건
  const naMinusMa = goodwill.weightedAvgHalf - goodwill.selfCapitalRate;
  const showZeroAnomalyFooter = naMinusMa > 0 && goodwill.goodwillFinal === 0 && !goodwill.excludedByLaw;

  return (
    <section aria-label="제5쪽 6. 영업권">
      <div className="flex items-center justify-between text-micro text-gray-600">
        <span>{P5.unitNote}</span>
        <span>{P5.pageNote}</span>
      </div>
      <SectionTitle>{P5.header}</SectionTitle>
      <table className="w-full border-collapse border border-black mb-3 text-micro">
        <tbody>
          <P5Tr testid="p5-가" cellNum="가" labelLines={[P5.weightedAvgLabel]} amount={goodwill.weightedAvg3y} col3={P5.weightedAvgFormula} variant="head" />
          <P5Tr testid="p5-가-①" cellNum="①" labelLines={[P5.fy1Label, `(${fyb[0].label})`]} amount={fyb[0].finalNetIncome} />
          <P5Tr testid="p5-가-②" cellNum="②" labelLines={[P5.fy2Label, `(${fyb[1].label})`]} amount={fyb[1].finalNetIncome} />
          <P5Tr testid="p5-가-③" cellNum="③" labelLines={[P5.fy3Label, `(${fyb[2].label})`]} amount={fyb[2].finalNetIncome} />
          <P5Tr testid="p5-나" cellNum="나" labelLines={[P5.halfLabel]} amount={goodwill.weightedAvgHalf} />
          <P5Tr testid="p5-다" cellNum="다" labelLines={[P5.selfCapitalLabel]} amount={goodwill.selfCapital} />
          {/* 라·바는 파라미터 → col2 빈칸, 값은 col3 */}
          <P5Tr testid="p5-라" cellNum="라" labelLines={[P5.rateLabel]} col3={P5.ratePct(goodwill.rate)} />
          <P5Tr testid="p5-마" cellNum="마" labelLines={[P5.selfCapitalRateLabel]} amount={goodwill.selfCapitalRate} />
          <P5Tr testid="p5-바" cellNum="바" labelLines={[P5.durationLabel]} col3={P5.durationLabel2(goodwill.durationYears)} />
          <P5Tr testid="p5-사" cellNum="사" labelLines={[P5.goodwillCalcLabel, P5.goodwillCalcFormula, P5.goodwillCalcNote]} amount={goodwill.goodwillCalc} />
          <P5Tr testid="p5-아" cellNum="아" labelLines={[P5.intangibleLabel]} amount={goodwill.intangibleDeduction} />
          <P5Tr testid="p5-자" cellNum="자" labelLines={[P5.finalLabel]} amount={goodwill.goodwillFinal} col3={P5.finalCrossRef} variant="final" />
        </tbody>
      </table>

      {/* §55③ 자동배제 사유 badge */}
      {goodwill.excludedByLaw && (
        <p
          className="text-micro bg-rose-50 border border-rose-200 p-2 text-rose-800 print:bg-rose-50"
          data-testid="p5-excluded-badge"
          data-besshi-cell="p5-excluded-badge"
        >
          ⚠ {excludedReasonLabel[goodwill.excludedByLaw]}
        </p>
      )}

      {/* PR-G2: §59③ 추정이익 준용 — 가.(weightedAvg3y)가 추정이익×주식수 환산임을 안내 */}
      {estimatedProfitApplied && goodwill.goodwillFinal > 0 && (
        <p
          className="text-micro text-violet-800 bg-violet-50 p-2 border border-violet-200 mt-2 print:bg-violet-50"
          data-testid="p5-section59-3"
        >
          ※ 가.(최근 3년 순손익액 가중평균)은 §59③ 준용 §56②에 따라 추정이익 평균가액
          {estimatedProfitAverage !== undefined ? ` ${fmt(estimatedProfitAverage)}` : ""} × 발행주식총수로 환산되었습니다.
        </p>
      )}

      {/* OQ-1: 나-마 양수인데 자=0 시 footer 안내 (사례 6 대응) */}
      {showZeroAnomalyFooter && (
        <p
          className="text-micro text-amber-700 bg-amber-50 p-2 border border-amber-200 mt-2 print:bg-amber-50"
          data-testid="p5-zero-anomaly-footer"
        >
          ※ 나(가 × 50%) − 마(다 × 라) = {fmt(naMinusMa)} 양수이나 5년 PV 산식 적용 후 영업권 평가액이 0으로
          산출되었습니다. 상세 근거는 엔진 출력 `appliedRules`·`warnings` 참조.
        </p>
      )}
    </section>
  );
}
