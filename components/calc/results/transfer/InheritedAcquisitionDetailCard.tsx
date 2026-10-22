"use client";

/**
 * 상속 취득가액 의제 상세 카드
 *
 * 엔진 result.inheritedAcquisitionDetail (InheritanceAcquisitionResult) 표시.
 *   - Case A (의제취득일 1985.1.1. 전 상속): max(① 상증법 평가액, ② §164④~⑦ 취득당시 기준시가,
 *     ③ 환산취득가) 비교 내역. ※ 물가상승률 방식(§176조의2④2호)은 무상취득에 부적용 — 미구현
 *   - Case B (의제취득일 이후 상속): 상속세 신고 평가방법별 신고가액
 *
 * ⑦ 결과 카드 산식 — 한국어 풀어쓰기, 변수 약어·floor()·"원" 끝 금지.
 */

import type { InheritanceAcquisitionResult } from "@/lib/tax-engine/types/inheritance-acquisition.types";
import { FormulaText } from "@/components/calc/results/shared/FormulaParts";

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
  /**
   * 엔진은 3자 max다 — `max(① 상증법 평가액, ② §164 기준시가, ③ 환산취득가액)`, 동점은 ① > ② > ③
   * (`inheritance-acquisition-price.ts` `calcPreDeemed`, 2026-10-22 「가목 우선」에서 변경 — 근거 상속증여세과-223).
   * 종전 라벨 「나목(환산)은 가목 확인불가 시」는 가목 우선 시절 문구다.
   */
  pre_deemed_max: "의제취득일 전 상속·증여 — 상증법 평가액·§164 기준시가·환산취득가액 중 큰 금액",
};

/** 후보 선택 배지 */
function SelectedBadge() {
  return (
    <span className="ml-1 text-micro rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 px-1.5 py-0.5">
      선택
    </span>
  );
}

/** 의제취득일 전 후보 한 줄 — 채택이면 「선택」, 아니면 「(미적용)」 + 취소선 */
function PreDeemedCandidateRow({ label, amount, selected }: { label: string; amount: number; selected: boolean }) {
  return (
    <>
      <span className="text-muted-foreground">
        {label}
        {selected ? <SelectedBadge /> : <span className="ml-1 text-micro text-muted-foreground">(미적용)</span>}
      </span>
      <span
        className={
          selected
            ? "font-mono tabular-nums text-right text-foreground"
            : "font-mono tabular-nums text-right text-muted-foreground line-through"
        }
      >
        {formatN(amount)}
      </span>
    </>
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
        <span className="text-micro text-muted-foreground">{legalBasis}</span>
        <span className="text-micro rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 px-2 py-0.5">
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
            <FormulaText value={formula} />
          </div>
        </div>
      )}

      {/* Case A — 의제취득일 전 상속·증여: ①②③ 중 큰 금액(엔진 `calcPreDeemed` 3자 max).
          ①② = 소령 §163⑨(법 §97①1호 가목 의제) · ③ = 소령 §163⑫ → §176조의2(나목). */}
      {preDeemedBreakdown && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
            의제취득일(1985.1.1.) 전 상속·증여 — 취득가액 산정
          </p>
          <div className="rounded bg-white/70 dark:bg-white/5 border border-emerald-100 dark:border-emerald-800/30 p-2.5 text-xs space-y-1">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {preDeemedBreakdown.reportedAmount !== null && (
                <PreDeemedCandidateRow
                  label="① 상증법 평가액 (상속세 신고가액)"
                  amount={preDeemedBreakdown.reportedAmount}
                  selected={preDeemedBreakdown.selectedMethod === "reported"}
                />
              )}
              {preDeemedBreakdown.sec164Amount !== null && (
                <PreDeemedCandidateRow
                  label="② 취득당시 기준시가 (소령 §164④~⑦)"
                  amount={preDeemedBreakdown.sec164Amount}
                  selected={preDeemedBreakdown.selectedMethod === "sec164"}
                />
              )}
              <PreDeemedCandidateRow
                label="③ 환산취득가액"
                amount={preDeemedBreakdown.convertedAmount}
                selected={preDeemedBreakdown.selectedMethod === "converted"}
              />
            </div>
            <p className="text-muted-foreground pt-1">
              {preDeemedBreakdown.selectedMethod === "converted"
                ? "①②③ 중 큰 금액 — 환산취득가액 적용 (소령 §163⑫ → §176조의2④)"
                : "①②③ 중 큰 금액 — 실지거래가액 의제 적용 (소령 §163⑨)"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
