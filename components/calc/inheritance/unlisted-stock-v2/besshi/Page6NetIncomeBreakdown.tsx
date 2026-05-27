"use client";

/**
 * Page6NetIncomeBreakdown — 별지 부표3 제6쪽 7.순손익액 (공식 2025.07.10 양식)
 *
 * 공식 레이아웃: 좌측 그룹 라벨(소득에 가산할 금액 ②~⑦ / 소득에서 차감할 금액 ⑧~㉒) rowSpan +
 *   사업연도 헤더 행 + 가/나 소계 + 다/라/마/바/사(㉓㉔㉕) + 아/자/차.
 *
 * 라벨·행 정의는 `besshi-form-constants.ts` 단일 출처 (PDF Page6NetIncomeBreakdown와 공유).
 * 엔진 산식 무변경 — ②~㉒ 세부값은 FiscalYearBreakdown echo 필드.
 * 법령: 상증령 §56④ + §59 + 상증규 §17
 */

import type {
  UnlistedStockValuationResult,
  FiscalYearBreakdown,
} from "@/lib/tax-engine/types/unlisted-stock-valuation.types";
import { fmt, renderDelta, SectionTitle } from "./BesshiSharedAtoms";
import { P6_ADD_ROWS, P6_SUB_ROWS, BESSHI_P6_SECTION7 } from "./besshi-form-constants";

export interface Page6NetIncomeBreakdownProps {
  result: UnlistedStockValuationResult;
  /** §17의3② 연환산 적용 여부 — evaluateUnlistedStockV2 result.annualizationApplied */
  annualizationApplied?: [boolean, boolean, boolean];
  /** 연환산 후 1주당 순손익액 — evaluateUnlistedStockV2 result.annualizedPerShareNetIncome */
  annualizedPerShareNetIncome?: [number, number, number];
}

const TD = "border border-black p-1";
const TD_VAL = `${TD} text-right font-mono`;

