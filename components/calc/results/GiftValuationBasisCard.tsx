"use client";

/**
 * GiftValuationBasisCard — 증여재산 평가 산출근거 카드 (상증법 §60~§66)
 *
 * 엔진이 자산별로 생성하는 PropertyValuationResult.breakdown(CalculationStep[])을
 * 결과탭에서 자산별 펼침/접기로 표시한다. 엔진 산식 변경 0 — 기존 breakdown 렌더만.
 *
 * 표시 위치: GiftTaxResultView 의 부표 1(별지 제10호서식) 평가명세서 바로 위.
 * breakdown 행 예 (상업용 건물 임대+공실 §61⑤):
 *   건물 기준시가 → 부수토지 개별공시지가 → §61⑤ 임대료환산가액(임대분)
 *   → 미임대분 건물 기준시가 → 미임대분 토지 기준시가(면적안분)
 *   → 임대보증금 평가특례 합계 → 평가액
 *
 * 정책:
 *   - 자산명은 name.trim() || 재산종류 라벨 (내부 id 노출 금지 — feedback_no_internal_id_in_result)
 *   - 금액 칸 우측 정렬 + tabular-nums (amount-column-align)
 *   - 인쇄 시 자동 펼침 (print-only-css-toggle — hidden print:block)
 *   - 음수 행(§63② 신용보증 차감)은 rose 표기, 최종 "평가액" 행은 강조
 */

import { useState } from "react";
import type {
  EstateItem,
  PropertyValuationResult,
  CalculationStep,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import { PROPERTY_TYPE_LABEL } from "@/lib/calc/gift-valuation-besshi";
import { toEstateItemTypeCode } from "@/components/calc/results/inheritance-filing-form-helpers";

export interface GiftValuationBasisCardProps {
  valuationResults: PropertyValuationResult[];
  /** valuationResults와 estateItemId로 매칭되는 원본 EstateItem (자산명·종류) */
  estateItems: EstateItem[];
}

/** 자산명 — name 우선, 없으면 재산종류 라벨. 내부 id는 절대 미노출. */
function resolveAssetName(item: EstateItem | undefined): string {
  const name = item?.name?.trim();
  if (name) return name;
  if (item) {
    const code = toEstateItemTypeCode(item.category);
    return PROPERTY_TYPE_LABEL[code] ?? "기타재산";
  }
  return "기타재산";
}

export function GiftValuationBasisCard({
  valuationResults,
  estateItems,
}: GiftValuationBasisCardProps) {
  if (!valuationResults || valuationResults.length === 0) return null;

  const itemMap = new Map(estateItems.map((it) => [it.id, it]));
  const hasStock = estateItems.some(
    (it) => it.category === "listed_stock" || it.category === "unlisted_stock",
  );

  return (
    <div
      data-testid="gift-valuation-basis-card"
      className="border border-emerald-200 dark:border-emerald-800 rounded-xl overflow-hidden bg-emerald-50/40 dark:bg-emerald-900/10"
    >
      {/* 헤더 */}
      <div className="bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 flex items-center gap-2 flex-wrap">
        <h4 className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
          증여재산 평가 산출근거
        </h4>
        <span className="text-xs text-emerald-500 dark:text-emerald-400">
          상증법 §60~§66
        </span>
        <span className="text-xs text-emerald-600/70 dark:text-emerald-400/70">
          — {valuationResults.length}건
        </span>
      </div>

      {/* 자산별 행 */}
      <div className="px-4 py-3 space-y-2">
        {valuationResults.map((vr) => (
          <AssetBasis
            key={vr.estateItemId}
            valuatedAmount={vr.valuatedAmount}
            breakdown={vr.breakdown}
            name={resolveAssetName(itemMap.get(vr.estateItemId))}
          />
        ))}

        {hasStock && (
          <p className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80 pt-1">
            ※ 상장·비상장주식의 상세 평가는 아래 주식 평가조서를 참조하세요.
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================
// 자산별 펼침 행
// ============================================================

function AssetBasis({
  name,
  valuatedAmount,
  breakdown,
}: {
  name: string;
  valuatedAmount: number;
  breakdown: CalculationStep[];
}) {
  const [open, setOpen] = useState(false);
  const hasDetail = breakdown.length > 0;

  return (
    <div className="rounded-lg border border-emerald-200/70 dark:border-emerald-800/50 bg-white/70 dark:bg-gray-900/40 overflow-hidden">
      {/* 자산 헤더 — 자산명(좌) + 최종 평가액·▲/▼(우). 서식 토글 통일(증여 명세서·건물 계산서와 동일 패턴) */}
      {hasDetail ? (
        <button
          type="button"
          onClick={() => setOpen((p) => !p)}
          aria-expanded={open}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-emerald-50/60 dark:hover:bg-emerald-900/20 transition-colors"
        >
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{name}</span>
          <span className="flex items-center gap-2">
            <span className="font-mono tabular-nums whitespace-nowrap text-sm font-semibold text-emerald-800 dark:text-emerald-200">
              {valuatedAmount.toLocaleString()}
            </span>
            <span className="text-xs text-emerald-600 dark:text-emerald-400 print:hidden">{open ? "▲" : "▼"}</span>
          </span>
        </button>
      ) : (
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{name}</span>
          <span className="font-mono tabular-nums whitespace-nowrap text-sm font-semibold text-emerald-800 dark:text-emerald-200">
            {valuatedAmount.toLocaleString()}
          </span>
        </div>
      )}

      {/* 산출근거 단계 — 접힘 시에도 인쇄 시 펼침 */}
      {hasDetail && (
        <div
          className={`px-3 pb-2 space-y-0.5 border-t border-emerald-100 dark:border-emerald-900/40 ${
            open ? "" : "hidden print:block"
          }`}
        >
          {breakdown.map((step, i) => (
            <BasisRow key={i} step={step} />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 산출근거 단계 행
// ============================================================

function BasisRow({ step }: { step: CalculationStep }) {
  // 엔진 breakdown 최종 행: label "평가액" + lawRef 없음 (property-valuation.ts)
  const isFinal = step.label === "평가액" && step.lawRef === undefined;
  const isNegative = step.amount < 0;

  return (
    <div
      className={`flex items-start justify-between gap-3 py-1 px-2 rounded ${
        isFinal ? "bg-emerald-100/60 dark:bg-emerald-900/30 font-semibold" : ""
      }`}
    >
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={`text-xs ${
              isFinal
                ? "text-emerald-900 dark:text-emerald-100"
                : "text-gray-700 dark:text-gray-300"
            }`}
          >
            {step.label}
          </span>
          {step.lawRef && (
            <span className="text-[9px] text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700 rounded px-1 leading-tight">
              {step.lawRef}
            </span>
          )}
        </div>
        {step.note && (
          <span className="text-[10px] text-gray-500 dark:text-gray-400">
            {step.note}
          </span>
        )}
      </div>
      <span
        className={`font-mono tabular-nums whitespace-nowrap text-xs ${
          isNegative
            ? "text-rose-600 dark:text-rose-400"
            : isFinal
              ? "text-emerald-800 dark:text-emerald-200"
              : "text-gray-700 dark:text-gray-300"
        }`}
      >
        {step.amount.toLocaleString()}
      </span>
    </div>
  );
}
