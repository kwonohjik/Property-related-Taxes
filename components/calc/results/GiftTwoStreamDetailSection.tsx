"use client";

/**
 * GiftTwoStreamDetailSection — 증여세 조특법 특례 2-스트림 분리과세 상세 카드.
 *
 * GiftTaxResultView.tsx 800줄 분할 (2026-06-26).
 * specialStreamTax > 0 (창업자금 §30의5·가업승계 §30의6 특례) 일 때만 렌더 — 그 외 null.
 * 일반 스트림(§47·§53·§56) + 특례 스트림(10%/20%, §69 배제) + 최종 합산 표시.
 */

import type { GiftTaxResult } from "@/lib/tax-engine/types/inheritance-gift.types";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { Row } from "@/components/calc/results/GiftTaxResultViewHelpers";
import { LawArticleModal } from "@/components/ui/law-article-modal";

export function GiftTwoStreamDetailSection({ result }: { result: GiftTaxResult }) {
  if (!(result.specialStreamTax != null && result.specialStreamTax > 0)) return null;
  return (
    <div className="space-y-2">
      {/* 일반 스트림 */}
      {(result.ordinaryStreamTax != null && result.ordinaryStreamTax > 0) && (
        <div className="border rounded-xl overflow-hidden">
          <div className="bg-muted/30 px-4 py-2.5">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              일반 증여 스트림 (§47·§53·§56)
            </h3>
            <div className="flex flex-wrap gap-1 mt-1">
              <LawArticleModal legalBasis="상증법 §47" label="§47 과세가액" />
              <LawArticleModal legalBasis="상증법 §53" label="§53 증여재산공제" />
              <LawArticleModal legalBasis="상증법 §56" label="§56 세율" />
            </div>
          </div>
          <div className="divide-y divide-border">
            <Row label="일반 증여 산출세액" value={formatKRW(result.ordinaryStreamTax)} highlight />
          </div>
        </div>
      )}
      {(result.ordinaryStreamTax == null || result.ordinaryStreamTax === 0) && (
        <div className="border rounded-xl px-4 py-3 bg-muted/10">
          <p className="text-xs text-muted-foreground">일반 스트림 없음 (일반 증여재산 없음 또는 산출세액 0)</p>
        </div>
      )}

      {/* 특례 스트림 */}
      <div className="border border-emerald-200 rounded-xl overflow-hidden">
        <div className="bg-emerald-50 dark:bg-emerald-900/20 px-4 py-2.5">
          <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
            조특법 과세특례 스트림 (§30의5·§30의6)
          </h3>
          <div className="flex flex-wrap gap-1 mt-1">
            <LawArticleModal legalBasis="조특법 §30의5" label="조특법 §30의5 창업자금" />
            <LawArticleModal legalBasis="조특법 §30의6" label="조특법 §30의6 가업승계" />
          </div>
        </div>
        <div className="divide-y divide-border">
          {(result.specialStreamDebt ?? 0) > 0 && (
            <Row
              label="특례 자산 채무인수 차감 (§47①)"
              value={`- ${formatKRW(result.specialStreamDebt ?? 0)}`}
              sub
              deduction
            />
          )}
          {(result.specialStreamAggregatedValue ?? 0) > 0 && (
            <Row
              label="특례 스트림 합산 과세가액 (신규 + 기간무관 prior)"
              value={formatKRW(result.specialStreamAggregatedValue ?? 0)}
            />
          )}
          <Row
            label="특례 스트림 세액 (10% 또는 20%)"
            value={formatKRW(result.specialStreamTax)}
            highlight
          />
          {/* §30의5⑫ §69 신고세액공제 배제 안내 */}
          {result.creditDetail?.specialTreatmentCredit === 0 && (
            <div className="px-4 py-2.5 text-caption text-amber-700 dark:text-amber-400">
              신고세액공제(§69) 배제 — §30의5⑫(§30의6⑤ 준용): 조특법 과세특례 선택 시 신고세액공제 미적용
            </div>
          )}
        </div>
      </div>

      {/* 최종 납부세액 합산 */}
      {(result.ordinaryStreamTax ?? 0) > 0 && (
        <div className="border border-gray-300 rounded-xl overflow-hidden">
          <div className="bg-muted/50 px-4 py-2.5">
            <h3 className="text-sm font-semibold">최종 납부세액 (일반 + 특례)</h3>
          </div>
          <div className="divide-y divide-border">
            <Row
              label={`= 일반 ${formatKRW(result.ordinaryStreamTax ?? 0)} + 특례 ${formatKRW(result.specialStreamTax)}`}
              value={formatKRW(result.finalTax)}
              highlight
            />
          </div>
        </div>
      )}
    </div>
  );
}
