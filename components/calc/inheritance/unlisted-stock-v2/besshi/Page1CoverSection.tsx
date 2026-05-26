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
  UnlistedNetAssetOnlyReason,
} from "@/lib/tax-engine/types/unlisted-stock-valuation.types";
import { fmt, ResultTableRow, SectionTitle } from "./BesshiSharedAtoms";

// 2번 §54④ 6행 (가~바). 다(3호)는 2018.2.13. 삭제 — 회색 비활성 표시
const NET_ASSET_REASON_ROWS: {
  code: string;
  label: string;
  reason?: UnlistedNetAssetOnlyReason;
  deleted?: boolean;
}[] = [
  { code: "가", label: "신고기한 내 청산절차 진행·사업계속 곤란 (1호)", reason: "liquidation" },
  { code: "나", label: "사업개시 전·3년 미만·휴업·폐업 (2호)", reason: "lt3y" },
  { code: "다", label: "3년 연속 결손금 (2018.2.13. 삭제)", deleted: true },
  { code: "라", label: "자산총액 중 부동산 80% 이상 (3호)", reason: "real_estate_80" },
  { code: "마", label: "자산총액 중 주식 등 80% 이상 (5호)", reason: "stock_holding_80" },
  { code: "바", label: "잔여 존속기한 3년 이내 (6호)", reason: "remaining_3y" },
];

export interface Page1CoverSectionProps {
  input: UnlistedStockValuationInput;
  result?: UnlistedStockValuationResult;
}

export function Page1CoverSection({ input, result }: Page1CoverSectionProps) {
  const reason = input.netAssetOnlyReason;
  return (
    <section aria-label="제1쪽 평가대상 + 1주당 가액의 평가">
      <SectionTitle>1. 평가대상 비상장법인</SectionTitle>
      <table className="w-full border-collapse border border-black mb-3 text-[10px]">
        <tbody>
          <tr>
            <td className="border border-black p-2 bg-gray-100">법인명</td>
            <td className="border border-black p-2">{input.corpName || "-"}</td>
            <td className="border border-black p-2 bg-gray-100">사업자등록번호</td>
            <td className="border border-black p-2">{input.businessRegistrationNumber || "-"}</td>
            <td className="border border-black p-2 bg-gray-100">대표자</td>
            <td className="border border-black p-2">{input.representative || "-"}</td>
          </tr>
          <tr data-besshi-cell="p1-①" data-testid="p1-①">
            <td className="border border-black p-2 bg-gray-100">① 발행주식총수</td>
            <td className="border border-black p-2">{fmt(input.totalShares)}주</td>
            <td className="border border-black p-2 bg-gray-100">1주당 액면가</td>
            <td className="border border-black p-2">{fmt(input.faceValuePerShare)}원</td>
            <td className="border border-black p-2 bg-gray-100">자본금</td>
            <td className="border border-black p-2">{input.capital ? `${fmt(input.capital)}원` : "-"}</td>
          </tr>
          <tr data-besshi-cell="p1-②" data-testid="p1-②">
            <td className="border border-black p-2 bg-gray-100">평가기준일</td>
            <td className="border border-black p-2">
              {input.evaluationDate instanceof Date && !isNaN(input.evaluationDate.getTime())
                ? input.evaluationDate.toISOString().slice(0, 10)
                : "-"}
            </td>
            <td className="border border-black p-2 bg-gray-100">② 부동산과다보유법인</td>
            <td className="border border-black p-2" colSpan={3}>{input.isRealEstateHeavy ? "예 (가중치 반전)" : "아니오"}</td>
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
          <table className="w-full border-collapse border border-black mb-3">
            <tbody>
              <ResultTableRow testid="p1-③" cellNum="③" label="순자산가액 (제2쪽 4.마)" value={fmt(result.netAssetTotal)} />
              <ResultTableRow testid="p1-④" cellNum="④" label="1주당 순자산가액 (③ ÷ ①)" value={fmt(result.netAssetPerShare)} />
              <ResultTableRow testid="p1-⑤" cellNum="⑤" label="1주당 순손익가치 (제6쪽 7.차)" value={fmt(result.netIncomePerShare)} />
              <ResultTableRow testid="p1-⑥-㉮" cellNum="⑥㉮" label="가중평균 [{(④×2)+(⑤×3)}÷5]" value={fmt(result.weightedAvgPerShare)} />
              <ResultTableRow testid="p1-⑥-㉯" cellNum="⑥㉯" label="1주당 순자산가액(④)의 80%" value={fmt(result.netAssetFloor80)} />
              <ResultTableRow testid="p1-⑥" cellNum="⑥" label="1주당 평가액 (㉮·㉯ 중 많은 금액)" value={fmt(result.finalPerShareValue)} emphasized />
              {result.premiumRate > 0 ? (
                <>
                  <ResultTableRow
                    testid="p1-⑦-㉮"
                    cellNum="⑦㉮"
                    label={`최대주주 할증분 (⑥ × ${(result.premiumRate * 100).toFixed(0)}%)`}
                    value={fmt(result.premiumPerShare - result.finalPerShareValue)}
                  />
                  <ResultTableRow
                    testid="p1-⑦-㉯"
                    cellNum="⑦㉯"
                    label="최대주주 1주당 평가액 (⑥ + ㉮)"
                    value={fmt(result.premiumPerShare)}
                    emphasized
                  />
                </>
              ) : (
                <ResultTableRow testid="p1-⑦" cellNum="⑦" label="최대주주 해당 없음 (⑥ 적용)" value="해당없음" unit="" />
              )}
              <ResultTableRow testid="p1-⑨" cellNum="⑨" label="보충적 평가가액" value={fmt(result.finalPerShareForReporting)} emphasized />
              <ResultTableRow
                testid="p1-총"
                cellNum="총"
                label={`상속재산가액 (⑨ × 보유주식수 ${fmt(input.ownedShares)}주)`}
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
