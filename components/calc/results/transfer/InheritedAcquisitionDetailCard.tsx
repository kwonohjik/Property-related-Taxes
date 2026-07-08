"use client";

/**
 * 상속 취득가액 의제 상세 카드
 *
 * 엔진 result.inheritedAcquisitionDetail (InheritanceAcquisitionResult) 표시.
 *   - Case A (의제취득일 1985.1.1. 전 상속): max(환산취득가, 실가 × 물가상승률) 비교 내역
 *   - Case B (의제취득일 이후 상속): 상속세 신고 평가방법별 신고가액
 *
 * ⑦ 결과 카드 산식 — 한국어 풀어쓰기, 변수 약어·floor()·"원" 끝 금지.
 */

import type { InheritanceAcquisitionResult } from "@/lib/tax-engine/types/inheritance-acquisition.types";

interface Props {
  detail: InheritanceAcquisitionResult;
}

function formatN(n: number): string {
  return n.toLocaleString();
}

/** 산정방법 한국어 라벨 (내부 enum 노출 금지) */
const METHOD_LABELS: Record<InheritanceAcquisitionResult["method"], string> = {
  market_value: "매매사례가액 (시가)",
  appraisal: "감정평가액",
  auction_public_sale: "수용·경매·공매가액",
  similar_sale: "유사매매사례가액",
  supplementary: "보충적평가액 (공시가격)",
  pre_deemed_max: "의제취득일 전 상속·증여 — 상증법 평가액·§164·환산 중 큰 금액",
};

/** 후보 선택 배지 */
function SelectedBadge() {
  return (
    <span className="ml-1 text-[10px] rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 px-1.5 py-0.5">
      선택
    </span>
  );
}

export function InheritedAcquisitionDetailCard({ detail }: Props) {
  const { acquisitionPrice, method, legalBasis, formula, preDeemedBreakdown, warnings } = detail;

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/40 dark:bg-emerald-950/20 p-4 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
          상속 취득가액 의제 계산
        </p>
        <span className="text-[10px] text-muted-foreground">{legalBasis}</span>
        <span className="text-[10px] rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 px-2 py-0.5">
          {METHOD_LABELS[method]}
        </span>
      </div>

      {/* 경고 */}
      {warnings && warnings.length > 0 && (
        <div className="rounded border border-amber-200 bg-amber-50/70 dark:border-amber-800/40 dark:bg-amber-950/30 p-2.5 space-y-0.5">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">주의</p>
          <ul className="text-xs text-amber-900 dark:text-amber-200 pl-3 list-disc space-y-0.5">
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {/* 최종 취득가액 */}
      <div className="rounded bg-white/70 dark:bg-white/5 border border-emerald-100 dark:border-emerald-800/30 p-2.5 flex items-baseline justify-between gap-3">
        <span className="text-xs text-muted-foreground">의제 취득가액</span>
        <span className="text-sm font-semibold font-mono tabular-nums">{formatN(acquisitionPrice)}</span>
      </div>

      {/* 계산 산식 */}
      {formula && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">계산 산식</p>
          <div className="rounded bg-white/70 dark:bg-white/5 border border-emerald-100 dark:border-emerald-800/30 p-2.5 text-xs text-muted-foreground whitespace-pre-wrap">
            {formula}
          </div>
        </div>
      )}

      {/* Case A — 의제취득일 전 상속·증여 취득가액 후보 비교 max(①,②,③) */}
      {preDeemedBreakdown && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
            의제취득일(1985.1.1.) 전 상속·증여 — 취득가액 후보 비교 (큰 금액 적용)
          </p>
          <div className="rounded bg-white/70 dark:bg-white/5 border border-emerald-100 dark:border-emerald-800/30 p-2.5 text-xs space-y-1">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {preDeemedBreakdown.reportedAmount !== null && (
                <>
                  <span className="text-muted-foreground">
                    ① 상증법 평가액 (상속세 신고가액)
                    {preDeemedBreakdown.selectedMethod === "reported" && <SelectedBadge />}
                  </span>
                  <span className="font-mono tabular-nums text-right text-foreground">
                    {formatN(preDeemedBreakdown.reportedAmount)}
                  </span>
                </>
              )}
              <span className="text-muted-foreground">
                ③ 환산취득가액
                {preDeemedBreakdown.selectedMethod === "converted" && <SelectedBadge />}
              </span>
              <span className="font-mono tabular-nums text-right text-foreground">
                {formatN(preDeemedBreakdown.convertedAmount)}
              </span>
            </div>
            <p className="text-muted-foreground pt-1">
              세 금액 중 큰 금액을 취득가액으로 적용 (소령 §163⑨·§176조의2④)
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
