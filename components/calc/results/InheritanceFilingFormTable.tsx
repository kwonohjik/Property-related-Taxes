"use client";

/**
 * InheritanceFilingFormTable — 상속세 사전증여재산 명세 표 (Phase 3 골격)
 *
 * 근거 양식 (KoreanLaw MCP 검증 2026-05-21):
 *   - 별지 제9호서식 = 상속세과세표준신고 및 자진납부계산서
 *   - 부표 1 (상속세과세가액계산명세서) — "가산하는 증여재산가액" §13 합계 표시
 *   - 부표 5 (영리법인 상속세 면제 및 납부 명세서) — §3의2② 면제 전용 양식
 *     ① 법인명 / ② 사업자등록번호 / ③ 사업장 소재지 / ④ 유증 등 재산가액
 *     ⑤ 면제세액 / ⑥ ④×10% / ⑦~⑪ 상속세 납부 대상자
 *
 * 본 컴포넌트는 부표 1·부표 5 보조 명세표 — 행별 사전증여 가독성 우선 구조.
 * 정확한 컬럼 번호 (재산종류코드 01~14, 재산구분코드 A11~A24) 매핑은
 * GIFT_PRIOR_CATEGORY_LABELS 와 부표 1 양식의 일부 차이(토지I/II, 유가증권 분류)
 * 정합화는 후속 마이크로 PR.
 *
 * 책임:
 *   - 사전증여 행별 명세 (증여일·수증자·관계·재산종류·가액·산출세액·기납부)
 *   - 영리법인 행 시각 분기 (🏢 배지 + §13①2호·§3의2② 비고)
 *   - 합계 행 (priorGiftAggregated)
 *   - §3의2② 면제 별도 행은 InheritanceTaxResultView 의 corporateExemption 카드에서 표시 (중복 차단)
 *
 * Out-of-Scope (후속 PR):
 *   - 부표 5 영리법인 면제 명세 별도 컴포넌트 (① 법인명·② 사업자번호·⑩ 지분율 등)
 *   - 부표 1 양식과 동일한 재산종류코드 정합화 (토지I/II 분리 등)
 *
 * Phase 3 후속 적용 완료:
 *   - PR-A: 5년 도과 cutoff 행 참고 표시 (excludedGifts 섹션)
 *   - PR-B: 인쇄 토글 (print-only-css-toggle) — 평소 접힘·인쇄 자동 펼침
 *   - PR-C: doneeId → Heir.id select UI (영리법인 매핑)
 *   - PR-D: 별지 11호 → 9호 부표 1·5 인용 정정 (KoreanLaw MCP 검증)
 */

import { useState } from "react";
import type {
  PriorGift,
  Heir,
  GiftPriorPropertyCategory,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import { isWithin13Cutoff } from "@/lib/tax-engine/inheritance-gift-common";
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
  /** 상속개시일 — cutoff 도과 판정용 (PR-A) */
  deathDate: string;
}

