"use client";

/**
 * BesshiForm4Buppyo3PrintView — 별지 제4호 부표3 비상장주식 평가서 (PDF 출력용)
 *
 * 정책: feedback_print_only_css_toggle
 *   - 인쇄 시 자동 펼침: className={open ? "block" : "hidden print:block"}
 *   - 토글 버튼: print:hidden
 *   - 다크모드 강제 흰 배경
 *
 * 별지 양식 6쪽 구조:
 *   1쪽 — 1.평가대상 + 2.순자산가치만 평가 + 3.1주당 가액의 평가 (③~⑨)
 *   2~3쪽 — 4.순자산가액 (자산총액·부채총액 표)
 *   4쪽 — 5.평가차액
 *   5쪽 — 6.영업권 평가
 *   6쪽 — 7.순손익액 명세 (3년치)
 *
 * Phase 5-C — 기본 인쇄 가능 양식. 정식 react-pdf 컴포넌트는 F-4 후속.
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-valuation-besshi-4-buppyo-3.plan.md
 */

import { useState } from "react";
import { evaluateUnlistedStockV2 } from "@/lib/tax-engine/property-valuation/unlisted-orchestrator";
import type { UnlistedStockValuationInput } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

export interface BesshiForm4Buppyo3PrintViewProps {
  input: UnlistedStockValuationInput;
}

function fmt(n: number): string {
  return n.toLocaleString();
}

