"use client";

/**
 * 모드 2 — 보유 조특법 감면주택 주택수 제외 결과 상세 카드 (§89①3호 의제)
 *
 * ⑦ 결과 카드 — 한국어 풀어쓰기·"원" 끝 미표기·내부 id 미노출.
 * 적격 감면주택은 비과세 판정 주택수에서 제외(violet), 부적격은 사유 표시(rose tone 행).
 * 다주택 중과 주택수는 불변 (R-D 선례) — 하단 안내.
 */

import type { SpecialHouseExclusionResolution } from "@/lib/tax-engine/transfer-reductions/unsold-hybrid-p5";

interface Props {
  detail: SpecialHouseExclusionResolution;
}

export function SpecialHouseExclusionDetailCard({ detail }: Props) {
  if (!detail.entries || detail.entries.length === 0) return null;

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/50 dark:border-violet-800/40 dark:bg-violet-950/20 p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-sm font-semibold text-violet-900 dark:text-violet-200">
          조특법 감면주택 보유 — 주택수 제외
        </p>
        <span className="text-xs rounded-full bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300 px-2 py-0.5 font-medium">
          제외 {detail.excludedCount}채
        </span>
      </div>

      <p className="text-xs text-violet-900/90 dark:text-violet-200/90">
        보유 중인 조특법 감면주택을 1세대 1주택 비과세 판정 주택 수에서 제외합니다 (소득세법
        제89조제1항제3호 의제). 아래 적격 {detail.excludedCount}채가 양도 주택의 비과세 판정에서
        소유주택으로 보지 않습니다.
      </p>

      <div className="space-y-1.5">
        {detail.entries.map((e, i) => (
          <div
            key={i}
            className={
              e.eligible
                ? "rounded border border-violet-100 dark:border-violet-800/30 bg-white/70 dark:bg-white/5 p-2.5 text-xs space-y-1"
                : "rounded border border-rose-200 dark:border-rose-800/40 bg-rose-50/70 dark:bg-rose-950/30 p-2.5 text-xs space-y-1"
            }
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={
                  e.eligible
                    ? "font-medium text-violet-900 dark:text-violet-200"
                    : "font-medium text-rose-900 dark:text-rose-200"
                }
              >
                {e.articleLabel}
              </span>
              <span
                className={
                  e.eligible
                    ? "shrink-0 rounded-full bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300 px-2 py-0.5 font-medium"
                    : "shrink-0 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 px-2 py-0.5 font-medium"
                }
              >
                {e.eligible ? "주택수 제외" : "제외 불가"}
              </span>
            </div>
            {!e.eligible && e.reason && (
              <p className="text-rose-900/90 dark:text-rose-200/90">{e.reason}</p>
            )}
            <p className="text-[10px] text-muted-foreground">근거 조문: {e.legalBasis}</p>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground">
        ※ 다주택 중과세율 판정의 주택 수에는 반영되지 않습니다 (소득세법 시행령 §167의3 별개)
      </p>
    </div>
  );
}
