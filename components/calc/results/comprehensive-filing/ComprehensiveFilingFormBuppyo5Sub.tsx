"use client";

/**
 * ComprehensiveFilingFormBuppyo5Sub — 별지 제5호서식 부표 (직전연도 종합부동산세상당액 계산서, p.194)
 *
 * 설계: ui.design §1-4 표(1)~(2) 칸 ①~⑫
 * testid prefix: comp-b5sub-{칸}-{열}  열: -housing (토지 행 빈칸)
 *
 * 자동계산 모드일 때만 출력 (직접입력 모드: 게이팅 OFF → 컨테이너에서 조건부 렌더)
 * ② 공제금액: 1주택 시 "6억 (1세대1주택: 11억)" 병기 포맷
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
  besshiTestId,
} from "./comprehensive-filing-constants";

// ============================================================
// Props
// ============================================================

interface Props {
  result: ComprehensiveTaxResult;
}

// ============================================================
// 메인
// ============================================================

export function ComprehensiveFilingFormBuppyo5Sub({ result }: Props) {
  const year = parseInt(result.assessmentDate?.slice(0, 4) ?? "2022");
  const header = FORM_HEADER.buppyo5sub;

  const pyEquiv = result.previousYearEquivalent;
  if (!pyEquiv) return null;

  const d = pyEquiv.detail;
  const is1House = d.oneHouseDeductionRate > 0;

  // ② 공제금액 라벨 — 1주택 시 병기 포맷
  const deductionLabel = is1House
    ? `${fmtKRW(d.basicDeductionGeneral)} (1세대1주택: ${fmtKRW(d.basicDeduction)})`
    : fmtKRW(d.basicDeduction);

  return (
    <div className="print:break-inside-avoid text-xs">
      {/* 헤더 */}
      <div className="text-center mb-2">
        <p className="text-sm font-bold">{header.titleTemplate(year)}</p>
        <p className="text-micro text-gray-500">{header.formCode} ({header.revised})</p>
        <p className="text-micro text-amber-600">※ 주택만 기재 (토지 행은 빈칸)</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-400 text-xs">
          <thead>
            <tr className={BESSHI_ROW_HEADER}>
              <th className="border border-gray-400 px-1 py-1 text-center w-7">칸</th>
              <th className="border border-gray-400 px-1 py-1 text-left">구분</th>
              <th className="border border-gray-400 px-1 py-1 text-right min-w-[100px]">주택</th>
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
                data-besshi-cell={besshiTestId("comp-b5sub-", "①", "housing")}
              >
                {fmtKRW(d.assessedValue)}
              </td>
              <td className="border border-gray-300"></td>
              <td className="border border-gray-300"></td>
            </tr>

            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>②</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>
                공제금액
                {is1House && (
                  <span className="ml-1 text-micro text-gray-500">(일반 / 1주택 병기)</span>
                )}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT} text-xs`}
                data-besshi-cell={besshiTestId("comp-b5sub-", "②", "housing")}
              >
                {deductionLabel}
              </td>
              <td className="border border-gray-300"></td>
              <td className="border border-gray-300"></td>
            </tr>

            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>③</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>공정시장가액비율</td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_RATE}`}
                data-besshi-cell={besshiTestId("comp-b5sub-", "③", "housing")}
              >
                {fmtPct(d.fairMarketRatio)}
              </td>
              <td className="border border-gray-300"></td>
              <td className="border border-gray-300"></td>
            </tr>

            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>④</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>과세표준 (①−②)×③</td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b5sub-", "④", "housing")}
              >
                {fmtKRW(d.taxBase)}
              </td>
              <td className="border border-gray-300"></td>
              <td className="border border-gray-300"></td>
            </tr>

            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>⑤</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>세율</td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_RATE}`}
                data-besshi-cell={besshiTestId("comp-b5sub-", "⑤", "housing")}
              >
                {fmtPct(d.appliedRate, 2)}
              </td>
              <td className="border border-gray-300"></td>
              <td className="border border-gray-300"></td>
            </tr>

            <tr className={BESSHI_ROW_TOTAL}>
              <td className={`border border-gray-400 ${BESSHI_CELL_NO}`}>⑥</td>
              <td className={`border border-gray-400 ${BESSHI_CELL_LABEL} font-semibold`}>
                재산세공제전 종부세액
              </td>
              <td
                className={`border border-gray-400 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b5sub-", "⑥", "housing")}
              >
                {fmtKRW(d.calculatedTax)}
              </td>
              <td className="border border-gray-400"></td>
              <td className="border border-gray-400"></td>
            </tr>

            {/* (2) 재산세상당액 및 종부세상당액 */}
            <tr className={BESSHI_ROW_HEADER}>
              <td colSpan={5} className="border border-gray-400 px-2 py-0.5 font-semibold text-center">
                (2) 재산세상당액 및 종합부동산세상당액
              </td>
            </tr>

            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>⑦</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>재산세 상당액</td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b5sub-", "⑦", "housing")}
              >
                {fmtKRW(pyEquiv.propertyTaxEquiv)}
              </td>
              <td className="border border-gray-300"></td>
              <td className="border border-gray-300"></td>
            </tr>

            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>⑧</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>
                과세표준에 대한 표준세율 재산세액
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b5sub-", "⑧", "housing")}
              >
                {fmtKRW(d.stdTaxNumerator)}
              </td>
              <td className="border border-gray-300"></td>
              <td className="border border-gray-300"></td>
            </tr>

            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>⑨</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>총표준세율 재산세액</td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b5sub-", "⑨", "housing")}
              >
                {fmtKRW(d.stdTaxDenominator)}
              </td>
              <td className="border border-gray-300"></td>
              <td className="border border-gray-300"></td>
            </tr>

            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>⑩</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>
                공제할 재산세액 (⑦×⑧/⑨)
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b5sub-", "⑩", "housing")}
              >
                {fmtKRW(d.creditAmount)}
              </td>
              <td className="border border-gray-300"></td>
              <td className="border border-gray-300"></td>
            </tr>

            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>⑪</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>
                1세대1주택자 세액공제액
                <span className="ml-1 text-micro text-gray-500">
                  ({fmtPct(d.oneHouseDeductionRate)} 적용)
                </span>
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b5sub-", "⑪", "housing")}
              >
                {fmtKRW(d.oneHouseDeductionAmount)}
              </td>
              <td className="border border-gray-300"></td>
              <td className="border border-gray-300"></td>
            </tr>

            <tr className={BESSHI_ROW_TOTAL}>
              <td className={`border border-gray-400 ${BESSHI_CELL_NO}`}>⑫</td>
              <td className={`border border-gray-400 ${BESSHI_CELL_LABEL} font-semibold`}>
                종합부동산세 상당액 (⑥−⑩−⑪)
              </td>
              <td
                className={`border border-gray-400 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b5sub-", "⑫", "housing")}
              >
                {fmtKRW(pyEquiv.comprehensiveTaxEquiv)}
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
