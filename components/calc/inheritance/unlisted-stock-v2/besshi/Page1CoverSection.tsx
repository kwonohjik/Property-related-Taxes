"use client";

/**
 * Page1CoverSection — 별지 부표3 제1쪽 (2025.07.10 개정)
 *   1. 평가대상 비상장법인 (법인명·사업자등록번호·대표자·①발행주식·액면가·자본금·평가기준일·②부동산과다)
 *   2. 순자산가치로만 평가하는 경우 [v] — 6행(가~바, 다=2018.2.13. 삭제) 상시 표시
 *   3. 1주당 가액의 평가 (③~⑦ + 보충적 평가가액)
 *
 * Design: docs/02-design/features/inheritance-unlisted-stock-besshi-2025-revision.engine.design.md §5.2·5.3·5.4
 */

import type {
  UnlistedStockValuationInput,
  UnlistedStockValuationResult,
} from "@/lib/tax-engine/types/unlisted-stock-valuation.types";
import { fmt, ResultTableRow, SectionTitle } from "./BesshiSharedAtoms";
import {
  NET_ASSET_REASON_ROWS,
  BESSHI_P1_SECTION3,
  resolveCapitalDisplay,
} from "./besshi-form-constants";

export interface Page1CoverSectionProps {
  input: UnlistedStockValuationInput;
  result?: UnlistedStockValuationResult;
}

