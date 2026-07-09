"use client";

/**
 * ComprehensiveFilingFormBuppyo5 — 별지 제5호서식 (세부담상한초과세액 계산명세서, p.192)
 *
 * 설계: ui.design §1-3 표(1)~(4)
 * testid prefix: comp-b5-{칸}-{열}  열: -housing / -agg-land / -sep-land
 *
 * 빈칸 정책:
 *   - 직접입력 모드: ⑭⑮ 빈칸, ⑯에 previousYearTotalTax
 *   - 자동모드: previousYearEquivalent echo 사용
 *   - ㉑ = 0이면 "0" 표시 (빈칸 아님, U-M5)
 *   - ⑲ = result.currentYearTotalEquivalent (산식값 채택 — PDF 인쇄본 오기)
 */

import type { ComprehensiveTaxResult } from "@/lib/tax-engine/types/comprehensive.types";
import {
  BESSHI_ROW,
  BESSHI_ROW_TOTAL,
  BESSHI_ROW_HEADER,
  BESSHI_CELL_NO,
  BESSHI_CELL_LABEL,
  BESSHI_CELL_AMOUNT,
  BESSHI_CELL_RATE,
  FORM_HEADER,
  fmtKRW,
  fmtPct,
  DASH,
  besshiTestId,
} from "./comprehensive-filing-constants";

// ============================================================
// Props
// ============================================================

interface Props {
  result: ComprehensiveTaxResult;
  /**
   * 직전연도 세액 직접입력 모드 값 (previousYearTotalTax)
   * 자동모드면 undefined — previousYearEquivalent.total 사용
   */
  previousYearTotalTaxDirect?: number;
}

// ============================================================
// 메인
// ============================================================