export function BesshiForm4Buppyo3PrintView({ input }: BesshiForm4Buppyo3PrintViewProps) {
  const [open, setOpen] = useState(false);

  let result;
  try {
    if (input.totalShares > 0 && input.ownedShares > 0) {
      result = evaluateUnlistedStockV2(input);
    }
  } catch {
    result = undefined;
  }

  return (
    <div className="rounded-lg border border-gray-300 bg-white print:bg-white print:border-none">
      {/* 토글 버튼 — 화면에서만 보임 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between p-3 text-[12px] font-semibold text-gray-700 hover:bg-gray-50 print:hidden"
      >
        <span>📄 별지 제4호 부표3 비상장주식 평가서 (인쇄 미리보기)</span>
        <span className="text-[10px] text-gray-500">{open ? "접기" : "펼치기"}</span>
      </button>

      {/* 양식 본문 — 화면 토글 + 인쇄 자동 펼침 */}
      <div className={open ? "block" : "hidden print:block"}>
        <div className="p-6 print:p-0 text-black text-[11px] font-serif">
          <h1 className="text-center text-base font-bold mb-4">
            비상장주식 등 평가서
          </h1>
          <p className="text-right text-[10px] mb-2">평가심의위원회 운영규정 별지 제4호 서식 부표3 (2021.3.4. 개정)</p>

          {/* 1쪽 — 평가대상 비상장법인 */}
          <SectionTitle>1. 평가대상 비상장법인</SectionTitle>
          <table className="w-full border-collapse border border-black mb-3">
            <tbody>
              <tr>
                <td className="border border-black p-2 bg-gray-100 w-1/4">법인명</td>
                <td className="border border-black p-2">{input.corpName || "-"}</td>
                <td className="border border-black p-2 bg-gray-100 w-1/4">사업자등록번호</td>
                <td className="border border-black p-2">{input.representative ? `대표: ${input.representative}` : "-"}</td>
              </tr>
              <tr>
                <td className="border border-black p-2 bg-gray-100">① 발행주식총수</td>
                <td className="border border-black p-2">{fmt(input.totalShares)}주</td>
                <td className="border border-black p-2 bg-gray-100">1주당 액면가</td>
                <td className="border border-black p-2">{fmt(input.faceValuePerShare)}원</td>
              </tr>
              <tr>
                <td className="border border-black p-2 bg-gray-100">평가기준일</td>
                <td className="border border-black p-2">{input.evaluationDate.toISOString().slice(0, 10)}</td>
                <td className="border border-black p-2 bg-gray-100">② 부동산과다보유법인</td>
                <td className="border border-black p-2">{input.isRealEstateHeavy ? "예 (가중치 반전)" : "아니오"}</td>
              </tr>
            </tbody>
          </table>

          {/* 2. 순자산가치만 평가하는 경우 */}
          {input.netAssetOnlyReason && (
            <>
              <SectionTitle>2. 순자산가치로만 평가하는 경우 [v] 표시 (상증령 §54④)</SectionTitle>
              <p className="border border-black p-2 mb-3 bg-rose-50">
                선택 사유: <strong>
                  {input.netAssetOnlyReason === "liquidation" && "1호 — 청산절차 진행"}
                  {input.netAssetOnlyReason === "lt3y" && "2호 — 사업개시 3년 미만·휴·폐업"}
                  {input.netAssetOnlyReason === "real_estate_80" && "3호 — 부동산 80% 이상 (단서)"}
                  {input.netAssetOnlyReason === "stock_holding_80" && "5호 — 주식 80% 이상 (단서)"}
                  {input.netAssetOnlyReason === "remaining_3y" && "6호 — 잔여 존속기한 3년 이내"}
                </strong>
              </p>
            </>
          )}

          {/* 3. 1주당 가액의 평가 */}
          {result && (
            <>
              <SectionTitle>3. 1주당 가액의 평가</SectionTitle>
              <table className="w-full border-collapse border border-black mb-3">
                <tbody>
                  <ResultTableRow cellNum="③" label="순자산가액" value={fmt(result.netAssetTotal)} />
                  <ResultTableRow cellNum="④" label="1주당 순자산가액 (③ ÷ 발행주식총수)" value={fmt(result.netAssetPerShare)} />
                  <ResultTableRow cellNum="⑤" label="1주당 순손익가치 (최근 3년 가중평균 ÷ 환원율)" value={fmt(result.netIncomePerShare)} />
                  <ResultTableRow cellNum="⑥-㉠" label="가중평균 [(④ × 2 + ⑤ × 3) ÷ 5]" value={fmt(result.weightedAvgPerShare)} />
                  <ResultTableRow cellNum="⑥-㉡" label="순자산가액 × 80% (하한)" value={fmt(result.netAssetFloor80)} />
                  <ResultTableRow cellNum="⑥" label="1주당 평가액 (㉠과 ㉡ 중 큰 금액)" value={fmt(result.finalPerShareValue)} emphasized />
                  {result.premiumRate > 0 ? (
                    <ResultTableRow cellNum="⑧" label={`최대주주 할증평가 (⑥ × ${((1 + result.premiumRate) * 100).toFixed(0)}%)`} value={fmt(result.premiumPerShare)} />
                  ) : (
                    <ResultTableRow cellNum="⑦" label="비최대주주 1주당 평가액" value={fmt(result.perShareValueNonMaxShareholder)} />
                  )}
                  <ResultTableRow cellNum="⑨" label="보충적 평가가액" value={fmt(result.finalPerShareForReporting)} emphasized />
                  <ResultTableRow cellNum="총" label={`상속재산가액 (⑨ × 보유주식수 ${fmt(input.ownedShares)}주)`} value={fmt(result.totalValuation)} emphasized />
                </tbody>
              </table>

              {/* 6쪽 — 순손익액 명세 (3년치) */}
              <SectionTitle>7. 순손익액 (3년치 — 별지 6쪽)</SectionTitle>
              <table className="w-full border-collapse border border-black mb-3 text-[10px]">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-black p-1">구분</th>
                    {result.fiscalYearBreakdowns.map((fy, i) => (
                      <th key={i} className="border border-black p-1">
                        {fy.label}<br />가중치 ×{i === 0 ? 3 : i === 1 ? 2 : 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <BreakdownRow label="① 각 사업연도 소득금액" values={result.fiscalYearBreakdowns.map((fy) => fy.taxableIncome)} />
                  <BreakdownRow label="가산 합계 (②~⑦)" values={result.fiscalYearBreakdowns.map((fy) => fy.addTotal)} />
                  <BreakdownRow label="차감 합계 (⑧~㉒)" values={result.fiscalYearBreakdowns.map((fy) => fy.subTotal)} />
                  <BreakdownRow label="다. 순손익액" values={result.fiscalYearBreakdowns.map((fy) => fy.adjustedNetIncome)} emphasized />
                  <BreakdownRow label="라. 유상증자·감자 반영액 (§56⑤)" values={result.fiscalYearBreakdowns.map((fy) => fy.capitalIncreaseAdjustment)} />
                  <BreakdownRow label="마. 최종 순손익액" values={result.fiscalYearBreakdowns.map((fy) => fy.finalNetIncome)} emphasized />
                  <BreakdownRow label="바. 환산주식수" values={result.fiscalYearBreakdowns.map((fy) => fy.convertedShares)} unit="주" />
                  <BreakdownRow label="사. 1주당 순손익액" values={result.fiscalYearBreakdowns.map((fy) => fy.perShareNetIncome)} />
                </tbody>
              </table>
              <p className="mb-2"><strong>아. 1주당 가중평균 순손익액</strong> = {fmt(result.weightedNetIncomePerShare)}원</p>
              <p className="mb-2"><strong>자. 환원율</strong> = {(result.capitalizationRate * 100).toFixed(0)}% (상증규 §17)</p>
              <p className="mb-3"><strong>차. 1주당 가액</strong> = 아 ÷ 자 = {fmt(result.netIncomePerShare)}원 (1쪽 ⑤)</p>
            </>
          )}

          {/* 푸터 */}
          <p className="text-center text-[9px] text-gray-600 mt-6 print:mt-12">
            ※ 본 양식은 평가심의위원회 운영규정 별지 제4호 서식 부표3을 기준으로 작성되었습니다.<br />
            KoreanLaw MCP 검증: 상증법 §63·시행령 §54·§55·§56·§59 + 시행규칙 §17·§17의2·§17의3·§19 (2026-05-22)
          </p>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[12px] font-bold border-l-4 border-black pl-2 mb-2 mt-3">{children}</h2>;
}

function ResultTableRow({ cellNum, label, value, emphasized }: { cellNum: string; label: string; value: string; emphasized?: boolean }) {
  return (
    <tr className={emphasized ? "bg-yellow-50 font-bold" : ""}>
      <td className="border border-black p-1 w-12 text-center font-mono">{cellNum}</td>
      <td className="border border-black p-1">{label}</td>
      <td className="border border-black p-1 text-right font-mono">{value}원</td>
    </tr>
  );
}

function BreakdownRow({ label, values, emphasized, unit = "원" }: { label: string; values: number[]; emphasized?: boolean; unit?: string }) {
  return (
    <tr className={emphasized ? "bg-yellow-50 font-bold" : ""}>
      <td className="border border-black p-1">{label}</td>
      {values.map((v, i) => (
        <td key={i} className="border border-black p-1 text-right font-mono">{fmt(v)}{unit}</td>
      ))}
    </tr>
  );
}