export function Page1CoverSection({ input, result }: Page1CoverSectionProps) {
  const reason = input.netAssetOnlyReason;
  const capitalDisplay = resolveCapitalDisplay(input.capital, input.faceValuePerShare, input.totalShares);
  return (
    <section aria-label="제1쪽 평가대상 + 1주당 가액의 평가">
      <SectionTitle>1. 평가대상 비상장법인</SectionTitle>
      <table className="w-full border-collapse border border-black mb-3 text-[10px]">
        <tbody>
          <tr>
            <td className="border border-black p-2 bg-gray-100">법인명</td>
            <td className="border border-black p-2 font-mono">{input.corpName || "-"}</td>
            <td className="border border-black p-2 bg-gray-100">사업자등록번호</td>
            <td className="border border-black p-2 font-mono">{input.businessRegistrationNumber || "-"}</td>
            <td className="border border-black p-2 bg-gray-100">대표자</td>
            <td className="border border-black p-2 font-mono">{input.representative || "-"}</td>
          </tr>
          <tr data-besshi-cell="p1-①" data-testid="p1-①">
            <td className="border border-black p-2 bg-gray-100">① 발행주식총수</td>
            <td className="border border-black p-2 font-mono">{fmt(input.totalShares)}주</td>
            <td className="border border-black p-2 bg-gray-100">1주당 액면가</td>
            <td className="border border-black p-2 font-mono">{fmt(input.faceValuePerShare)}</td>
            <td className="border border-black p-2 bg-gray-100">자본금</td>
            <td className="border border-black p-2 font-mono">{capitalDisplay ? fmt(capitalDisplay) : "-"}</td>
          </tr>
          <tr data-besshi-cell="p1-②" data-testid="p1-②">
            <td className="border border-black p-2 bg-gray-100">평가기준일</td>
            <td className="border border-black p-2 font-mono">
              {input.evaluationDate instanceof Date && !isNaN(input.evaluationDate.getTime())
                ? input.evaluationDate.toISOString().slice(0, 10)
                : "-"}
            </td>
            <td className="border border-black p-2 bg-gray-100">② 부동산과다보유법인</td>
            <td className="border border-black p-2 font-mono" colSpan={3}>{input.isRealEstateHeavy ? "예 (가중치 반전)" : "아니오"}</td>
          </tr>
        </tbody>
      </table>

      {/* 2. 순자산가치로만 평가 — 6행 상시 표시 */}
      <SectionTitle>2. 순자산가치로만 평가하는 경우 [v] 표시 (상증령 §54④)</SectionTitle>
      <table className="w-full border-collapse border border-black mb-3 text-[10px]">
        <tbody>
          {NET_ASSET_REASON_ROWS.map((row) => (
            <tr
              key={row.code}
              className={row.deleted ? "text-gray-400 bg-gray-50 print:bg-gray-50" : ""}
              data-testid={`p1-2-${row.code}`}
            >
              <td className="border border-black p-1 w-8 text-center font-mono">{row.code}</td>
              <td className="border border-black p-1">{row.label}</td>
              <td className="border border-black p-1 w-12 text-center font-mono">
                {row.deleted ? "—" : reason === row.reason ? "[v]" : "[ ]"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {result && (
        <>
          <SectionTitle>3. 1주당 가액의 평가</SectionTitle>
          <table className="w-full table-fixed border-collapse border border-black mb-3">
            <colgroup>
              <col className="w-12" />
              <col />
              <col className="w-40" />
            </colgroup>
            <tbody>
              <ResultTableRow testid="p1-③" cellNum="③" label={BESSHI_P1_SECTION3.netAssetTotal} value={fmt(result.netAssetTotal)} />
              <ResultTableRow testid="p1-④" cellNum="④" label={BESSHI_P1_SECTION3.netAssetPerShare} value={fmt(result.netAssetPerShare)} />
              <ResultTableRow testid="p1-⑤" cellNum="⑤" label={BESSHI_P1_SECTION3.netIncomeValue} value={fmt(result.netIncomePerShare)} />
              {/* 공식 순서: ⑥ 헤더(많은 금액) → ㉮(가중평균) → ㉯(80%) */}
              <ResultTableRow testid="p1-⑥" cellNum="⑥" label={BESSHI_P1_SECTION3.finalPerShareHeader} value={fmt(result.finalPerShareValue)} emphasized />
              <ResultTableRow
                testid="p1-⑥-㉮"
                cellNum="⑥㉮"
                label={
                  input.isRealEstateHeavy
                    ? `${BESSHI_P1_SECTION3.weightedAvgNormal} ${BESSHI_P1_SECTION3.weightedAvgRealEstateNote}`
                    : BESSHI_P1_SECTION3.weightedAvgNormal
                }
                value={fmt(result.weightedAvgPerShare)}
              />
              <ResultTableRow testid="p1-⑥-㉯" cellNum="⑥㉯" label={BESSHI_P1_SECTION3.netAssetFloor80} value={fmt(result.netAssetFloor80)} />
              {/* 공식 순서: ⑦ 헤더 → ㉮(⑥×할증율) → ㉯(⑥+㉮) */}
              {result.premiumRate > 0 ? (
                <>
                  <ResultTableRow testid="p1-⑦" cellNum="⑦" label={BESSHI_P1_SECTION3.maxShareholderHeader} value={fmt(result.premiumPerShare)} emphasized />
                  <ResultTableRow
                    testid="p1-⑦-㉮"
                    cellNum="⑦㉮"
                    label={BESSHI_P1_SECTION3.premiumSurcharge((result.premiumRate * 100).toFixed(0))}
                    value={fmt(result.premiumPerShare - result.finalPerShareValue)}
                  />
                  <ResultTableRow
                    testid="p1-⑦-㉯"
                    cellNum="⑦㉯"
                    label={BESSHI_P1_SECTION3.premiumTotal}
                    value={fmt(result.premiumPerShare)}
                    emphasized
                  />
                </>
              ) : (
                <ResultTableRow testid="p1-⑦" cellNum="⑦" label={BESSHI_P1_SECTION3.nonMaxShareholder} value="해당없음" unit="" />
              )}
              <ResultTableRow testid="p1-⑨" cellNum="⑨" label={BESSHI_P1_SECTION3.reportingValue} value={fmt(result.finalPerShareForReporting)} emphasized />
              <ResultTableRow
                testid="p1-총"
                cellNum="총"
                label={BESSHI_P1_SECTION3.total(fmt(input.ownedShares))}
                value={fmt(result.totalValuation)}
                emphasized
              />
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