export function ComprehensiveFilingFormBuppyo5({
  result,
  previousYearTotalTaxDirect,
}: Props) {
  const year = parseInt(result.assessmentDate?.slice(0, 4) ?? "2022");
  const header = FORM_HEADER.buppyo5;

  const aggLand = result.aggregateLandTax;
  const sepLand = result.separateLandTax;
  const taxCap = result.taxCap;
  const pyEquiv = result.previousYearEquivalent;

  // 직접입력 모드 판정: previousYearEquivalent가 없으면 직접입력
  const isDirectMode = !pyEquiv;

  // ⑭⑮⑯
  const prevPropertyTax = pyEquiv?.propertyTaxEquiv;
  const prevCompTax = pyEquiv?.comprehensiveTaxEquiv;
  const prevTotal = pyEquiv?.total ?? previousYearTotalTaxDirect;

  // ⑰ 상한비율
  const capRate = taxCap?.capRate;

  // ⑱ 상한액
  const capAmount = taxCap?.capAmount;

  // ⑲ 해당연도 총세액상당액 = result.currentYearTotalEquivalent
  const currTotalEquiv = result.currentYearTotalEquivalent;

  // ㉑ = max(0, ⑲ − ⑳) ≡ taxBeforeCap − taxCap.cappedTax
  const capExcess = taxCap
    ? Math.max(0, result.taxBeforeCap - taxCap.cappedTax)
    : 0;

  // 1주택 추가공제
  const extraDeduction = result.oneHouseExtraDeduction;
  const has1HouseExtra = extraDeduction != null && extraDeduction > 0;
  const housingBasicOnly = has1HouseExtra
    ? result.basicDeduction - extraDeduction!
    : result.basicDeduction;

  return (
    <div className="print:break-after-page print:break-inside-avoid text-xs">
      {/* 헤더 */}
      <div className="text-center mb-2">
        <p className="text-sm font-bold">{header.titleTemplate(year)}</p>
        <p className="text-micro text-gray-500">{header.formCode} ({header.revised})</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-400 text-xs">
          <thead>
            <tr className={BESSHI_ROW_HEADER}>
              <th className="border border-gray-400 px-1 py-1 text-center w-7">칸</th>
              <th className="border border-gray-400 px-1 py-1 text-left">구분</th>
              <th className="border border-gray-400 px-1 py-1 text-right min-w-[90px]">주택</th>
              <th className="border border-gray-400 px-1 py-1 text-right min-w-[90px]">종합합산토지</th>
              <th className="border border-gray-400 px-1 py-1 text-right min-w-[90px]">별도합산토지</th>
            </tr>
          </thead>
          <tbody>
            {/* (1) 과세표준·세율·세액 */}
            <tr className={BESSHI_ROW_HEADER}>
              <td colSpan={5} className="border border-gray-400 px-2 py-0.5 font-semibold text-center">
                (1) 과세표준 및 세액
              </td>
            </tr>

            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>①</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>감면후 공시가격</td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b5-", "①", "housing")}
              >
                {fmtKRW(result.includedAssessedValue)}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b5-", "①", "agg-land")}
              >
                {aggLand ? fmtKRW(aggLand.totalOfficialValue) : ""}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b5-", "①", "sep-land")}
              >
                {sepLand ? fmtKRW(sepLand.totalPublicPrice) : ""}
              </td>
            </tr>

            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>②</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>공제금액</td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b5-", "②", "housing")}
              >
                {fmtKRW(housingBasicOnly)}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b5-", "②", "agg-land")}
              >
                {aggLand ? fmtKRW(aggLand.basicDeduction) : ""}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b5-", "②", "sep-land")}
              >
                {sepLand ? fmtKRW(sepLand.basicDeduction) : ""}
              </td>
            </tr>

            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>③</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>1세대1주택자 추가공제</td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b5-", "③", "housing")}
              >
                {has1HouseExtra ? fmtKRW(extraDeduction) : DASH}
              </td>
              <td className="border border-gray-300 text-center text-gray-400">{DASH}</td>
              <td className="border border-gray-300 text-center text-gray-400">{DASH}</td>
            </tr>

            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>④</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>공정시장가액비율</td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_RATE}`}
                data-besshi-cell={besshiTestId("comp-b5-", "④", "housing")}
              >
                {fmtPct(result.fairMarketRatio)}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_RATE}`}
                data-besshi-cell={besshiTestId("comp-b5-", "④", "agg-land")}
              >
                {aggLand ? fmtPct(aggLand.fairMarketRatio) : ""}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_RATE}`}
                data-besshi-cell={besshiTestId("comp-b5-", "④", "sep-land")}
              >
                {sepLand ? fmtPct(sepLand.fairMarketRatio) : ""}
              </td>
            </tr>

            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>⑤</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>과세표준 (①−②−③)×④</td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b5-", "⑤", "housing")}
              >
                {fmtKRW(result.taxBase)}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b5-", "⑤", "agg-land")}
              >
                {aggLand ? fmtKRW(aggLand.taxBase) : ""}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b5-", "⑤", "sep-land")}
              >
                {sepLand ? fmtKRW(sepLand.taxBase) : ""}
              </td>
            </tr>

            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>⑥</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>세율</td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_RATE}`}
                data-besshi-cell={besshiTestId("comp-b5-", "⑥", "housing")}
              >
                {fmtPct(result.appliedRate, 2)}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_RATE}`}
                data-besshi-cell={besshiTestId("comp-b5-", "⑥", "agg-land")}
              >
                {aggLand ? fmtPct(aggLand.appliedRate, 2) : ""}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_RATE}`}
                data-besshi-cell={besshiTestId("comp-b5-", "⑥", "sep-land")}
              >
                {sepLand ? fmtPct(sepLand.appliedRate, 2) : ""}
              </td>
            </tr>

            <tr className={BESSHI_ROW_TOTAL}>
              <td className={`border border-gray-400 ${BESSHI_CELL_NO}`}>⑦</td>
              <td className={`border border-gray-400 ${BESSHI_CELL_LABEL} font-semibold`}>재산세공제전 종부세액</td>
              <td
                className={`border border-gray-400 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b5-", "⑦", "housing")}
              >
                {fmtKRW(result.calculatedTax)}
              </td>
              <td
                className={`border border-gray-400 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b5-", "⑦", "agg-land")}
              >
                {aggLand ? fmtKRW(aggLand.calculatedTax) : ""}
              </td>
              <td
                className={`border border-gray-400 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b5-", "⑦", "sep-land")}
              >
                {sepLand ? fmtKRW(sepLand.calculatedTax) : ""}
              </td>
            </tr>

            {/* (2) 세액공제 */}
            <tr className={BESSHI_ROW_HEADER}>
              <td colSpan={5} className="border border-gray-400 px-2 py-0.5 font-semibold text-center">
                (2) 세액공제
              </td>
            </tr>

            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>⑧</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>해당연도 재산세액</td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b5-", "⑧", "housing")}
              >
                {fmtKRW(result.propertyTaxCredit.totalPropertyTax)}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b5-", "⑧", "agg-land")}
              >
                {aggLand ? fmtKRW(aggLand.propertyTaxCredit.propertyTaxAmount) : ""}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b5-", "⑧", "sep-land")}
              >
                {sepLand ? fmtKRW(sepLand.propertyTaxCredit.propertyTaxAmount) : ""}
              </td>
            </tr>

            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>⑨</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>과세표준 표준세율재산세액</td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b5-", "⑨", "housing")}
              >
                {fmtKRW(result.propertyTaxCredit.comprehensiveTaxBase)}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b5-", "⑨", "agg-land")}
              >
                {aggLand ? fmtKRW(aggLand.propertyTaxCredit.comprehensiveTaxBase) : ""}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b5-", "⑨", "sep-land")}
              >
                {sepLand ? fmtKRW(sepLand.propertyTaxCredit.comprehensiveTaxBase) : ""}
              </td>
            </tr>

            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>⑩</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>총표준세율 재산세액</td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b5-", "⑩", "housing")}
              >
                {fmtKRW(result.propertyTaxCredit.propertyTaxBase)}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b5-", "⑩", "agg-land")}
              >
                {aggLand ? fmtKRW(aggLand.propertyTaxCredit.propertyTaxBase) : ""}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b5-", "⑩", "sep-land")}
              >
                {sepLand ? fmtKRW(sepLand.propertyTaxCredit.propertyTaxBase) : ""}
              </td>
            </tr>

            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>⑪</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>공제할 재산세액 (⑧×⑨/⑩)</td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b5-", "⑪", "housing")}
              >
                {fmtKRW(result.propertyTaxCredit.creditAmount)}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b5-", "⑪", "agg-land")}
              >
                {aggLand ? fmtKRW(aggLand.propertyTaxCredit.creditAmount) : ""}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b5-", "⑪", "sep-land")}
              >
                {sepLand ? fmtKRW(sepLand.propertyTaxCredit.creditAmount) : ""}
              </td>
            </tr>

            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>⑫</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>1세대1주택자 세액공제액</td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b5-", "⑫", "housing")}
              >
                {result.oneHouseDeduction
                  ? fmtKRW(result.oneHouseDeduction.deductionAmount)
                  : DASH}
              </td>
              <td className="border border-gray-300 text-center text-gray-400">{DASH}</td>
              <td className="border border-gray-300 text-center text-gray-400">{DASH}</td>
            </tr>

            <tr className={BESSHI_ROW_TOTAL}>
              <td className={`border border-gray-400 ${BESSHI_CELL_NO}`}>⑬</td>
              <td className={`border border-gray-400 ${BESSHI_CELL_LABEL} font-semibold`}>
                세부담상한 전 종부세액 (⑦−⑪−⑫)
              </td>
              <td
                className={`border border-gray-400 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b5-", "⑬", "housing")}
              >
                {fmtKRW(result.taxBeforeCap)}
              </td>
              <td className="border border-gray-400"></td>
              <td className="border border-gray-400"></td>
            </tr>

            {/* (3) 전년도 세액 */}
            <tr className={BESSHI_ROW_HEADER}>
              <td colSpan={5} className="border border-gray-400 px-2 py-0.5 font-semibold text-center">
                (3) 직전연도 세액 및 세부담 상한
              </td>
            </tr>

            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>⑭</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>전년도 재산세</td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b5-", "⑭", "housing")}
              >
                {/* 직접입력 모드: 빈칸, 자동모드: echo */}
                {!isDirectMode && prevPropertyTax != null ? fmtKRW(prevPropertyTax) : ""}
              </td>
              <td className="border border-gray-300"></td>
              <td className="border border-gray-300"></td>
            </tr>

            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>⑮</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>전년도 종합부동산세</td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b5-", "⑮", "housing")}
              >
                {!isDirectMode && prevCompTax != null ? fmtKRW(prevCompTax) : ""}
              </td>
              <td className="border border-gray-300"></td>
              <td className="border border-gray-300"></td>
            </tr>

            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>⑯</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>합계 (⑭+⑮)</td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b5-", "⑯", "housing")}
              >
                {prevTotal != null ? fmtKRW(prevTotal) : ""}
              </td>
              <td className="border border-gray-300"></td>
              <td className="border border-gray-300"></td>
            </tr>

            {/* ⑰ 상한비율 — 150%/200%/300% 행 고정 출력 */}
            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`} rowSpan={3}>⑰</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>상한비율 — 150% (일반)</td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_RATE}`}
                data-besshi-cell={besshiTestId("comp-b5-", "⑰-150", "housing")}
              >
                {capRate === 1.5 ? "☑ 150%" : "150%"}
              </td>
              <td className="border border-gray-300"></td>
              <td className="border border-gray-300"></td>
            </tr>
            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>상한비율 — 200% (구 다주택)</td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_RATE}`}
                data-besshi-cell={besshiTestId("comp-b5-", "⑰-200", "housing")}
              >
                {capRate === 2.0 ? "☑ 200%" : "200%"}
              </td>
              <td className="border border-gray-300"></td>
              <td className="border border-gray-300"></td>
            </tr>
            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>상한비율 — 300% (구 다주택·3주택)</td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_RATE}`}
                data-besshi-cell={besshiTestId("comp-b5-", "⑰-300", "housing")}
              >
                {capRate === 3.0 ? "☑ 300%" : "300%"}
              </td>
              <td className="border border-gray-300"></td>
              <td className="border border-gray-300"></td>
            </tr>

            <tr className={BESSHI_ROW_TOTAL}>
              <td className={`border border-gray-400 ${BESSHI_CELL_NO}`}>⑱</td>
              <td className={`border border-gray-400 ${BESSHI_CELL_LABEL} font-semibold`}>
                세부담상한액 (⑯×⑰)
              </td>
              <td
                className={`border border-gray-400 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b5-", "⑱", "housing")}
              >
                {capAmount != null ? fmtKRW(capAmount) : ""}
              </td>
              <td className="border border-gray-400"></td>
              <td className="border border-gray-400"></td>
            </tr>

            {/* (4) 세부담상한초과 */}
            <tr className={BESSHI_ROW_HEADER}>
              <td colSpan={5} className="border border-gray-400 px-2 py-0.5 font-semibold text-center">
                (4) 세부담상한초과세액
              </td>
            </tr>

            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>⑲</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>
                해당연도 총세액상당액 (⑧+⑬)
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b5-", "⑲", "housing")}
              >
                {/* result.currentYearTotalEquivalent 우선 (산식값) */}
                {currTotalEquiv != null ? fmtKRW(currTotalEquiv) : ""}
              </td>
              <td className="border border-gray-300"></td>
              <td className="border border-gray-300"></td>
            </tr>

            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>⑳</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>세부담상한액 (⑱)</td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b5-", "⑳", "housing")}
              >
                {capAmount != null ? fmtKRW(capAmount) : ""}
              </td>
              <td className="border border-gray-300"></td>
              <td className="border border-gray-300"></td>
            </tr>

            <tr className={BESSHI_ROW_TOTAL}>
              <td className={`border border-gray-400 ${BESSHI_CELL_NO}`}>㉑</td>
              <td className={`border border-gray-400 ${BESSHI_CELL_LABEL} font-semibold`}>
                세부담상한초과세액 (⑲−⑳, ≥0)
              </td>
              <td
                className={`border border-gray-400 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b5-", "㉑", "housing")}
              >
                {/* 0이면 "0" 표시 (빈칸 아님, U-M5) */}
                {fmtKRW(capExcess)}
              </td>
              <td className="border border-gray-400"></td>
              <td className="border border-gray-400"></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
