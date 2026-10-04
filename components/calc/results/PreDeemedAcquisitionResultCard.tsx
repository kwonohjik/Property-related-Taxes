"use client";

/**
 * 의제취득일 전 매수 — 영 §176의2④ 「많은 것」 비교 카드 (Z-1)
 *
 * 취득가액이 입력한 실가보다 커지거나 환산·매매사례가액이 아닌 이유를 결과 계층이 설명한다.
 * ② 채택이면 필요경비가 실비(법 §97②1호 나목), ① 채택이면 개산공제(§97②2호)라는 점까지 보여 준다.
 * 금액에는 「원」을 붙이지 않는다 — 단위는 헤더에 표기한다.
 */

import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";

type Detail = NonNullable<StockTransferResult["preDeemedAcquisitionDetail"]>;

const num = (n: number) => n.toLocaleString("ko-KR");

export function PreDeemedAcquisitionResultCard({ detail }: { detail: Detail }) {
  const picked2 = detail.selected === "clause2";
  const clause1Label = detail.clause1Method === "sale_case" ? "매매사례가액" : "환산취득가액";
  const deemedLabel = detail.deemedDate.replace(/-0?/g, ".") + ".";

  return (
    <ToneCard
      tone="amber"
      title="의제취득일 전 취득 — 취득가액 「많은 것」 비교"
      titleExtra={
        <LawArticleModal
          legalBasis="소득세법 시행령 §176의2"
          label="영 §176의2④"
          className="px-2 py-0.5 rounded-full border text-micro bg-amber-100 text-amber-700 border-amber-200 font-medium"
        />
      }
      bodyClassName="space-y-3"
    >
      <div data-testid="pre-deemed-result-card" className="space-y-3">
        <p className="text-xs text-amber-800 leading-relaxed">
          의제취득일({deemedLabel}) 전에 취득했으므로 ② 취득 당시 실지거래가액에 생산자물가상승분을 더한 금액과
          ① 의제취득일 현재 {clause1Label} 중 <strong>많은 것</strong>을 취득가액으로 합니다.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-amber-200 text-amber-700">
                <th className="px-3 py-2 text-left font-semibold">구분</th>
                <th className="px-3 py-2 text-right font-semibold">금액 (원)</th>
              </tr>
            </thead>
            <tbody className="text-slate-700">
              <tr className={`border-b border-amber-100 ${picked2 ? "bg-amber-100/60 font-semibold" : ""}`}>
                <td className="px-3 py-2">
                  ② 취득 당시 실가 + 생산자물가상승분{picked2 && " ← 채택"}
                  <span className="block text-caption font-normal text-amber-700">
                    실가 {num(detail.actualBase)} × {detail.ratio !== undefined ? detail.ratio.toFixed(4) : "-"}
                    {detail.ratioSource === "table" &&
                      ` (${detail.deemedPrevMonth} 지수 ${detail.ppiAtDeemedPrev}를 ${detail.acquisitionMonth} 지수 ${detail.ppiAtAcquisition}로 나눈 비율)`}
                    {detail.ratioSource === "override" && " (직접 입력 배율)"}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap">
                  {detail.clause2Amount !== undefined ? num(detail.clause2Amount) : "-"}
                </td>
              </tr>
              <tr className={`border-b border-amber-100 ${!picked2 ? "bg-amber-100/60 font-semibold" : ""}`}>
                <td className="px-3 py-2">
                  ① 의제취득일 현재 {clause1Label}
                  {!picked2 && " ← 채택"}
                  {detail.clause1Amount === undefined && (
                    <span className="block text-caption font-normal text-amber-700">
                      미입력 — 환산취득가·매매사례가액과 취득 당시 실가를 함께 입력하면 견줍니다
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

        <p className="text-caption text-amber-700">
          {picked2
            ? "② 채택 — 필요경비는 개산공제 없이 실제 지출액(자본적지출·양도비)입니다 (법 §97②1호 나목)."
            : "① 채택 — 필요경비는 개산공제(환산취득가액이면 §97②2호 단서 비교 포함)입니다."}
        </p>
        <p className="text-caption text-slate-500">
          ※ 생산자물가지수는 한국은행 통계(2020=100)이며 소수 둘째 자리까지입니다. 당시 고시 기준년과 배율이
          미세하게 다를 수 있습니다 (소득세법 시행규칙 §85의2).
        </p>
      </div>
    </ToneCard>
  );
}
