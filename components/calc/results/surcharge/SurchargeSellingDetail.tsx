"use client";

/**
 * D1 양도 예정 주택 상세 — 응답 설명문(`narrative`)을 교재 판정 순서(①~⑥)대로 번호 매겨 그린다(계획서 §5.5 · P7).
 * 화면은 문장을 만들지 않는다(T5). 주택별 서술의 `houseId`만 화면 명부 순번(「보유 주택 N」)으로 바꾼다.
 */
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { countExclusionHouseRef } from "@/components/calc/results/transfer/count-exclusion-house-ref";
import type { SurchargeNarrative } from "@/lib/tax-engine/multi-house-surcharge-narrative-steps";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧"];

export function SurchargeSellingDetail({
  narrative,
  formHouses,
}: {
  narrative: SurchargeNarrative;
  formHouses: readonly HouseEntry[];
}) {
  const nameOf = (id: string) => (id === "selling" ? "양도 예정 주택" : (countExclusionHouseRef(formHouses, id) ?? "보유 주택"));
  return (
    <div data-testid="surcharge-selling-detail" className="space-y-4">
      <ol className="space-y-3">
        {narrative.steps.map((step, i) => (
          <li
            key={step.id}
            data-testid={`surcharge-step-${step.id}`}
            className={`rounded-lg border px-3 py-2 ${
              step.decisive ? "border-violet-400 bg-violet-50 dark:border-violet-700 dark:bg-violet-950/30" : "border-border"
            }`}
          >
            <p className="text-sm font-semibold">
              {CIRCLED[i]} {step.title} — {step.verdict}
              {step.decisive && <span className="ml-2 text-violet-700 dark:text-violet-300">(여기서 결론)</span>}
            </p>
            {step.sentences.map((s) => (
              <p key={s} className="mt-1 text-sm leading-relaxed">
                {s}
              </p>
            ))}
            {step.houseNotes.length > 0 && (
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
                {step.houseNotes.map((n) => (
                  <li key={`${n.houseId}-${n.text}`}>
                    {nameOf(n.houseId)}: {n.text}
                  </li>
                ))}
              </ul>
            )}
            {step.basis.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {step.basis.map((b) => (
                  <LawArticleModal key={b} legalBasis={b} label={b} />
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>
      {narrative.checks.length > 0 && (
        <div data-testid="surcharge-checks" className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 dark:border-rose-800 dark:bg-rose-950/30">
          <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">확인이 필요합니다</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-rose-700 dark:text-rose-300">
            {narrative.checks.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
