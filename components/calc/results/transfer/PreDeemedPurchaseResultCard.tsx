"use client";

/**
 * ⑦ 의제취득일 전 «매수» 부동산 — 영 §176조의2④ 「많은 것」 비교 카드
 * 계획서: docs/02-design/features/realestate-pre-deemed-purchase-176-2-4.plan.md §4.3 ⑦
 *
 * 주식 카드(`components/calc/results/PreDeemedAcquisitionResultCard.tsx`)와 같은 표 구성. 금액에는 「원」을 붙이지 않는다(단위는 헤더).
 */
import type { PreDeemedPurchaseDetail } from "@/lib/tax-engine/types/transfer-pre-deemed-purchase.types";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { PRE_DEEMED_PPI_FOOTNOTE } from "@/components/calc/results/PreDeemedAcquisitionResultCard";

const num = (n: number) => n.toLocaleString("ko-KR");
const METHOD: Record<NonNullable<PreDeemedPurchaseDetail["clause1Method"]>, string> = {
  estimated: "환산취득가액",
  appraisal: "감정가액",
  salesCase: "매매사례가액",
  redevelopment166_3: "§166③ 환산취득가액",
};
const dot = (d: string) => d.replace(/-0?/g, ".") + ".";

export function PreDeemedPurchaseResultCard({ detail }: { detail: PreDeemedPurchaseDetail }) {
  const picked2 = detail.selected === "clause2";
  const clause1Label = detail.clause1Method ? METHOD[detail.clause1Method] : "매매사례가액·감정가액·환산취득가액";
  return (
    <ToneCard
      tone="amber"
      title={`의제취득일 전 매수${detail.part === "land" ? " (토지)" : detail.part === "building" ? " (건물)" : ""} — 취득가액 「많은 것」 비교`}
      titleExtra={
        <LawArticleModal
          legalBasis="소득세법 시행령 §176의2"
          label="영 §176조의2④"
          className="px-2 py-0.5 rounded-full border text-micro bg-amber-100 text-amber-700 border-amber-200 font-medium"
        />
      }
      bodyClassName="space-y-3"
    >
      <div data-testid="pre-deemed-purchase-result-card" className="space-y-3">
        <p className="text-xs text-amber-800 leading-relaxed dark:text-amber-200">
          실제 취득일({dot(detail.originalAcquisitionDate)})이 의제취득일(1985.1.1.) 전이므로 ② 취득 당시 실지거래가액에 생산자물가상승분을
          더한 금액과 ① 의제취득일 현재 {clause1Label} 중 <strong>많은 것</strong>을 취득가액으로 합니다.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-amber-200 text-amber-700 dark:text-amber-300">
                <th className="px-3 py-2 text-left font-semibold">구분</th>
                <th className="px-3 py-2 text-right font-semibold">금액 (원)</th>
              </tr>
            </thead>
            <tbody className="text-slate-700 dark:text-slate-300">
              <tr className={`border-b border-amber-100 ${picked2 ? "bg-amber-100/60 font-semibold dark:bg-amber-900/40" : ""}`}>
                <td className="px-3 py-2">
                  ② 취득 당시 실지거래가액 + 생산자물가상승분{picked2 && " ← 채택"}
                  <span className="block text-caption font-normal text-amber-700 dark:text-amber-300">
                    실지거래가액 {num(detail.actualBase)} × {detail.ratio.toFixed(4)}
                    {detail.ratioSource === "table"
                      ? ` (${detail.deemedPrevMonth} 지수 ${detail.ppiAtDeemedPrev}를 ${detail.acquisitionMonth} 지수 ${detail.ppiAtAcquisition}로 나눈 비율)`
                      : " (직접 입력 배율)"}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap">{num(detail.clause2Amount)}</td>
              </tr>
              <tr className={`border-b border-amber-100 ${!picked2 ? "bg-amber-100/60 font-semibold dark:bg-amber-900/40" : ""}`}>
                <td className="px-3 py-2">
                  ① 의제취득일 현재 {clause1Label}
                  {!picked2 && " ← 채택"}
                  {detail.clause1Amount === undefined && (
                    <span className="block text-caption font-normal text-amber-700 dark:text-amber-300">
                      미산정 — 취득가액 산정 방식에서 환산·감정·매매사례를 고르고 취득 당시 실지거래가액을 함께 입력하면 견줍니다
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap">
                  {detail.clause1Amount !== undefined ? num(detail.clause1Amount) : "-"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-caption text-amber-700 dark:text-amber-300">
          {picked2
            ? "② 채택 — 필요경비는 개산공제 없이 실제 지출액(자본적지출·양도비)입니다 (소득세법 §97②1호 나목)."
            : detail.clause1Method === "redevelopment166_3"
              ? "① 채택 — 인가전 분 필요경비는 개산공제입니다 (소득세법 시행령 §166③·§163⑥)."
              : "① 채택 — 필요경비는 개산공제(환산취득가액이면 소득세법 §97②2호 단서 비교 포함)입니다."}
        </p>
        <p className="text-caption text-slate-600 dark:text-slate-400">{PRE_DEEMED_PPI_FOOTNOTE}</p>
      </div>
    </ToneCard>
  );
}
