"use client";

/**
 * 부담부증여 평가 명세 + Phase 2 증여세 상세 카드.
 * TransferTaxResultView.tsx 800줄 정책으로 sibling 분리.
 *
 * 표시 항목:
 *  - 상증법 §60~§66 Max 평가 (보충적·담보·임대 + 채택 강조)
 *  - 채무비율·인수채무액·무상이전분
 *  - Phase 2: 증여세 통합 (공제·과표·산출세액·신고세액공제·결정세액)
 */

import type { TransferBurdenedGiftBreakdown } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

const SELECTED_LABEL: Record<string, string> = {
  supplementary: "보충적평가 (상증법 §61)",
  mortgage: "담보평가 (상증법 §66)",
  rental: "임대평가 (상증법 §61⑤ · 시행령 §50⑦)",
};

const RELATION_LABEL: Record<string, string> = {
  spouse: "배우자",
  lineal_descendant: "직계비속",
  lineal_ascendant_adult: "직계존속",
  lineal_ascendant_minor: "직계존속(미성년)",
  other_relative: "기타 친족",
};

interface Props {
  breakdown: TransferBurdenedGiftBreakdown;
}

export function BurdenedGiftDetailCard({ breakdown: bg }: Props) {
  const fmt = (n: number) => n.toLocaleString("ko-KR");
  const rowSelected = (mode: string) =>
    bg.sangjeungbeopValuation.selectedMode === mode
      ? "font-semibold bg-fuchsia-100/70"
      : "";

  return (
    <div className="rounded-lg border border-fuchsia-200 bg-fuchsia-50/40 p-4 space-y-2 print:break-inside-avoid">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-fuchsia-900">
          부담부증여 평가 명세 (소득세법 시행령 §159)
        </p>
        <span className="text-xs text-fuchsia-700 px-2 py-0.5 rounded-full bg-fuchsia-100 border border-fuchsia-300">
          양도세 납세의무자: 증여자
        </span>
      </div>
      <table className="w-full text-xs border-collapse">
        <tbody>
          <tr className={rowSelected("supplementary")}>
            <td className="py-1 pr-2">① 보충적평가</td>
            <td className="text-right font-mono">{fmt(bg.sangjeungbeopValuation.supplementary)}원</td>
          </tr>
          <tr className={rowSelected("mortgage")}>
            <td className="py-1 pr-2">② 담보평가</td>
            <td className="text-right font-mono">{fmt(bg.sangjeungbeopValuation.mortgage)}원</td>
          </tr>
          <tr className={rowSelected("rental")}>
            <td className="py-1 pr-2">③ 임대평가</td>
            <td className="text-right font-mono">{fmt(bg.sangjeungbeopValuation.rental)}원</td>
          </tr>
          <tr className="border-t border-fuchsia-300 font-semibold">
            <td className="py-1 pr-2">Max 채택: {SELECTED_LABEL[bg.sangjeungbeopValuation.selectedMode]}</td>
            <td className="text-right font-mono">{fmt(bg.sangjeungbeopValuation.max)}원</td>
          </tr>
          <tr>
            <td className="py-1 pr-2">인수 채무액 (= 양도가액)</td>
            <td className="text-right font-mono">{fmt(bg.assumedDebtAmount)}원</td>
          </tr>
          <tr>
            <td className="py-1 pr-2">채무비율 = 채무액 ÷ 증여가액</td>
            <td className="text-right font-mono">{(bg.debtRatio * 100).toFixed(4)}%</td>
          </tr>
          <tr>
            <td className="py-1 pr-2 text-fuchsia-700">무상이전분 (증여세 과세 가액)</td>
            <td className="text-right font-mono text-fuchsia-700">{fmt(bg.gratuitousPortion)}원</td>
          </tr>
          {bg.giftTax && (
            <>
              <tr className="border-t border-fuchsia-300">
                <td className="py-1 pr-2 font-semibold text-fuchsia-900">
                  증여세 (수증자 자진납부) — 상증법 §53·§56·§69
                </td>
                <td />
              </tr>
              <tr>
                <td className="py-1 pr-2 pl-3">
                  {"  └ 증여재산공제 ("}
                  {RELATION_LABEL[bg.giftTax.donorRelation] ?? "기타"}
                  {")"}
                </td>
                <td className="text-right font-mono">{fmt(bg.giftTax.deduction)}원</td>
              </tr>
              <tr>
                <td className="py-1 pr-2 pl-3">{"  └ 증여세 과세표준"}</td>
                <td className="text-right font-mono">{fmt(bg.giftTax.taxBase)}원</td>
              </tr>
              <tr>
                <td className="py-1 pr-2 pl-3">{"  └ 증여세 산출세액"}</td>
                <td className="text-right font-mono">{fmt(bg.giftTax.computedTax)}원</td>
              </tr>
              <tr>
                <td className="py-1 pr-2 pl-3">{"  └ 신고세액공제 (3%)"}</td>
                <td className="text-right font-mono">-{fmt(bg.giftTax.filingCredit)}원</td>
              </tr>
              <tr className="font-semibold bg-fuchsia-100/70">
                <td className="py-1 pr-2">증여세 결정세액 (수증자 부담)</td>
                <td className="text-right font-mono">{fmt(bg.giftTax.finalTax)}원</td>
              </tr>
            </>
          )}
        </tbody>
      </table>
      <p className="text-xs text-fuchsia-600 mt-2">
        ※ 자산별 양도가액·취득가액은 위 Max 평가액을 분모로 채무비율 안분 (소령 §159 ① 1호·2호).
        증여세는 무상이전분에 대해 수증자가 별도 신고.
      </p>
    </div>
  );
}
