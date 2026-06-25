"use client";

/** §45의5 특정법인과의 거래 — 주주별 증여가액 표 + §45의5② 한도 표 */

import { useState } from "react";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { ExpandToggleButton } from "@/components/calc/results/shared/ExpandToggleButton";
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
  donor_self: "bg-slate-100 text-slate-600",
  non_related: "bg-sky-100 text-sky-700",
  below_threshold: "bg-amber-100 text-amber-700",
} as const;

function taxabilityBadge(donee: SpecificCorpDonee): { cls: string; label: string } {
  if (donee.isTaxable) return { cls: TAXABLE_BADGE_CLS.taxable, label: "과세" };
  switch (donee.nonTaxableReason) {
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

  // 한도 표: 선택 인덱스 → 과세 수증자 중 해당 인덱스
  const selectedDonee: SpecificCorpDonee | undefined = taxableDonees[selectedDoneeIndex];
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
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap text-xs text-muted-foreground">
                    {formatKRW(multi.corpProfit)}×{d.ownershipRatioPct.toFixed(1)}%
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
                className="rounded-md border border-violet-300 bg-white px-2 py-0.5 text-sm text-violet-900 focus:outline-none focus:border-violet-400"
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
            {limitCalc ? (
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-t border-violet-100">
                    <td className="py-1.5 pr-2 text-muted-foreground">㉮ 일반 산출세액</td>
                    <td
                      className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap"
                      data-testid="sc-limit-computed-tax"
                    >
                      {formatKRW(limitCalc.computedTax)}
                    </td>
                  </tr>
                  <tr className="border-t border-violet-100">
                    <td className="py-1.5 pr-2 text-muted-foreground">
                      ㉠ 직접증여 가정 산출세액 (법인세 차감 전 거래이익을 직접 증여한 것으로 가정)
                    </td>
                    <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                      {formatKRW(limitCalc.directGiftTax)}
                    </td>
                  </tr>
                  <tr className="border-t border-violet-100">
                    <td className="py-1.5 pr-2 text-muted-foreground">
                      ㉡ 법인세 상당액 × 지분율
                    </td>
                    <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                      {formatKRW(limitCalc.corpTaxShare)}
                    </td>
                  </tr>
                  <tr className="border-t border-violet-200 bg-violet-50">
                    <td className="py-1.5 pr-2 font-semibold text-violet-900">
                      ㉯ 한도액 = ㉠ − ㉡
                    </td>
                    <td
                      className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap font-bold text-violet-900"
                      data-testid="sc-limit-amount"
                    >
                      {formatKRW(limitCalc.limitAmount)}
                    </td>
                  </tr>
                  <tr className="border-t border-violet-200">
                    <td className="py-1.5 pr-2 text-muted-foreground">
                      적용 산출세액 = Min(㉮, ㉯)
                    </td>
                    <td
                      className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap font-semibold"
                      data-testid="sc-limit-final-tax"
                    >
                      {formatKRW(limitCalc.finalTax)}
                    </td>
                  </tr>
                  <tr className="border-t border-violet-100">
                    <td className="py-1.5 pr-2 text-muted-foreground">
                      신고세액공제 (3%)
                    </td>
                    <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap text-violet-700">
                      −{formatKRW(limitCalc.filingCredit)}
                    </td>
                  </tr>
                  <tr className="border-t border-violet-300 bg-violet-100/60">
                    <td className="py-2 pr-2 font-bold text-violet-900">자진납부세액</td>
                    <td
                      className="py-2 text-right font-mono tabular-nums whitespace-nowrap text-lg font-bold text-violet-900"
                      data-testid="sc-limit-self-pay-tax"
                    >
                      {formatKRW(limitCalc.selfPayTax)}
                    </td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <p className="text-xs text-muted-foreground">한도 계산 정보를 불러올 수 없습니다.</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
