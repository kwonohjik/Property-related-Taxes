"use client";

/** §45의5 특정법인과의 거래 — 주주별 증여가액 표 + §45의5② 한도 표 */

import { useState } from "react";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { ExpandToggleButton } from "@/components/calc/results/shared/ExpandToggleButton";
import { ScLimitTable } from "@/components/calc/results/ScLimitTable";
import type { SpecificCorpMultiResult, SpecificCorpDonee, ScRelation } from "@/lib/tax-engine/gift-deemed/types";

// ── 관계 라벨 (feedback_no_internal_id_in_result 준수) ──
const RELATION_LABEL: Record<ScRelation, string> = {
  lineal_ascendant: "직계존속",
  lineal_descendant: "직계비속",
  spouse: "배우자",
  sibling: "형제자매",
  other_relative: "기타친족",
  other: "타인",
};

// ── 과세여부 배지 — static Record (feedback_tailwind_static_tone_mapping 준수) ──
const TAXABLE_BADGE_CLS = {
  taxable: "bg-emerald-100 text-emerald-800",
  transaction_not_covered: "bg-rose-100 text-rose-700",
  not_specific_corp: "bg-rose-100 text-rose-700",
  corporate_shareholder: "bg-violet-100 text-violet-700",
  donor_self: "bg-slate-100 text-slate-600",
  non_related: "bg-sky-100 text-sky-700",
  below_threshold: "bg-amber-100 text-amber-700",
} as const;

/**
 * 「계산식」 열 — 🔴 SC-O: 종전에는 `corpProfit × ownershipRatioPct.toFixed(1)%` 로 **UI가 엔진 값을
 * 다시 곱했다**. 두 가지가 동시에 깨졌다.
 *
 *  ① **반올림한 지분율로 재계산**하니 옆 칸의 증여재산가액과 맞지 않았다. 엔진은 정확분수로
 *     계산하는데 소수 1자리로 접은 비율을 곱하면 수백만원이 어긋난다.
 *  ② **`gain`이 0으로 영점처리된 행**(법인주주 `corporate_shareholder` — SC-5-c 이후 `donor_self`는
 *     gain을 **보존**한다. 증여자 행은 안분액과 배지를 함께 보이는 것이 설계 정본이다)
 *     에서도 곱셈을 그대로 그려, 「2,415,000,000×20.0%」 옆에 「0」이 찍히는 **거짓 등식**이 됐다.
 *
 * ⇒ 재계산하지 않고 **엔진이 쓴 원천 수량**을 그대로 보인다. 직접분은 주식수 분수라 반올림이
 *   없고(법 §45의5① 「주식보유비율을 곱하여」), 간접분이 섞일 때만 비율로 적되 자릿수를 늘린다.
 *   영점처리된 행은 곱셈을 그리지 않는다 — 제외 사유는 「과세여부」 배지가 이미 말한다.
 */
function formulaText(corpProfit: number, d: SpecificCorpDonee): string {
  if (d.gain === 0 && !d.isTaxable) return "산입 제외";
  const direct = d.totalShares > 0 ? `${d.shares.toLocaleString()}/${d.totalShares.toLocaleString()}` : "0";
  const base = formatKRW(corpProfit);
  return d.indirectRatioPct > 0
    ? `${base} × (직접 ${direct} + 간접 ${d.indirectRatioPct.toFixed(4)}%)`
    : `${base} × ${direct}`;
}

function taxabilityBadge(donee: SpecificCorpDonee): { cls: string; label: string } {
  if (donee.isTaxable) return { cls: TAXABLE_BADGE_CLS.taxable, label: "과세" };
  switch (donee.nonTaxableReason) {
    case "transaction_not_covered": return { cls: TAXABLE_BADGE_CLS.transaction_not_covered, label: "§45의5① 거래 아님" };
    case "not_specific_corp": return { cls: TAXABLE_BADGE_CLS.not_specific_corp, label: "특정법인 아님" };
    case "corporate_shareholder": return { cls: TAXABLE_BADGE_CLS.corporate_shareholder, label: "법인주주 — 개인에 간접 귀속" };
    case "donor_self":      return { cls: TAXABLE_BADGE_CLS.donor_self,      label: "본인증여 제외" };
    case "non_related":     return { cls: TAXABLE_BADGE_CLS.non_related,     label: "비특수관계인 제외" };
    case "below_threshold": return { cls: TAXABLE_BADGE_CLS.below_threshold, label: "1억 미만 제외" };
    default:                return { cls: TAXABLE_BADGE_CLS.donor_self,      label: "제외" };
  }
}