export function Page6NetIncomeBreakdown({
  result,
  annualizationApplied,
  annualizedPerShareNetIncome,
}: Page6NetIncomeBreakdownProps) {
  const P6 = BESSHI_P6_SECTION7;
  const appliedFlags = result.annualizationApplied ?? annualizationApplied;
  const annualizedValues = result.annualizedPerShareNetIncome ?? annualizedPerShareNetIncome;
  const hasAnnualization = appliedFlags?.some((a) => a) ?? false;

  const fyb = result.fiscalYearBreakdowns;
  const echo = (key: keyof FiscalYearBreakdown) =>
    fyb.map((fy) => (fy[key] as number | undefined) ?? 0);
  const valCells = (vals: number[], unit = "") =>
    vals.map((v, i) => (
      <td key={i} className={TD_VAL}>
        {renderDelta(v)}
        {unit}
      </td>
    ));

  return (
    <section aria-label="제6쪽 순손익액 명세">
      <div className="flex items-center justify-between text-[10px] text-gray-600">
        <span>{P6.unitNote}</span>
        <span>{P6.pageNote}</span>
      </div>
      <SectionTitle>{P6.header}</SectionTitle>
      <table className="w-full border-collapse border border-black mb-3 text-[10px]">
        <tbody>
          {/* 사업연도 헤더 */}
          <tr className="bg-gray-100 print:bg-gray-100 font-semibold">
            <td className={`${TD} bg-gray-100`} aria-hidden />
            <td className={TD}>{P6.fyHeaderLabel}</td>
            {fyb.map((fy, i) => (
              <td key={i} className={`${TD} text-center`}>
                {fy.label}
                <br />
                ×{i === 0 ? 3 : i === 1 ? 2 : 1}
              </td>
            ))}
          </tr>

          {/* ① 각 사업연도 소득금액 */}
          <tr data-besshi-cell="p6-①" data-testid="p6-①">
            <td className={`${TD} bg-gray-50`} aria-hidden />
            <td className={TD}>{P6.incomeLabel}</td>
            {valCells(fyb.map((fy) => fy.taxableIncome))}
          </tr>

          {/* 소득에 가산할 금액 ②~⑦ (rowSpan 그룹 라벨) */}
          {P6_ADD_ROWS.map((r, idx) => (
            <tr key={r.num} data-besshi-cell={`p6-${r.num}`} data-testid={`p6-${r.num}`}>
              {idx === 0 && (
                <td rowSpan={P6_ADD_ROWS.length} className={`${TD} bg-gray-50 text-center align-middle font-semibold`}>
                  {P6.addGroupLabel}
                </td>
              )}
              <td className={TD}>{`${r.num} ${r.label}`}</td>
              {valCells(echo(r.key))}
            </tr>
          ))}
          {/* 가. 소계 */}
          <tr className="bg-yellow-50 font-bold print:bg-yellow-50" data-besshi-cell="p6-가" data-testid="p6-가">
            <td className={`${TD} bg-yellow-50`} aria-hidden />
            <td className={TD}>{P6.addSubtotalLabel}</td>
            {valCells(fyb.map((fy) => fy.taxableIncome + fy.addTotal))}
          </tr>

          {/* 소득에서 차감할 금액 ⑧~㉒ (rowSpan 그룹 라벨) */}
          {P6_SUB_ROWS.map((r, idx) => (
            <tr key={r.num} data-besshi-cell={`p6-${r.num}`} data-testid={`p6-${r.num}`}>
              {idx === 0 && (
                <td rowSpan={P6_SUB_ROWS.length} className={`${TD} bg-gray-50 text-center align-middle font-semibold`}>
                  {P6.subGroupLabel}
                </td>
              )}
              <td className={TD}>{`${r.num} ${r.label}`}</td>
              {valCells(echo(r.key))}
            </tr>
          ))}
          {/* 나. 소계 */}
          <tr className="bg-yellow-50 font-bold print:bg-yellow-50" data-besshi-cell="p6-나" data-testid="p6-나">
            <td className={`${TD} bg-yellow-50`} aria-hidden />
            <td className={TD}>{P6.subSubtotalLabel}</td>
            {valCells(fyb.map((fy) => fy.subTotal))}
          </tr>

          {/* 다·라·마·바·사 */}
          <tr className="bg-yellow-50 font-bold print:bg-yellow-50" data-besshi-cell="p6-다" data-testid="p6-다">
            <td className={`${TD} bg-yellow-50`} aria-hidden />
            <td className={TD}>{P6.netLabel}</td>
            {valCells(fyb.map((fy) => fy.adjustedNetIncome))}
          </tr>
          <tr data-besshi-cell="p6-라" data-testid="p6-라">
            <td className={`${TD} bg-gray-50`} aria-hidden />
            <td className={TD}>{P6.capAdjLabel}</td>
            {valCells(fyb.map((fy) => fy.capitalIncreaseAdjustment))}
          </tr>
          <tr className="bg-yellow-50 font-bold print:bg-yellow-50" data-besshi-cell="p6-마" data-testid="p6-마">
            <td className={`${TD} bg-yellow-50`} aria-hidden />
            <td className={TD}>{P6.finalLabel}</td>
            {valCells(fyb.map((fy) => fy.finalNetIncome))}
          </tr>
          <tr data-besshi-cell="p6-바" data-testid="p6-바">
            <td className={`${TD} bg-gray-50`} aria-hidden />
            <td className={TD}>{P6.sharesLabel}</td>
            {valCells(fyb.map((fy) => fy.convertedShares), "주")}
          </tr>
          <tr data-besshi-cell="p6-사" data-testid="p6-사">
            <td className={`${TD} bg-gray-50`} aria-hidden />
            <td className={TD}>
              {P6.perShareLabel} <span className="font-mono">{P6.perShareMarkers.join("")}</span>
            </td>
            {valCells(fyb.map((fy) => fy.perShareNetIncome))}
          </tr>
          {/* §17의3② 연환산 행 — 1년 미만 사업연도 있을 때만 표시 */}
          {hasAnnualization && annualizedValues && appliedFlags && (
            <tr className="bg-amber-50/60 border-t border-amber-200">
              <td className={`${TD} bg-amber-50/60`} aria-hidden />
              <td className={`${TD} text-amber-800 font-semibold`}>
                사-환산. 연환산 후 1주당 순손익액 (§17의3②)
              </td>
              {annualizedValues.map((val, i) => (
                <td key={i} className={TD_VAL}>
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
        <strong>{P6.weightedAvgLabel}</strong> = {fmt(result.weightedNetIncomePerShare)}원
        {hasAnnualization && (
          <span className="ml-2 text-[10px] text-amber-700">※ §17의3② 1년 미만 사업연도 연환산 반영</span>
        )}
      </p>
      <p className="mb-2">
        <strong>{P6.rateLabel}</strong> = {(result.capitalizationRate * 100).toFixed(0)}% (상증규 §17)
      </p>
      <p className="mb-3" data-besshi-cell="p6-차" data-testid="p6-차">
        <strong>{P6.finalPerShareLabel}</strong> = {fmt(result.netIncomePerShare)}원 (제1쪽 ⑤)
      </p>
      {result.estimatedProfitResult?.applied && (
        <p className="mb-3 text-[10px] text-violet-700" data-testid="p6-추정이익">
          ※ §56② 추정이익 갈음 적용 — 위 가중평균(아.) 대신 2 이상 신용평가기관 추정이익 평균가액{" "}
          {fmt(result.estimatedProfitResult.estimatedProfitAverage)}원 ÷ 환원율로 산출
        </p>
      )}
    </section>
  );
}
