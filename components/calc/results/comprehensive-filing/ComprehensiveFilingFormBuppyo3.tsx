"use client";

/**
 * ComprehensiveFilingFormBuppyo3 — 별지 제3호서식 부표 (과세표준 계산명세서, p.190)
 *
 * 설계: ui.design §1-2 칸 ①~⑪
 * testid prefix: comp-b3-{칸}-{열}  열: -housing / -agg-land / -sep-land
 *
 * 빈칸 정책:
 *   - 토지 없으면 해당 열 빈칸
 *   - ② 과세면적: store 전용(서식 표시) — 빈칸 허용
 *   - ④ 공제금액: 1주택=6억 기본공제분, 토지열=5억/80억 고정
 *   - ⑤ 추가공제: 비1주택 시 "—"
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
  DASH,
  fmtKRW,
  fmtPct,
  besshiTestId,
} from "./comprehensive-filing-constants";

// ============================================================
// 파생: 1주택 추가공제 파생 (basicDeduction에서 일반공제 6억 차감)
// ============================================================
const GENERAL_BASIC_DEDUCTION = 600_000_000; // 일반·다주택 기본공제

// ============================================================
// Props
// ============================================================

interface Props {
  result: ComprehensiveTaxResult;
  /** store의 landArea(㎡) — 서식 표시 전용, 엔진 미전송 */
  landArea?: string;
  /** store의 area(㎡) — 건물면적 */
  buildingArea?: string;
}

// ============================================================
// 파생 헬퍼
// ============================================================
function countIncluded(result: ComprehensiveTaxResult): number {
  return result.aggregationExclusion?.includedCount ?? 0;
}

