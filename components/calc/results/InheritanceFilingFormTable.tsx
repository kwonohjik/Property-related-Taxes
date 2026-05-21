"use client";

/**
 * InheritanceFilingFormTable — 상속세 사전증여재산 명세 표 (Phase 3 골격)
 *
 * 시행규칙 별지 제11호서식 부표 (KoreanLaw MCP 정확 컬럼 검증은 후속 PR).
 * 본 PR은 사용자 가독성 우선 구조 + 자연인·영리법인 분기 표시.
 *
 * 책임:
 *   - 사전증여 행별 명세 (증여일·수증자·관계·재산종류·가액·산출세액·기납부)
 *   - 영리법인 행 시각 분기 (🏢 배지 + §13①2호·§3의2② 비고)
 *   - 합계 행 (priorGiftAggregated)
 *   - §3의2② 면제 별도 행은 InheritanceTaxResultView 의 corporateExemption 카드에서 표시 (중복 차단)
 *
 * Out-of-Scope (후속 PR):
 *   - 별지 11호 정확 컬럼 번호 (KoreanLaw MCP 검증)
 *   - 5년 도과 영리법인 cutoff 행 참고 표시
 *   - 인쇄 토글 (print-only-css-toggle)
 *   - doneeId → Heir.name 매핑 UI
 */

import type {
  PriorGift,
  Heir,
  GiftPriorPropertyCategory,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";

const RELATION_LABEL: Record<string, string> = {
  spouse: "배우자",
  lineal_ascendant_adult: "직계존속(성인)",
  lineal_ascendant_minor: "직계존속(미성년)",
  lineal_descendant: "직계비속",
  other_relative: "기타친족",
};

const CATEGORY_LABEL: Record<GiftPriorPropertyCategory, string> = {
  cash: "01 현금",
  real_estate_land: "02 토지",
  real_estate_apartment: "05 공동주택",
  real_estate_building: "07 일반건물",
  listed_stock: "09 상장주식",
  unlisted_stock: "10 비상장주식",
  financial: "11 금융재산",
  deposit: "11 금융재산 (예금)",
  other: "12 기타재산",
};

interface Props {
  priorGifts: PriorGift[];
  heirs?: Heir[];
  /** 엔진 결과 — 합계 행에 사용 */
  priorGiftAggregated: number;
}

export function InheritanceFilingFormTable({
  priorGifts,
  heirs,
  priorGiftAggregated,
}: Props) {
  if (priorGifts.length === 0 || priorGiftAggregated === 0) return null;

  // 합산 대상 행만 표시 (priorGiftAggregated > 0). cutoff 도과 행은 별도 정책(후속 PR)
  const heirById = new Map((heirs ?? []).map((h) => [h.id, h]));

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          사전증여재산 명세 (상증법 §13)
        </p>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
          별지 제11호서식 부표 — 정확한 컬럼 번호는 후속 PR에서 KoreanLaw MCP 검증 적용
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="px-3 py-2 text-left font-medium">증여일</th>
              <th className="px-3 py-2 text-left font-medium">수증자</th>
              <th className="px-3 py-2 text-left font-medium">관계</th>
              <th className="px-3 py-2 text-left font-medium">재산종류</th>
              <th className="px-3 py-2 text-right font-medium">평가가액</th>
              <th className="px-3 py-2 text-right font-medium">증여세 산출세액</th>
              <th className="px-3 py-2 text-right font-medium">기납부 증여세 (§28)</th>
              <th className="px-3 py-2 text-left font-medium">비고</th>
            </tr>
          </thead>
          <tbody>
            {priorGifts.map((gift, i) => {
              const isCorporate = gift.beneficiaryType === "corporate";
              const recipient = gift.doneeId
                ? heirById.get(gift.doneeId)?.name ?? gift.propertyLocation ?? "—"
                : gift.propertyLocation ?? "—";
              const relationLabel = isCorporate
                ? "영리법인"
                : gift.doneeRelation
                  ? RELATION_LABEL[gift.doneeRelation] ?? "—"
                  : "—";
              const categoryLabel = gift.propertyCategory
                ? CATEGORY_LABEL[gift.propertyCategory]
                : "12 기타재산";
              const computedTax = isCorporate
                ? gift.corporateGiftComputedTax ?? 0
                : gift.computedTax ?? 0;

              return (
                <tr
                  key={i}
                  className={
                    isCorporate
                      ? "border-b border-gray-100 dark:border-gray-800 bg-violet-50/30 dark:bg-violet-900/10"
                      : "border-b border-gray-100 dark:border-gray-800"
                  }
                >
                  <td className="px-3 py-2 font-mono text-gray-700 dark:text-gray-300">
                    {gift.giftDate}
                  </td>
                  <td className="px-3 py-2">
                    {recipient}
                    {isCorporate && (
                      <span className="ml-1 inline-flex items-center gap-0.5 text-[9px] bg-violet-200 text-violet-800 rounded px-1.5 py-0.5">
                        🏢
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">{relationLabel}</td>
                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                    {categoryLabel}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {formatKRW(gift.giftAmount)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {computedTax > 0 ? formatKRW(computedTax) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {isCorporate ? (
                      <span className="text-[10px] text-gray-500">— (§4의2③ 비과세)</span>
                    ) : (
                      formatKRW(gift.giftTaxPaid)
                    )}
                  </td>
                  <td className="px-3 py-2 text-[10px] text-gray-600 dark:text-gray-400">
                    {isCorporate ? "🏢 §13①2호 · §3의2② 면제" : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-gray-50 dark:bg-gray-800 border-t-2 border-gray-300 dark:border-gray-600 font-semibold">
            <tr>
              <td className="px-3 py-2" colSpan={4}>
                합계 (상속세 과세가액 가산)
              </td>
              <td className="px-3 py-2 text-right font-mono">
                {formatKRW(priorGiftAggregated)}
              </td>
              <td className="px-3 py-2" colSpan={3}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