export function InheritanceFilingFormTable({
  priorGifts,
  heirs,
  priorGiftAggregated,
  deathDate,
}: Props) {
  // PR-B: 인쇄 토글 — 평소 접힘 (`hidden`), 인쇄 시 자동 펼침 (`print:block`)
  // useState는 early return 이전에 호출 (react-hooks/rules-of-hooks).
  const [open, setOpen] = useState(false);

  if (priorGifts.length === 0) return null;

  // PR-A: §13 cutoff로 가산 / 도과 분리. 도과 행은 별도 참고 섹션에 표시.
  const includedGifts = priorGifts.filter((g) => isWithin13Cutoff(g, deathDate));
  const excludedGifts = priorGifts.filter((g) => !isWithin13Cutoff(g, deathDate));

  if (includedGifts.length === 0 && excludedGifts.length === 0) return null;

  const heirById = new Map((heirs ?? []).map((h) => [h.id, h]));

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            사전증여재산 명세 (상증법 §13)
          </p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
            상속세 및 증여세법 시행규칙 별지 제9호서식 부표 1 (가산하는 증여재산가액) 보조 명세 · 영리법인은 부표 5 별도 양식
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((p) => !p)}
          className="text-xs rounded-md border border-gray-300 dark:border-gray-600 px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 print:hidden"
          aria-expanded={open}
        >
          {open ? "▲ 접기" : "▼ 펼치기 (인쇄 시 자동 펼침)"}
        </button>
      </div>

      <div className={open ? "block" : "hidden print:block"}>
        {/* 인쇄 시 흰 배경 강제 */}
        <div className="print:bg-white print:text-black">

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
            {includedGifts.map((gift, i) =>
              renderGiftRow(gift, i, heirById, /* dimmed */ false),
            )}
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

      {/* PR-A: §13 cutoff 도과 행 — 참고 표시 (합산 제외) */}
      {excludedGifts.length > 0 && (
        <div className="border-t border-gray-200 dark:border-gray-700">
          <div className="px-4 py-2 bg-amber-50/60 dark:bg-amber-900/10 border-b border-amber-200 dark:border-amber-800">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
              ⓘ §13 합산 기간 도과 — 참고 표시 (상속세 과세가액에 포함되지 않음)
            </p>
            <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5">
              상속인 10년 / 비상속인·영리법인 5년 도과 행. 영리법인은 §3의2② 면제도 미발동.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50/60 dark:bg-gray-800/60 text-gray-500 dark:text-gray-500">
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-3 py-2 text-left font-medium">증여일</th>
                  <th className="px-3 py-2 text-left font-medium">수증자</th>
                  <th className="px-3 py-2 text-left font-medium">관계</th>
                  <th className="px-3 py-2 text-left font-medium">재산종류</th>
                  <th className="px-3 py-2 text-right font-medium">평가가액</th>
                  <th className="px-3 py-2 text-right font-medium">증여세 산출세액</th>
                  <th className="px-3 py-2 text-right font-medium">기납부 증여세</th>
                  <th className="px-3 py-2 text-left font-medium">비고</th>
                </tr>
              </thead>
              <tbody>
                {excludedGifts.map((gift, i) =>
                  renderGiftRow(gift, i, heirById, /* dimmed */ true),
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </div>
      </div>
    </div>
  );
}

// ============================================================
// 행 렌더링 헬퍼 — included/excluded 양쪽에서 재사용
// ============================================================

function renderGiftRow(
  gift: PriorGift,
  index: number,
  heirById: Map<string, Heir>,
  dimmed: boolean,
) {
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

  const baseClass = dimmed
    ? "border-b border-gray-100 dark:border-gray-800 text-gray-500 dark:text-gray-500"
    : "border-b border-gray-100 dark:border-gray-800";
  const corporateBg =
    isCorporate && !dimmed
      ? " bg-violet-50/30 dark:bg-violet-900/10"
      : "";

  return (
    <tr key={index} className={baseClass + corporateBg}>
      <td className="px-3 py-2 font-mono">{gift.giftDate}</td>
      <td className="px-3 py-2">
        {recipient}
        {isCorporate && (
          <span className="ml-1 inline-flex items-center gap-0.5 text-[9px] bg-violet-200 text-violet-800 rounded px-1.5 py-0.5">
            🏢
          </span>
        )}
      </td>
      <td className="px-3 py-2">{relationLabel}</td>
      <td className="px-3 py-2">{categoryLabel}</td>
      <td className="px-3 py-2 text-right font-mono">
        {formatKRW(gift.giftAmount)}
      </td>
      <td className="px-3 py-2 text-right font-mono">
        {computedTax > 0 ? formatKRW(computedTax) : "—"}
      </td>
      <td className="px-3 py-2 text-right font-mono">
        {isCorporate ? (
          <span className="text-[10px]">— (§4의2③ 비과세)</span>
        ) : (
          formatKRW(gift.giftTaxPaid)
        )}
      </td>
      <td className="px-3 py-2 text-[10px]">
        {dimmed
          ? "§13 합산 기간 도과"
          : isCorporate
            ? "🏢 §13①2호 · §3의2② 면제"
            : ""}
      </td>
    </tr>
  );
}