export function ComprehensiveFilingFormBuppyo3({ result, landArea, buildingArea }: Props) {
  const year = parseInt(result.assessmentDate?.slice(0, 4) ?? "2022");
  const header = FORM_HEADER.buppyo3;

  const aggLand = result.aggregateLandTax;
  const sepLand = result.separateLandTax;

  // ⑤ 추가공제: result.oneHouseExtraDeduction (엔진 echo)
  const extraDeduction = result.oneHouseExtraDeduction;
  const has1HouseExtra = extraDeduction != null && extraDeduction > 0;

  // ④ 공제금액 = basicDeduction - extraDeduction (기본공제분만)
  const housingBasicOnly = has1HouseExtra
    ? result.basicDeduction - extraDeduction!
    : result.basicDeduction;

  return (
    <div className="print:break-after-page print:break-inside-avoid text-xs">
      {/* 헤더 */}
      <div className="text-center mb-2">
        <p className="text-sm font-bold">{header.titleTemplate(year)}</p>
        <p className="text-[10px] text-gray-500">
          {header.formCode} ({header.revised})
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-400 dark:border-gray-600 text-xs">
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
            {/* ① 과세물건수 */}
            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>①</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>과세물건수</td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b3-", "①", "housing")}
              >
                {countIncluded(result)}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b3-", "①", "agg-land")}
              >
                {aggLand?.isSubjectToTax ? "1" : ""}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b3-", "①", "sep-land")}
              >
                {sepLand?.isSubjectToTax ? "1" : ""}
              </td>
            </tr>

            {/* ② 과세면적 (토지/건물 2행 — store 전용) */}
            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`} rowSpan={2}>②</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>과세면적 — 토지 (㎡)</td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b3-", "②-land", "housing")}
              >
                {landArea ? `${landArea}㎡` : ""}
              </td>
              <td className="border border-gray-300"></td>
              <td className="border border-gray-300"></td>
            </tr>
            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>과세면적 — 건물 (㎡)</td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b3-", "②-building", "housing")}
              >
                {buildingArea ? `${buildingArea}㎡` : ""}
              </td>
              <td className="border border-gray-300"></td>
              <td className="border border-gray-300"></td>
            </tr>

            {/* ③ 감면후 공시가격 — 조례 감면 적용 시 effectiveIncludedAssessedValue, 미적용 시 includedAssessedValue */}
            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>③</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>감면후 공시가격</td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b3-", "③", "housing")}
              >
                {fmtKRW(result.effectiveIncludedAssessedValue ?? result.includedAssessedValue)}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b3-", "③", "agg-land")}
              >
                {aggLand ? fmtKRW(aggLand.totalOfficialValue) : ""}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b3-", "③", "sep-land")}
              >
                {sepLand ? fmtKRW(sepLand.totalPublicPrice) : ""}
              </td>
            </tr>

            {/* ④ 공제금액 */}
            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>④</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>공제금액</td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b3-", "④", "housing")}
              >
                {fmtKRW(housingBasicOnly)}
              </td>
              {/* 토지: 5억/80억 고정 기재 */}
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b3-", "④", "agg-land")}
              >
                {aggLand ? fmtKRW(aggLand.basicDeduction) : ""}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b3-", "④", "sep-land")}
              >
                {sepLand ? fmtKRW(sepLand.basicDeduction) : ""}
              </td>
            </tr>

            {/* ⑤ 1세대1주택자 추가공제 */}
            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>⑤</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>1세대1주택자 추가공제</td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b3-", "⑤", "housing")}
              >
                {has1HouseExtra ? fmtKRW(extraDeduction) : DASH}
              </td>
              <td className="border border-gray-300 text-center text-gray-400">{DASH}</td>
              <td className="border border-gray-300 text-center text-gray-400">{DASH}</td>
            </tr>

            {/* ⑥ 공정시장가액비율 */}
            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>⑥</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>공정시장가액비율</td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_RATE}`}
                data-besshi-cell={besshiTestId("comp-b3-", "⑥", "housing")}
              >
                {fmtPct(result.fairMarketRatio)}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_RATE}`}
                data-besshi-cell={besshiTestId("comp-b3-", "⑥", "agg-land")}
              >
                {aggLand ? fmtPct(aggLand.fairMarketRatio) : ""}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_RATE}`}
                data-besshi-cell={besshiTestId("comp-b3-", "⑥", "sep-land")}
              >
                {sepLand ? fmtPct(sepLand.fairMarketRatio) : ""}
              </td>
            </tr>

            {/* ⑦ 과세표준 */}
            <tr className={BESSHI_ROW_TOTAL}>
              <td className={`border border-gray-400 ${BESSHI_CELL_NO}`}>⑦</td>
              <td className={`border border-gray-400 ${BESSHI_CELL_LABEL} font-semibold`}>
                과세표준 (③−④−⑤)×⑥
              </td>
              <td
                className={`border border-gray-400 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b3-", "⑦", "housing")}
              >
                {fmtKRW(result.taxBase)}
              </td>
              <td
                className={`border border-gray-400 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b3-", "⑦", "agg-land")}
              >
                {aggLand ? fmtKRW(aggLand.taxBase) : ""}
              </td>
              <td
                className={`border border-gray-400 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b3-", "⑦", "sep-land")}
              >
                {sepLand ? fmtKRW(sepLand.taxBase) : ""}
              </td>
            </tr>

            {/* ⑧⑨⑩⑪ 재산세 안분 공제 */}
            <tr className={BESSHI_ROW_HEADER}>
              <td colSpan={5} className="border border-gray-400 px-2 py-1 text-center font-semibold">
                재산세 비율 안분 공제 (시행령 §4의3)
              </td>
            </tr>

            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>⑧</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>해당연도 재산세액</td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b3-", "⑧", "housing")}
              >
                {fmtKRW(result.propertyTaxCredit.totalPropertyTax)}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b3-", "⑧", "agg-land")}
              >
                {aggLand ? fmtKRW(aggLand.propertyTaxCredit.propertyTaxAmount) : ""}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b3-", "⑧", "sep-land")}
              >
                {sepLand ? fmtKRW(sepLand.propertyTaxCredit.propertyTaxAmount) : ""}
              </td>
            </tr>

            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>⑨</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>
                과세표준 표준세율 재산세액
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b3-", "⑨", "housing")}
              >
                {fmtKRW(result.propertyTaxCredit.comprehensiveTaxBase)}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b3-", "⑨", "agg-land")}
              >
                {aggLand ? fmtKRW(aggLand.propertyTaxCredit.comprehensiveTaxBase) : ""}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b3-", "⑨", "sep-land")}
              >
                {sepLand ? fmtKRW(sepLand.propertyTaxCredit.comprehensiveTaxBase) : ""}
              </td>
            </tr>

            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>⑩</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>총 표준세율 재산세액</td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b3-", "⑩", "housing")}
              >
                {fmtKRW(result.propertyTaxCredit.propertyTaxBase)}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b3-", "⑩", "agg-land")}
              >
                {aggLand ? fmtKRW(aggLand.propertyTaxCredit.propertyTaxBase) : ""}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b3-", "⑩", "sep-land")}
              >
                {sepLand ? fmtKRW(sepLand.propertyTaxCredit.propertyTaxBase) : ""}
              </td>
            </tr>

            <tr className={BESSHI_ROW_TOTAL}>
              <td className={`border border-gray-400 ${BESSHI_CELL_NO}`}>⑪</td>
              <td className={`border border-gray-400 ${BESSHI_CELL_LABEL} font-semibold`}>
                공제할 재산세액 (⑧×⑨/⑩)
              </td>
              <td
                className={`border border-gray-400 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b3-", "⑪", "housing")}
              >
                {fmtKRW(result.propertyTaxCredit.creditAmount)}
              </td>
              <td
                className={`border border-gray-400 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b3-", "⑪", "agg-land")}
              >
                {aggLand ? fmtKRW(aggLand.propertyTaxCredit.creditAmount) : ""}
              </td>
              <td
                className={`border border-gray-400 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-b3-", "⑪", "sep-land")}
              >
                {sepLand ? fmtKRW(sepLand.propertyTaxCredit.creditAmount) : ""}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
