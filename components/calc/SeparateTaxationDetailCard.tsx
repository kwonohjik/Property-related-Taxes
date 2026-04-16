"use client";

/**
 * 분리과세 판정 근거 카드 컴포넌트 (P5-09)
 *
 * 표시 항목:
 * - 분리과세 구간 배지 (저율 0.07% / 일반 0.2% / 중과 4%)
 * - 적용 법령 (reasoning.legalBasis)
 * - 판정 조건 설명 (reasoning.matchedCondition)
 * - 배제 합산 유형 (excludedFrom — 종합합산·별도합산·종부세)
 * - 경고 메시지 (warnings)
 * - 과세표준·산출세액 (calculatedTax 있을 때)
 */

import type { SeparateTaxationResult, SeparateTaxationCategory } from "@/lib/tax-engine/separate-taxation";

// ── 유틸 ──────────────────────────────────────────────────────

function formatKRW(amount: number): string {
  return amount.toLocaleString("ko-KR") + "원";
}

function formatRate(rate: number): string {
  return (rate * 100).toFixed(2).replace(/\.?0+$/, "") + "%";
}

// ── 구간 배지 ────────────────────────────────────────────────

const CATEGORY_LABEL: Record<SeparateTaxationCategory, string> = {
  low_rate: "저율 분리과세",
  standard: "일반 분리과세",
  heavy:    "중과 분리과세",
};

const CATEGORY_RATE: Record<SeparateTaxationCategory, string> = {
  low_rate: "0.07%",
  standard: "0.2%",
  heavy:    "4%",
};

const CATEGORY_COLOR: Record<SeparateTaxationCategory, string> = {
  low_rate: "bg-emerald-100 text-emerald-800 border-emerald-200",
  standard: "bg-blue-100 text-blue-800 border-blue-200",
  heavy:    "bg-red-100 text-red-800 border-red-200",
};

function CategoryBadge({ category }: { category: SeparateTaxationCategory }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-sm font-semibold ${CATEGORY_COLOR[category]}`}
    >
      {CATEGORY_LABEL[category]}
      <span className="font-bold">{CATEGORY_RATE[category]}</span>
    </span>
  );
}

// ── 배제 유형 태그 ──────────────────────────────────────────

const EXCLUDED_LABEL: Record<"comprehensive" | "special_aggregated", string> = {
  comprehensive:    "종합합산 배제",
  special_aggregated: "별도합산 배제",
};

function ExcludedBadge({ type }: { type: "comprehensive" | "special_aggregated" }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
      {EXCLUDED_LABEL[type]}
    </span>
  );
}

// ── 메인 컴포넌트 ────────────────────────────────────────────

interface Props {
  result: SeparateTaxationResult;
}

export default function SeparateTaxationDetailCard({ result }: Props) {
  if (!result.isApplicable) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
        <p className="text-sm text-gray-500">
          분리과세 대상이 아닙니다. 종합합산 또는 별도합산 과세가 적용됩니다.
        </p>
        {result.warnings.length > 0 && (
          <ul className="space-y-1.5">
            {result.warnings.map((w, i) => (
              <li key={i} className="flex gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                <span className="shrink-0 mt-0.5">⚠</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const { category, appliedRate, taxBase, fairMarketRatio, calculatedTax, reasoning, warnings } = result;

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden" data-testid="separate-taxation-detail-card">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700">분리과세 판정 결과</h3>
        {category && <CategoryBadge category={category} />}
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* 판정 근거 */}
        <div className="space-y-1">
          <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">적용 법령</dt>
          <dd className="text-sm text-gray-800 font-mono">{reasoning.legalBasis}</dd>
        </div>

        <div className="space-y-1">
          <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">판정 조건</dt>
          <dd className="text-sm text-gray-800">{reasoning.matchedCondition}</dd>
        </div>

        {/* 배제 합산 유형 */}
        {reasoning.excludedFrom.length > 0 && (
          <div className="space-y-1.5">
            <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">배제 합산 유형</dt>
            <dd className="flex flex-wrap gap-1.5">
              {reasoning.excludedFrom.map((type) => (
                <ExcludedBadge key={type} type={type} />
              ))}
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700 border border-purple-200">
                종합부동산세 배제
              </span>
            </dd>
          </div>
        )}

        {/* 세율 및 과세표준 */}
        {appliedRate !== undefined && (
          <div className="rounded-md bg-gray-50 border border-gray-100 divide-y divide-gray-100">
            {fairMarketRatio !== undefined && taxBase !== undefined && (
              <div className="flex justify-between items-center px-3 py-2">
                <span className="text-xs text-gray-500">
                  과세표준 (시가표준액 × {formatRate(fairMarketRatio)}, 천원 절사)
                </span>
                <span className="text-sm font-medium text-gray-800">{formatKRW(taxBase)}</span>
              </div>
            )}
            <div className="flex justify-between items-center px-3 py-2">
              <span className="text-xs text-gray-500">적용 세율</span>
              <span className="text-sm font-semibold text-gray-800">{formatRate(appliedRate)}</span>
            </div>
            {calculatedTax !== undefined && (
              <div className="flex justify-between items-center px-3 py-2 bg-blue-50">
                <span className="text-xs font-semibold text-blue-700">산출세액</span>
                <span className="text-base font-bold text-blue-800">{formatKRW(calculatedTax)}</span>
              </div>
            )}
          </div>
        )}

        {/* 경고 메시지 */}
        {warnings.length > 0 && (
          <ul className="space-y-1.5">
            {warnings.map((w, i) => (
              <li key={i} className="flex gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                <span className="shrink-0 mt-0.5">⚠</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