export function SpecificCorpMultiResultView({
  multi,
  selectedDoneeIndex,
  onSelectDonee,
}: {
  multi: SpecificCorpMultiResult;
  selectedDoneeIndex: number;
  onSelectDonee: (i: number) => void;
}) {
  const [openLimit, setOpenLimit] = useState(true);
  const taxableDonees = multi.donees.filter((d) => d.isTaxable);

  // 한도 표: 선택 인덱스 → 과세 수증자 중 해당 인덱스 (범위 초과 시 첫 과세자 fallback)
  const selectedDonee: SpecificCorpDonee | undefined = taxableDonees[selectedDoneeIndex] ?? taxableDonees[0];
  const limitCalc = selectedDonee?.limitCalc;

  return (
    <>
      {/* ── 카드1: 특정법인의 이익 + 주주별 증여재산가액 표 ── */}
      <div
        className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4"
        data-testid="sc-multi-matrix"
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-emerald-800">
            주주별 증여재산가액 (§45의5①)
          </p>
          <LawArticleModal legalBasis="상증법 §45의5" />
        </div>

        {/* 특정법인의 이익 요약 */}
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span>특정법인의 이익</span>
          <span className="font-mono font-semibold tabular-nums text-emerald-800">
            {formatKRW(multi.corpProfit)}
          </span>
          <span className="text-emerald-600">
            (거래이익 − 법인세 안분 {formatKRW(multi.corpTaxApportioned)})
          </span>
        </div>

        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-xs text-emerald-700 border-b border-emerald-200">
              <th className="py-1 text-left font-medium">성명</th>
              <th className="py-1 text-left font-medium">관계</th>
              <th className="py-1 text-right font-medium">주식수</th>
              <th className="py-1 text-right font-medium">지분율</th>
              <th className="py-1 text-right font-medium">계산식</th>
              <th className="py-1 text-right font-medium">증여재산가액</th>
              <th className="py-1 text-right font-medium">과세여부</th>
            </tr>
          </thead>
          <tbody>
            {multi.donees.map((d, i) => {
              const badge = taxabilityBadge(d);
              const displayName = d.name.trim() || RELATION_LABEL[d.relation];
              return (
                <tr
                  key={i}
                  className="border-t border-emerald-100 align-top"
                  data-testid={`sc-multi-donee-${i}`}
                >
                  <td className="py-1.5 pr-2 font-medium text-emerald-900">{displayName}</td>
                  <td className="py-1.5 pr-2 text-muted-foreground">
                    {RELATION_LABEL[d.relation]}
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                    {d.shares.toLocaleString()}
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap text-xs">
                    {d.ownershipRatioPct.toFixed(1)}%
                    {d.indirectRatioPct > 0 && (
                      <span
                        className="block text-caption text-violet-700"
                        data-testid={`sc-multi-ratio-split-${i}`}
                      >
                        직접 {d.directRatioPct.toFixed(1)} + 간접 {d.indirectRatioPct.toFixed(1)}
                      </span>
                    )}
                  </td>
                  <td
                    className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap text-xs text-muted-foreground"
                    data-testid={`sc-multi-formula-${i}`}
                  >
                    {formulaText(multi.corpProfit, d)}
                  </td>
                  <td
                    className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap font-semibold"
                    data-testid={`sc-multi-gain-${i}`}
                  >
                    {formatKRW(d.gain)}
                  </td>
                  <td className="py-1.5 pl-2 text-right whitespace-nowrap">
                    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {taxableDonees.length > 0 && (
          <p className="mt-2 text-caption text-muted-foreground" data-testid="sc-per-donee-notice">
            지배주주등은 이익을 «각각» 증여받은 것으로 보므로(상증령 §34의5⑨) 수증자별로
            <b> 별도 신고</b>가 필요합니다. 「이 금액으로 증여세 계산하기」는 아래에서 선택한{" "}
            <b>{selectedDonee ? selectedDonee.name.trim() || RELATION_LABEL[selectedDonee.relation] : "수증자"}</b>의{" "}
            <b className="font-mono tabular-nums">{formatKRW(selectedDonee?.gain ?? 0)}</b> 1건만 이관합니다.
          </p>
        )}
      </div>

      {/* ── 카드2: §45의5② 한도 표 (과세 수증자가 있을 때만) ── */}
      {taxableDonees.length > 0 && (
        <div
          className="rounded-lg border border-violet-200 bg-violet-50/40 p-4"
          data-testid="sc-multi-limit"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-violet-800">
                증여세 한도 (§45의5②) — 수증자:
              </p>
              {/* 과세 수증자 선택 드롭다운 */}
              <select
                value={selectedDoneeIndex}
                onChange={(e) => onSelectDonee(Number(e.target.value))}
                data-testid="sc-multi-donee-selector"
                className="rounded-md border border-violet-300 bg-white dark:bg-gray-900 px-2 py-0.5 text-sm text-violet-900 focus:outline-none focus:border-violet-400"
              >
                {taxableDonees.map((d, i) => (
                  <option key={i} value={i}>
                    {d.name.trim() || RELATION_LABEL[d.relation]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <LawArticleModal legalBasis="상증법 §45의5②" />
              <ExpandToggleButton
                open={openLimit}
                onClick={() => setOpenLimit(!openLimit)}
                tone="violet"
              />
            </div>
          </div>

          <div className={openLimit ? "mt-3 block" : "mt-3 hidden print:block"}>
            <ScLimitTable limitCalc={limitCalc} />
          </div>
        </div>
      )}
    </>
  );
}
