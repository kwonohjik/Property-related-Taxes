"use client";

/**
 * 차감형 감면(§99 신축주택 IMF 1차 · §98의8 준공후미분양 50%) — 결과 상세 카드 (P1, 2026-06-11)
 *
 * ⑦ 결과 카드 — 한국어 풀어쓰기·"원" 끝 미표기·내부 id 미노출.
 * 두 조문이 result 구조 동형(차감액·5년 분기·formulaSteps·농특세)이라 공용 카드 1개로 처리.
 * eligible: emerald + 산식 단계 + 농특세 + 중과 배제 각주. 불적용: rose + 사유 목록.
 */

import type {
  New99Result,
  Unsold988Result,
  UnsoldHybridResult,
} from "@/lib/tax-engine/types/transfer.types";

type Detail =
  | { kind: "new_99"; result: New99Result }
  | { kind: "unsold_98_8"; result: Unsold988Result }
  | { kind: "unsold_98_7"; result: UnsoldHybridResult }
  | { kind: "unsold_99_2"; result: UnsoldHybridResult };

const TITLES: Record<Detail["kind"], string> = {
  new_99: "§99 — 신축주택 양도소득세 감면 (IMF 1차)",
  unsold_98_8: "§98의8 — 준공후미분양주택 50% 공제",
  unsold_98_7: "§98의7 — 미분양주택 과세특례 (9억 이하)",
  unsold_99_2: "§99의2 — 신축주택등 과세특례 (신축·미분양·1세대1주택)",
};

export function IncomeDeductionDetailCard({ kind, result }: Detail) {
  const title = TITLES[kind];
  // P2 하이브리드 — 5년 내 양도 = 세액감면 경로 (소득금액 차감 아님)
  const isTaxAmountMode =
    (kind === "unsold_98_7" || kind === "unsold_99_2") &&
    (result as UnsoldHybridResult).effectCategory === "tax_amount";
  if (!result.isEligible) {
    return (
      <div className="rounded-lg border border-rose-300 bg-rose-50/80 dark:border-rose-700/50 dark:bg-rose-950/30 p-4 space-y-3">
        <p className="text-sm font-semibold text-rose-900 dark:text-rose-200">{title} — 적용 불가</p>
        {result.ineligibleReasons.length > 0 && (
          <div className="rounded border border-rose-200 bg-white/70 dark:border-rose-800/40 dark:bg-rose-950/40 p-2.5 space-y-1">
            <p className="text-xs font-semibold text-rose-800 dark:text-rose-300">적용 불가 사유</p>
            <ul className="text-xs text-rose-900 dark:text-rose-200 space-y-0.5 pl-4 list-disc">
              {result.ineligibleReasons.map((r, i) => (
                <li key={i}>{r.message}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-[10px] text-rose-700 dark:text-rose-400">근거 조문: {result.legalBasis}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/40 dark:bg-emerald-950/20 p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">{title}</p>
        <span className="text-xs rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 px-2 py-0.5 font-medium">
          {result.isWithin5Years
            ? isTaxAmountMode
              ? "취득 후 5년 이내 — 100% 세액감면"
              : "취득 후 5년 이내 양도"
            : "취득 후 5년 경과 양도"}
        </span>
        {kind === "new_99" && (result as New99Result).redevelopedVariantApplied && (
          <span className="text-xs rounded-full bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300 px-2 py-0.5 font-medium">
            재개발·재건축 신축주택 안분
          </span>
        )}
      </div>

      <div className="rounded border border-emerald-200 bg-white/70 dark:border-emerald-800/40 dark:bg-emerald-950/40 p-2.5 space-y-1.5">
        {result.formulaSteps.map((s, i) => (
          <div key={i} className="text-xs">
            <span className="font-medium text-emerald-900 dark:text-emerald-200">{s.label}</span>
            {s.formula && (
              <p className="text-[11px] text-emerald-800/80 dark:text-emerald-300/80 mt-0.5">{s.formula}</p>
            )}
          </div>
        ))}
        <div className="border-t border-emerald-200 dark:border-emerald-800/40 pt-1.5 flex items-baseline justify-between">
          <span className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
            {isTaxAmountMode ? "감면세액 (산출세액의 100%)" : "과세대상소득금액에서 차감한 양도소득금액"}
          </span>
          <span className="text-sm font-bold text-emerald-900 dark:text-emerald-100 font-mono tabular-nums">
            {isTaxAmountMode
              ? (result as UnsoldHybridResult).reductionAmount.toLocaleString()
              : result.reducibleTransferIncome.toLocaleString()}
          </span>
        </div>
      </div>

      {result.ruralSurtax > 0 && (
        <div className="rounded-md border border-sky-200 bg-sky-50 dark:border-sky-800/40 dark:bg-sky-950/30 px-3 py-2">
          <p className="text-[11px] text-sky-900 dark:text-sky-300">
            농어촌특별세: 감면세액 {result.taxReductionForRuralSurtax.toLocaleString()} × 20% ={" "}
            {result.ruralSurtax.toLocaleString()} (농어촌특별세법 §5 — 총 납부세액에 합산)
          </p>
        </div>
      )}

      <p className="text-[10px] text-emerald-700 dark:text-emerald-400">
        근거 조문: {result.legalBasis} · 본 감면 주택 양도 시 다주택 중과세율은 적용되지 않습니다
        (소득세법 시행령 §167의3①5호·§167의10①2호)
      </p>
    </div>
  );
}
