"use client";

/**
 * 분할·다건 lot — 의제취득일 전 매수 건의 취득가액 「많은 것」 비교 카드 (영 §176의2④ · 건별)
 *
 * 값은 전부 엔진 echo(`result.preDeemedLotsDetail` · `lotMatchingDetail.matched[]` 의 `preDeemedSelected`·`preDeemedClause*PerShare`)를
 * 그대로 쓴다 — 매칭·채택·귀속을 화면에서 다시 계산하지 않는다(역산 금지).
 *
 *  · ② 표: 매수 건마다 취득 당시 실가 + 생산자물가상승분(지수비)
 *  · ① 표: (매수 건 × 매도 건) 단위 ①·② 1주당과 채택 — 환산 ①은 매도 건마다 달라 쌍 단위다. 이동평균법은 풀 평균이라 sub-lot 선택이 없다
 *  · 필요경비 귀속: 입력 실비를 양도 주식수 비례로 ① 채택분 몫·그 외 몫에 나눈 근거와 개산공제 — 「법령상 명문 없음」을 고지한다
 * 금액에는 「원」을 붙이지 않는다 — 단위는 헤더에 표기한다(feedback_no_won_suffix).
 */

import type { MatchedSubLot, StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { Frac } from "./shared/FormulaParts";
import { PRE_DEEMED_PPI_FOOTNOTE } from "./PreDeemedAcquisitionResultCard";

type Detail = NonNullable<StockTransferResult["preDeemedLotsDetail"]>;

const num = (n: number) => n.toLocaleString("ko-KR");
/** 이동평균법의 ① 채택 주식수는 풀 비율 안분이라 소수가 될 수 있다 */
const shares = (n: number) => (Number.isInteger(n) ? n : Number(n.toFixed(2))).toLocaleString("ko-KR");
const iso = (d: Date | string) => new Date(d).toISOString().slice(0, 10);
const AMT = "px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap";

export function PreDeemedLotsResultCard({ detail, matched }: { detail: Detail; matched?: MatchedSubLot[] }) {
  const deemedLabel = detail.deemedDate.replace(/-0?/g, ".") + ".";
  const c1 = detail.clause1;
  const method = c1?.method === "sale_case" ? "매매사례가액" : "환산취득가액";
  const lotNo = (lotId?: string) => {
    const hit = detail.lots.find((l) => l.lotId !== undefined && l.lotId === lotId);
    return hit ? `매수 #${hit.lotIndex + 1}` : "-";
  };
  const subLots = (matched ?? []).filter((m) => m.preDeemedSelected !== undefined);
  const st = c1?.settlement;

  return (
    <ToneCard
      tone="amber"
      title="의제취득일 전 매수 건 — 취득가액 「많은 것」 비교 (건별)"
      titleExtra={
        <LawArticleModal
          legalBasis="소득세법 시행령 §176의2"
          label="영 §176의2④"
          className="px-2 py-0.5 rounded-full border text-micro bg-amber-100 text-amber-700 border-amber-200 font-medium"
        />
      }
      bodyClassName="space-y-3"
    >
      <div data-testid="pre-deemed-lots-result-card" className="space-y-3">
        <p className="text-xs text-amber-800 leading-relaxed">
          의제취득일({deemedLabel}) 전에 매수한 건마다 ② 취득 당시 실지거래가액에 생산자물가상승분을 더한 금액
          {c1 ? ` 과 ① 의제취득일 현재 ${method} 중` : " 을"} <strong>{c1 ? "많은 것" : "취득가액으로 합니다"}</strong>
          {c1 ? "을 취득가액으로 합니다." : "."}
        </p>

        {/* ② — 매수 건별 */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs" data-testid="pre-deemed-lots-clause2-table">
            <thead>
              <tr className="border-b border-amber-200 text-amber-700">
                <th className="px-3 py-2 text-left font-semibold">매수 건</th>
                <th className="px-3 py-2 text-left font-semibold">취득월</th>
                <th className="px-3 py-2 text-right font-semibold">입력 1주당 실가 (원)</th>
                <th className="px-3 py-2 text-left font-semibold">지수비 (의제취득일 직전 달 지수 / 취득월 지수)</th>
                <th className="px-3 py-2 text-right font-semibold">② 1주당 (원)</th>
              </tr>
            </thead>
            <tbody className="text-slate-700">
              {detail.lots.map((l) => (
                <tr key={l.lotIndex} className="border-b border-amber-100">
                  <td className="px-3 py-2">매수 #{l.lotIndex + 1}</td>
                  <td className="px-3 py-2">{l.acquisitionMonth}</td>
                  <td className={AMT}>{num(l.originalPerShare)}</td>
                  <td className="px-3 py-2">
                    <Frac top={l.ppiAtDeemedPrev} bottom={l.ppiAtAcquisition} />
                  </td>
                  <td className={AMT}>{num(l.clause2PerShare)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!c1 && (
          <p className="text-xs text-amber-800" data-testid="pre-deemed-lots-clause1-none">
            ① 미산정 — 의제취득일 현재 환산취득가액·매매사례가액을 입력하지 않아 ② 만 적용했습니다. 2단계의 ① 비교 카드에서
            방식을 고르면 견줍니다.
          </p>
        )}

        {c1 && (
          <>
            <p className="text-xs text-amber-800">
              ① {method} — 의제취득일 현재 1주당 기준시가 <strong className="font-mono tabular-nums">{num(c1.deemedStdPerShare)}</strong>
              {c1.method === "estimated" ? " (환산비율의 분자 · 개산공제 기준)" : " (개산공제 기준)"}. ① 채택{" "}
              <strong>{shares(c1.clause1Shares)}</strong>주 · 그 외 <strong>{shares(c1.otherShares)}</strong>주 / 매도{" "}
              <strong>{num(c1.soldShares)}</strong>주.
            </p>

            {c1.pooled ? (
              <p className="text-xs text-amber-800" data-testid="pre-deemed-lots-pooled">
                이동평균법은 매수 건을 합친 풀 평균 단가라 매수 건별 ①·② 선택이 없습니다. ① 환산이 매도 건마다 달라 풀 평균
                단가가 매도마다 달라질 수 있고, ① 채택분은 매도분이 풀을 소진하는 비율로 안분했습니다(주식수 소수 가능).
              </p>
            ) : (
              subLots.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs" data-testid="pre-deemed-lots-sublot-table">
                    <thead>
                      <tr className="border-b border-amber-200 text-amber-700">
                        <th className="px-3 py-2 text-left font-semibold">매수 건</th>
                        <th className="px-3 py-2 text-left font-semibold">매도일</th>
                        <th className="px-3 py-2 text-right font-semibold">매도 주식수</th>
                        <th className="px-3 py-2 text-right font-semibold">① 1주당 (원)</th>
                        <th className="px-3 py-2 text-right font-semibold">② 1주당 (원)</th>
                        <th className="px-3 py-2 text-left font-semibold">채택</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-700">
                      {subLots.map((m, i) => {
                        const p1 = m.preDeemedSelected === "clause1";
                        return (
                          <tr key={i} className={`border-b border-amber-100 ${p1 ? "bg-amber-100/40" : ""}`}>
                            <td className="px-3 py-2">{lotNo(m.acquisitionLotId)}</td>
                            <td className="px-3 py-2">{iso(m.saleDate)}</td>
                            <td className={AMT}>{num(m.buyShares)}</td>
                            <td className={AMT}>
                              {m.preDeemedClause1PerShare !== undefined ? num(m.preDeemedClause1PerShare) : "미산정"}
                            </td>
                            <td className={AMT}>
                              {m.preDeemedClause2PerShare !== undefined ? num(m.preDeemedClause2PerShare) : "-"}
                            </td>
                            <td className="px-3 py-2 font-semibold" data-testid="pre-deemed-lots-selected">
                              {p1 ? "① 채택" : "② 채택"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {c1.unresolvedShares ? (
              <p className="text-xs text-rose-700" data-testid="pre-deemed-lots-unresolved">
                양도 당시 기준시가가 없어 ① 환산을 산정하지 못한 매도 {shares(c1.unresolvedShares)}주는 ②로 계산했습니다.
              </p>
            ) : null}

            {st && (
              <div className="overflow-x-auto" data-testid="pre-deemed-lots-settlement">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-amber-200 text-amber-700">
                      <th className="px-3 py-2 text-left font-semibold">필요경비 귀속</th>
                      <th className="px-3 py-2 text-right font-semibold">금액 (원)</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-700">
                    <tr className="border-b border-amber-100">
                      <td className="px-3 py-2">입력한 실제 필요경비 (자본적지출·양도비)</td>
                      <td className={AMT}>{num(st.totalActualExpenses)}</td>
                    </tr>
                    <tr className="border-b border-amber-100">
                      <td className="px-3 py-2">
                        └ ① 채택분 몫 (양도 주식수 비례 {shares(c1.clause1Shares)} / {num(c1.soldShares)})
                      </td>
                      <td className={AMT}>{num(st.clause1SideActual)}</td>
                    </tr>
                    <tr className="border-b border-amber-100">
                      <td className="px-3 py-2">└ 그 외 몫 (② 채택 · 의제 대상 아닌 건 — 필요경비로 산입)</td>
                      <td className={AMT}>{num(st.otherSideActual)}</td>
                    </tr>
                    <tr className="border-b border-amber-100">
                      <td className="px-3 py-2">
                        개산공제 (의제취득일 기준시가 × ① 채택 주식수 {num(st.estimatedBase)} × 1% — 영 §163⑥4)
                      </td>
                      <td className={AMT}>{num(st.estimatedDeduction)}</td>
                    </tr>
                    <tr className="border-b border-amber-100 bg-amber-100/40 font-semibold">
                      <td className="px-3 py-2">필요경비 (최종)</td>
                      <td className={AMT}>{num(st.expenses)}</td>
                    </tr>
                  </tbody>
                </table>
                {st.swapApplied && (
                  <p className="mt-2 text-xs text-amber-800" data-testid="pre-deemed-lots-swap">
                    §97②2호 단서 적용 — ① 채택분의 (환산취득가액 + 개산공제) {num(st.swapComparison?.estimatedSide ?? 0)}보다 귀속
                    실비 {num(st.clause1SideActual)}가 커 후자를 필요경비로 하고, 해당 환산취득가액 {num(st.swapRemovedAcquisition)}은 양도차익
                    계산에서 차감하지 않습니다(결과의 취득가액은 이를 뺀 값입니다).
                  </p>
                )}
                <p className="mt-2 text-caption text-slate-500" data-testid="pre-deemed-lots-no-statute">
                  ※ 실제 필요경비를 ① 채택분과 그 외로 나누는 기준에 대한 법령상 명문은 없어 양도 주식수 비례로 귀속했습니다.
                </p>
              </div>
            )}
          </>
        )}

        <p className="text-caption text-slate-500">{PRE_DEEMED_PPI_FOOTNOTE}</p>
      </div>
    </ToneCard>
  );
}
