"use client";

/**
 * 겸용주택 상속·증여 취득가액 — 소득세법 시행령 §163⑨ 단서 **자산 합계 비교** 결과 (PR-6 · 계획서
 * `inheritance-pre-deemed-clause-b-revisit.plan.md` §17). 엔진 echo `sec163_9Comparison`을 그대로 그린다.
 */
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import type { MixedSec163_9Comparison } from "@/lib/tax-engine/types/transfer-mixed-use.types";

type Key = MixedSec163_9Comparison["selected"];

/** 후보 이름 — 결과 산식 문구(`mixedSec163_9PartFormula`)와 같은 이름을 쓴다. */
export function mixedSec163_9CandidateLabel(cmp: MixedSec163_9Comparison, key: Key): string {
  if (key === "reported") return `① ${cmp.cause === "gift" ? "증여세" : "상속세"} 신고가액`;
  if (key === "standard") {
    if (cmp.era === "pre_deemed") return "② §164 기준시가(의제취득일)";
    // 상가분이 단서 밖이면(Q-22) 이 후보의 상가분은 §164 가액이 아니라 ①(없으면 보충적 평가)이다
    return cmp.commercialOutsideClause ? "② 주택분 §164 기준시가 + 상가분 ①" : "② §164 기준시가";
  }
  return "③ 환산취득가액";
}

/** 주택분·상가분 취득가액 행의 산식 문구 — 어느 후보가 자산 합계 비교에서 이겨 이 값이 됐는지. */
export function mixedSec163_9PartFormula(cmp: MixedSec163_9Comparison, side: "housing" | "commercial", value: number): string {
  const part = side === "housing" ? "주택분" : "상가분";
  return `자산 합계 비교에서 ${mixedSec163_9CandidateLabel(cmp, cmp.selected)} 채택 — ${part} ${formatKRW(value)} (소득세법 시행령 §163⑨)`;
}

/** `burdenedGift` — 겸용 부담부증여(소령 §159): 후보 금액은 채무비율을 곱하기 전이다(사용자 결정 Q-36 · PR-7b-7a-2). */
export function MixedSec163_9ComparisonCard({ cmp, burdenedGift }: { cmp: MixedSec163_9Comparison; burdenedGift?: boolean }) {
  const rows: { key: Key; v: MixedSec163_9Comparison["reported"] }[] = [
    { key: "reported", v: cmp.reported },
    { key: "standard", v: cmp.standard },
    ...(cmp.era === "pre_deemed" ? [{ key: "converted" as const, v: cmp.converted }] : []),
  ];
  return (
    <div data-testid="mixed-sec163-9-comparison">
      <ToneCard
        tone="violet"
        title={cmp.era === "pre_deemed" ? "취득가액 — 의제취득일(1985.1.1.) 전 상속·증여 합계 비교" : "취득가액 — 개별주택가격 공시 전 상속·증여 합계 비교"}
        titleExtra={<LawArticleModal legalBasis="소득세법 시행령 §163 ⑨" label="소령 §163⑨" />}
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="text-caption text-violet-700 dark:text-violet-300">
              <th className="py-0.5 text-left font-normal">후보</th>
              <th className="py-0.5 text-right font-normal">주택분</th>
              <th className="py-0.5 text-right font-normal">상가분</th>
              <th className="py-0.5 text-right font-normal">합계</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ key, v }) => {
              const chosen = key === cmp.selected;
              return (
                <tr key={key} data-candidate={key} className={chosen ? "font-semibold text-violet-900 dark:text-violet-100" : ""}>
                  <td className="py-0.5">
                    {mixedSec163_9CandidateLabel(cmp, key)}
                    {chosen && <span className="ml-1 text-xs">← 채택</span>}
                  </td>
                  {v ? (
                    <>
                      <td className="py-0.5 text-right font-mono tabular-nums whitespace-nowrap">{formatKRW(v.housing)}</td>
                      <td className="py-0.5 text-right font-mono tabular-nums whitespace-nowrap">{formatKRW(v.commercial)}</td>
                      <td className="py-0.5 text-right font-mono tabular-nums whitespace-nowrap">{formatKRW(v.total)}</td>
                    </>
                  ) : (
                    <td colSpan={3} className="py-0.5 text-right text-xs text-violet-700 dark:text-violet-300">
                      {cmp.uncomparedReason ? "비교하지 않음" : key === "reported" ? "신고가액 미입력 — 비교하지 않음" : "비교하지 않음"}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-xs text-violet-800 dark:text-violet-200">
          주택분·상가분 취득가액을 합한 금액으로 비교해 가장 큰 후보를 씁니다(같으면 ①·② 우선). 취득가액만 비교하며,
          ③이 채택되면 실제 필요경비 대신 개산공제(소득세법 시행령 §163⑥)를 적용합니다 — 다만 자본적지출·양도비가
          「③ + 개산공제」보다 크면 그 금액을 씁니다(소득세법 §97②2호 단서).
          {cmp.commercialOutsideClause && " 상가분은 건물 기준시가 고시(2001.1.1.) 뒤 취득이라 §163⑨ 단서 밖이어서 ①·② 후보 모두 신고가액(없으면 보충적 평가)을 씁니다."}
        </p>
        {burdenedGift && (
          <p className="text-xs text-violet-800 dark:text-violet-200" data-testid="mixed-sec163-9-bg-note">
            부담부증여 — 위 금액은 채무비율을 곱하기 전 취득가액입니다. 채택된 후보의 주택분·상가분에 각각 그 쪽 채무비율을 곱합니다(소득세법 시행령 §159①1호).
          </p>
        )}
        {cmp.uncomparedReason && (
          <p className="text-xs text-violet-800 dark:text-violet-200">{cmp.uncomparedReason}</p>
        )}
      </ToneCard>
    </div>
  );
}
