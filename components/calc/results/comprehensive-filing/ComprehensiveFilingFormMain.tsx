"use client";

/**
 * ComprehensiveFilingFormMain — 종합부동산세 신고서 본체 (p.188)
 *
 * 설계: ui.design §1-1 셀 ①~㉘
 * testid prefix: comp-main-
 * 열: 합계 / 주택 / 종합합산토지 / 별도합산토지
 *
 * 빈칸 정책:
 *   - 가산세·분납·토지 열 미해당 칸: 빈칸
 *   - 상한초과 0이면 "0" 표시 (빈칸 아님)
 *   - ①~③: 합계 열 미기재 (PDF 실측)
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
  REQUIRED_DOCS,
  PAPER_SPEC,
  fmtKRW,
  fmtPct,
  DASH,
  besshiTestId,
} from "./comprehensive-filing-constants";

// ============================================================
// 내부 셀 컴포넌트
// ============================================================

function AmountCell({
  amount,
  testId,
  empty,
}: {
  amount?: number;
  testId?: string;
  empty?: boolean;
}) {
  return (
    <td
      className={BESSHI_CELL_AMOUNT}
      data-besshi-cell={testId}
    >
      {empty ? "" : amount != null ? fmtKRW(amount) : ""}
    </td>
  );
}

function RateCell({ rate, testId }: { rate?: number; testId?: string }) {
  return (
    <td className={BESSHI_CELL_RATE} data-besshi-cell={testId}>
      {rate != null ? fmtPct(rate) : ""}
    </td>
  );
}

function BlankCell() {
  return <td className={BESSHI_CELL_AMOUNT}></td>;
}

// ============================================================
// 파생 헬퍼: 과세물건수 (합산배제 제외 후 includedCount)
// ============================================================
function countIncluded(result: ComprehensiveTaxResult): number {
  return result.aggregationExclusion?.includedCount ?? result.properties?.length ?? 0;
}

// ============================================================
// 메인 컴포넌트
// ============================================================

interface Props {
  result: ComprehensiveTaxResult;
}

export function ComprehensiveFilingFormMain({ result }: Props) {
  const year = parseInt(result.assessmentDate?.slice(0, 4) ?? "2022");
  const header = FORM_HEADER.main;

  // 주택분
  const h = result;
  const aggLand = result.aggregateLandTax;
  const sepLand = result.separateLandTax;

  // ⑨ 세부담상한초과 = taxCap이 있을 때: taxBeforeCap - taxCap.cappedTax (≥0)
  const housingCapExcess =
    h.taxCap
      ? Math.max(0, h.taxBeforeCap - h.taxCap.cappedTax)
      : 0;

  // ㉑ 농특세 과세표준 = 결정세액 합계
  const ruralTaxBase =
    h.determinedHousingTax +
    (aggLand?.determinedTax ?? 0) +
    (sepLand?.determinedTax ?? 0);

  // ㉓ 농특세 산출세액
  const ruralTaxAmount =
    h.housingRuralSpecialTax +
    (aggLand?.ruralSpecialTax ?? 0) +
    (sepLand?.ruralSpecialTax ?? 0);

  // 합계 열 금액 계산 (주택+종합합산+별도합산)
  function sumCols(
    hVal: number,
    aggVal: number | undefined,
    sepVal: number | undefined,
  ): number {
    return hVal + (aggVal ?? 0) + (sepVal ?? 0);
  }

  const col4total = sumCols(h.calculatedTax, aggLand?.calculatedTax, sepLand?.calculatedTax);
  const col5total = sumCols(
    h.propertyTaxCredit.creditAmount,
    aggLand?.propertyTaxCredit.creditAmount,
    sepLand?.propertyTaxCredit.creditAmount,
  );
  const col6total = sumCols(h.taxAfterPropertyCredit, 0, 0); // 토지 해당 없음
  const col10total = sumCols(
    h.determinedHousingTax,
    aggLand?.determinedTax ?? 0,
    sepLand?.determinedTax ?? 0,
  );
  const col14total = col10total; // 가산세 0 가정
  const col20total = col14total;

  return (
    <div className="print:break-after-page print:break-inside-avoid text-xs">
      {/* 서식 헤더 */}
      <div className="text-center mb-2">
        <p className="text-sm font-bold">{header.titleTemplate(year)}</p>
        <p className="text-[10px] text-gray-500">
          {header.formCode} ({header.revised})
          <span className="ml-2 text-amber-600">※ {header.hint}</span>
        </p>
        <p className="text-[10px] text-gray-500 mt-0.5">
          정기신고 ☑ (정기신고란에 체크)
        </p>
      </div>

      {/* 신고 구분 안내 */}
      <div className="mb-2 text-[10px] text-gray-600 border border-gray-300 rounded px-2 py-1">
        신고 구분: 정기신고 / 과세기준일: {result.assessmentDate}
      </div>

      {/* 본체 표 */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-400 dark:border-gray-600 text-xs">
          <thead>
            <tr className={BESSHI_ROW_HEADER}>
              <th className="border border-gray-400 dark:border-gray-600 px-1 py-1 text-center w-7">칸</th>
              <th className="border border-gray-400 dark:border-gray-600 px-1 py-1 text-left">구분</th>
              <th className="border border-gray-400 dark:border-gray-600 px-1 py-1 text-right min-w-[90px]">합계</th>
              <th className="border border-gray-400 dark:border-gray-600 px-1 py-1 text-right min-w-[90px]">주택</th>
              <th className="border border-gray-400 dark:border-gray-600 px-1 py-1 text-right min-w-[90px]">종합합산토지</th>
              <th className="border border-gray-400 dark:border-gray-600 px-1 py-1 text-right min-w-[90px]">별도합산토지</th>
            </tr>
          </thead>
          <tbody>
            {/* ① 과세물건수 */}
            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>①</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>과세물건수</td>
              <td className="border border-gray-300"></td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "①", "housing")}
              >
                {countIncluded(h)}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "①", "agg-land")}
              >
                {aggLand?.isSubjectToTax ? "1" : ""}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "①", "sep-land")}
              >
                {sepLand?.isSubjectToTax ? "1" : ""}
              </td>
            </tr>

            {/* ② 과세표준 */}
            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>②</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>과세표준</td>
              <td className="border border-gray-300"></td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "②", "housing")}
              >
                {fmtKRW(h.taxBase)}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "②", "agg-land")}
              >
                {aggLand?.isSubjectToTax ? fmtKRW(aggLand.taxBase) : ""}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "②", "sep-land")}
              >
                {sepLand?.isSubjectToTax ? fmtKRW(sepLand.taxBase) : ""}
              </td>
            </tr>

            {/* ③ 세율 */}
            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>③</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>세율</td>
              <td className="border border-gray-300"></td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_RATE}`}
                data-besshi-cell={besshiTestId("comp-main-", "③", "housing")}
              >
                {fmtPct(h.appliedRate, 2)}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_RATE}`}
                data-besshi-cell={besshiTestId("comp-main-", "③", "agg-land")}
              >
                {aggLand?.isSubjectToTax ? fmtPct(aggLand.appliedRate, 2) : ""}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_RATE}`}
                data-besshi-cell={besshiTestId("comp-main-", "③", "sep-land")}
              >
                {sepLand?.isSubjectToTax ? fmtPct(sepLand.appliedRate, 2) : ""}
              </td>
            </tr>

            {/* ④ 종합부동산세액 */}
            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>④</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>종합부동산세액</td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "④")}
              >
                {fmtKRW(col4total)}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "④", "housing")}
              >
                {fmtKRW(h.calculatedTax)}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "④", "agg-land")}
              >
                {aggLand?.isSubjectToTax ? fmtKRW(aggLand.calculatedTax) : ""}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "④", "sep-land")}
              >
                {sepLand?.isSubjectToTax ? fmtKRW(sepLand.calculatedTax) : ""}
              </td>
            </tr>

            {/* ⑤ 공제할재산세액 */}
            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>⑤</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>공제할 재산세액</td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "⑤")}
              >
                {fmtKRW(col5total)}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "⑤", "housing")}
              >
                {fmtKRW(h.propertyTaxCredit.creditAmount)}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "⑤", "agg-land")}
              >
                {aggLand?.isSubjectToTax ? fmtKRW(aggLand.propertyTaxCredit.creditAmount) : ""}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "⑤", "sep-land")}
              >
                {sepLand?.isSubjectToTax ? fmtKRW(sepLand.propertyTaxCredit.creditAmount) : ""}
              </td>
            </tr>

            {/* ⑥ 산출세액(④−⑤) */}
            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>⑥</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>산출세액 (④−⑤)</td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "⑥")}
              >
                {fmtKRW(col6total)}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "⑥", "housing")}
              >
                {fmtKRW(h.taxAfterPropertyCredit)}
              </td>
              <BlankCell />
              <BlankCell />
            </tr>

            {/* ⑦ 세액공제 — 고령자 */}
            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>⑦</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>세액공제 — 고령자</td>
              <td className="border border-gray-300"></td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "⑦", "housing")}
              >
                {h.oneHouseDeduction ? fmtKRW(h.oneHouseDeduction.seniorAmount) : ""}
              </td>
              <BlankCell />
              <BlankCell />
            </tr>

            {/* ⑧ 세액공제 — 장기보유 */}
            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>⑧</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>세액공제 — 장기보유</td>
              <td className="border border-gray-300"></td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "⑧", "housing")}
              >
                {h.oneHouseDeduction ? fmtKRW(h.oneHouseDeduction.longTermAmount) : ""}
              </td>
              <BlankCell />
              <BlankCell />
            </tr>

            {/* ⑨ 세부담상한초과세액 */}
            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>⑨</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>세부담 상한초과세액</td>
              <td className="border border-gray-300"></td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "⑨", "housing")}
              >
                {/* taxCap 없을 때도 0 표시 (U-M5) */}
                {fmtKRW(housingCapExcess)}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "⑨", "agg-land")}
              >
                {aggLand?.taxCap ? fmtKRW(Math.max(0, (aggLand.taxCap as { cappedTax: number }).cappedTax === aggLand.determinedTax ? 0 : 0)) : ""}
              </td>
              <BlankCell />
            </tr>

            {/* ⑩ 결정세액 */}
            <tr className={BESSHI_ROW_TOTAL}>
              <td className={`border border-gray-400 ${BESSHI_CELL_NO}`}>⑩</td>
              <td className={`border border-gray-400 ${BESSHI_CELL_LABEL} font-semibold`}>결정세액 (⑥−⑦−⑧−⑨)</td>
              <td
                className={`border border-gray-400 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "⑩")}
              >
                {fmtKRW(col10total)}
              </td>
              <td
                className={`border border-gray-400 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "⑩", "housing")}
              >
                {fmtKRW(h.determinedHousingTax)}
              </td>
              <td
                className={`border border-gray-400 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "⑩", "agg-land")}
              >
                {aggLand?.isSubjectToTax ? fmtKRW(aggLand.determinedTax) : ""}
              </td>
              <td
                className={`border border-gray-400 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "⑩", "sep-land")}
              >
                {sepLand?.isSubjectToTax ? fmtKRW(sepLand.determinedTax) : ""}
              </td>
            </tr>

            {/* ⑪⑫⑬ 가산세 (빈칸 고정) */}
            {["⑪ 이자상당가산액", "⑫ 과소신고가산세", "⑬ 납부지연가산세"].map((lbl, idx) => (
              <tr key={idx} className={BESSHI_ROW}>
                <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>{lbl.slice(0, 1)}</td>
                <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>{lbl.slice(1)}</td>
                <td className="border border-gray-300"></td>
                <BlankCell />
                <BlankCell />
                <BlankCell />
              </tr>
            ))}

            {/* ⑭ 자진납부할세액 */}
            <tr className={BESSHI_ROW_TOTAL}>
              <td className={`border border-gray-400 ${BESSHI_CELL_NO}`}>⑭</td>
              <td className={`border border-gray-400 ${BESSHI_CELL_LABEL} font-semibold`}>자진납부할세액 (⑩+⑪+⑫+⑬)</td>
              <td
                className={`border border-gray-400 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "⑭")}
              >
                {fmtKRW(col14total)}
              </td>
              <td
                className={`border border-gray-400 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "⑭", "housing")}
              >
                {fmtKRW(h.determinedHousingTax)}
              </td>
              <td
                className={`border border-gray-400 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "⑭", "agg-land")}
              >
                {aggLand?.isSubjectToTax ? fmtKRW(aggLand.determinedTax) : ""}
              </td>
              <td
                className={`border border-gray-400 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "⑭", "sep-land")}
              >
                {sepLand?.isSubjectToTax ? fmtKRW(sepLand.determinedTax) : ""}
              </td>
            </tr>

            {/* ⑮⑯⑰ 분납 (빈칸 고정) */}
            {["⑮ 분납할세액 현금", "⑯ 분납할세액 물납", "⑰ 분납할세액 계"].map((lbl, idx) => (
              <tr key={idx} className={BESSHI_ROW}>
                <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>{lbl.slice(0, 1)}</td>
                <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>{lbl.slice(1)}</td>
                <td className="border border-gray-300"></td>
                <BlankCell />
                <BlankCell />
                <BlankCell />
              </tr>
            ))}

            {/* ⑱⑲⑳ 차감납부 */}
            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>⑱</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>차감납부세액 현금</td>
              <td className="border border-gray-300"></td>
              <BlankCell />
              <BlankCell />
              <BlankCell />
            </tr>
            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>⑲</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>차감납부세액 물납</td>
              <td className="border border-gray-300"></td>
              <BlankCell />
              <BlankCell />
              <BlankCell />
            </tr>
            <tr className={BESSHI_ROW_TOTAL}>
              <td className={`border border-gray-400 ${BESSHI_CELL_NO}`}>⑳</td>
              <td className={`border border-gray-400 ${BESSHI_CELL_LABEL} font-semibold`}>차감납부세액 계</td>
              <td
                className={`border border-gray-400 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "⑳")}
              >
                {fmtKRW(col20total)}
              </td>
              <td
                className={`border border-gray-400 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "⑳", "housing")}
              >
                {fmtKRW(h.determinedHousingTax)}
              </td>
              <td
                className={`border border-gray-400 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "⑳", "agg-land")}
              >
                {aggLand?.isSubjectToTax ? fmtKRW(aggLand.determinedTax) : ""}
              </td>
              <td
                className={`border border-gray-400 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "⑳", "sep-land")}
              >
                {sepLand?.isSubjectToTax ? fmtKRW(sepLand.determinedTax) : ""}
              </td>
            </tr>

            {/* ㉑㉒㉓ 농특세 */}
            <tr className={BESSHI_ROW_HEADER}>
              <td colSpan={6} className="border border-gray-400 px-2 py-1 font-semibold text-center">
                농어촌특별세 (결정세액 × 20%)
              </td>
            </tr>
            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>㉑</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>농특세 과세표준</td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "㉑")}
              >
                {fmtKRW(ruralTaxBase)}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "㉑", "housing")}
              >
                {fmtKRW(h.determinedHousingTax)}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "㉑", "agg-land")}
              >
                {aggLand?.isSubjectToTax ? fmtKRW(aggLand.determinedTax) : ""}
              </td>
              <td
                className={`border border-gray-300 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "㉑", "sep-land")}
              >
                {sepLand?.isSubjectToTax ? fmtKRW(sepLand.determinedTax) : ""}
              </td>
            </tr>
            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>㉒</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>농특세 세율</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_RATE}`} data-besshi-cell={besshiTestId("comp-main-", "㉒")}>20%</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_RATE}`} data-besshi-cell={besshiTestId("comp-main-", "㉒", "housing")}>20%</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_RATE}`} data-besshi-cell={besshiTestId("comp-main-", "㉒", "agg-land")}>20%</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_RATE}`} data-besshi-cell={besshiTestId("comp-main-", "㉒", "sep-land")}>20%</td>
            </tr>
            <tr className={BESSHI_ROW_TOTAL}>
              <td className={`border border-gray-400 ${BESSHI_CELL_NO}`}>㉓</td>
              <td className={`border border-gray-400 ${BESSHI_CELL_LABEL} font-semibold`}>농특세 산출세액 (㉑×㉒)</td>
              <td
                className={`border border-gray-400 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "㉓")}
              >
                {fmtKRW(ruralTaxAmount)}
              </td>
              <td
                className={`border border-gray-400 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "㉓", "housing")}
              >
                {fmtKRW(h.housingRuralSpecialTax)}
              </td>
              <td
                className={`border border-gray-400 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "㉓", "agg-land")}
              >
                {aggLand?.isSubjectToTax ? fmtKRW(aggLand.ruralSpecialTax) : ""}
              </td>
              <td
                className={`border border-gray-400 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "㉓", "sep-land")}
              >
                {sepLand?.isSubjectToTax ? fmtKRW(sepLand.ruralSpecialTax) : ""}
              </td>
            </tr>

            {/* ㉔㉕ 농특세 가산세 (빈칸) */}
            {["㉔ 이자상당가산액", "㉕ 과소신고가산세"].map((lbl, idx) => (
              <tr key={idx} className={BESSHI_ROW}>
                <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>{lbl.slice(0, 1)}</td>
                <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>{lbl.slice(1)}</td>
                <td className="border border-gray-300"></td>
                <BlankCell />
                <BlankCell />
                <BlankCell />
              </tr>
            ))}

            {/* ㉖ 납부할세액 */}
            <tr className={BESSHI_ROW_TOTAL}>
              <td className={`border border-gray-400 ${BESSHI_CELL_NO}`}>㉖</td>
              <td className={`border border-gray-400 ${BESSHI_CELL_LABEL} font-semibold`}>납부할세액 (㉓+㉔+㉕)</td>
              <td
                className={`border border-gray-400 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "㉖")}
              >
                {fmtKRW(ruralTaxAmount)}
              </td>
              <td
                className={`border border-gray-400 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "㉖", "housing")}
              >
                {fmtKRW(h.housingRuralSpecialTax)}
              </td>
              <td
                className={`border border-gray-400 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "㉖", "agg-land")}
              >
                {aggLand?.isSubjectToTax ? fmtKRW(aggLand.ruralSpecialTax) : ""}
              </td>
              <td
                className={`border border-gray-400 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "㉖", "sep-land")}
              >
                {sepLand?.isSubjectToTax ? fmtKRW(sepLand.ruralSpecialTax) : ""}
              </td>
            </tr>

            {/* ㉗ 분납 (빈칸) */}
            <tr className={BESSHI_ROW}>
              <td className={`border border-gray-300 ${BESSHI_CELL_NO}`}>㉗</td>
              <td className={`border border-gray-300 ${BESSHI_CELL_LABEL}`}>분납할세액</td>
              <td className="border border-gray-300"></td>
              <BlankCell />
              <BlankCell />
              <BlankCell />
            </tr>

            {/* ㉘ 차감납부세액 */}
            <tr className={BESSHI_ROW_TOTAL}>
              <td className={`border border-gray-400 ${BESSHI_CELL_NO}`}>㉘</td>
              <td className={`border border-gray-400 ${BESSHI_CELL_LABEL} font-semibold`}>차감납부세액</td>
              <td
                className={`border border-gray-400 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "㉘")}
              >
                {fmtKRW(ruralTaxAmount)}
              </td>
              <td
                className={`border border-gray-400 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "㉘", "housing")}
              >
                {fmtKRW(h.housingRuralSpecialTax)}
              </td>
              <td
                className={`border border-gray-400 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "㉘", "agg-land")}
              >
                {aggLand?.isSubjectToTax ? fmtKRW(aggLand.ruralSpecialTax) : ""}
              </td>
              <td
                className={`border border-gray-400 ${BESSHI_CELL_AMOUNT}`}
                data-besshi-cell={besshiTestId("comp-main-", "㉘", "sep-land")}
              >
                {sepLand?.isSubjectToTax ? fmtKRW(sepLand.ruralSpecialTax) : ""}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 구비서류 안내 */}
      <div className="mt-3 border border-gray-300 rounded px-2 py-1.5 text-[10px] text-gray-600">
        <p className="font-semibold mb-1">구비서류</p>
        <ol className="list-decimal pl-4 space-y-0.5">
          {REQUIRED_DOCS.map((doc, i) => <li key={i}>{doc}</li>)}
        </ol>
      </div>

      {/* 서명란 */}
      <div className="mt-2 flex justify-between items-end text-[10px] text-gray-600">
        <div>
          <p>위와 같이 신고합니다.</p>
          <p>신고인 (서명 또는 인) ___________</p>
        </div>
        <div className="text-right">
          <p>세무서장 귀하</p>
        </div>
      </div>

      {/* 용지규격 */}
      <p className="text-[9px] text-gray-400 text-right mt-1">{PAPER_SPEC}</p>
    </div>
  );
}
